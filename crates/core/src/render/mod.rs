//! Deterministic image rendering for BioFabric layouts/sessions.
//!
//! This module provides a headless raster renderer used by the CLI `render`
//! command and image output paths in other commands (e.g. `align -o out.png`).
//! The renderer consumes the same `Session + DisplayOptions` model as the
//! interactive frontend.
//!
//! Current output support:
//! - PNG
//! - JPEG
//! - TIFF
//!
//! ## Notes
//!
//! - Rendering is deterministic for a given layout + options.
//! - The pass currently focuses on geometry + annotation rectangles.
//! - Text labels are intentionally omitted in this baseline headless renderer.

use crate::error::{BioFabricError, Result};
use crate::io::color::{ColorPalette, FabricColor};
use crate::io::display_options::DisplayOptions;
use crate::io::session::Session;
use crate::layout::result::{LinkLayout, NetworkLayout, NodeLayout};
use image::{ImageFormat, Rgba, RgbaImage};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::Path;

/// Options controlling raster image export.
#[derive(Debug, Clone)]
pub struct RenderImageOptions {
    /// Output image width in pixels.
    pub width: u32,
    /// Output image height in pixels.
    ///
    /// If `None`, height is derived from width and row count.
    pub height: Option<u32>,
    /// Pixel margin around rendered geometry.
    pub margin: u32,
}

impl Default for RenderImageOptions {
    fn default() -> Self {
        Self {
            width: 1920,
            height: None,
            margin: 24,
        }
    }
}

impl RenderImageOptions {
    /// Construct options with explicit width and optional height.
    pub fn new(width: u32, height: Option<u32>) -> Self {
        Self {
            width,
            height,
            ..Default::default()
        }
    }
}

#[derive(Debug, Clone)]
struct RenderTransform {
    width: u32,
    height: u32,
    margin: u32,
    sx: f64,
    sy: f64,
}

impl RenderTransform {
    fn x_center(&self, col: usize) -> i32 {
        (self.margin as f64 + (col as f64 + 0.5) * self.sx).round() as i32
    }

    fn y_center(&self, row: usize) -> i32 {
        (self.margin as f64 + (row as f64 + 0.5) * self.sy).round() as i32
    }

    fn x_start(&self, col: usize) -> i32 {
        (self.margin as f64 + col as f64 * self.sx).floor() as i32
    }

    fn x_end(&self, col_inclusive: usize) -> i32 {
        (self.margin as f64 + (col_inclusive as f64 + 1.0) * self.sx).ceil() as i32 - 1
    }

    fn y_start(&self, row: usize) -> i32 {
        (self.margin as f64 + row as f64 * self.sy).floor() as i32
    }

    fn y_end(&self, row_inclusive: usize) -> i32 {
        (self.margin as f64 + (row_inclusive as f64 + 1.0) * self.sy).ceil() as i32 - 1
    }
}

/// Render a full session to an image file.
pub fn render_session_to_path(
    session: &Session,
    output: &Path,
    options: &RenderImageOptions,
) -> Result<()> {
    let layout = session
        .layout
        .as_ref()
        .ok_or_else(|| BioFabricError::Render("session has no computed layout".to_string()))?;
    render_layout_to_path(layout, &session.display_options, output, options)
}

/// Render a layout + display options to an image file.
pub fn render_layout_to_path(
    layout: &NetworkLayout,
    display: &DisplayOptions,
    output: &Path,
    options: &RenderImageOptions,
) -> Result<()> {
    let image = render_layout_to_image(layout, display, options)?;
    let format = image_format_from_path(output)?;
    image.save_with_format(output, format)?;
    Ok(())
}

/// Render a layout + display options into an in-memory RGBA image.
pub fn render_layout_to_image(
    layout: &NetworkLayout,
    display: &DisplayOptions,
    options: &RenderImageOptions,
) -> Result<RgbaImage> {
    let show_shadows = display.show_shadows;
    let transform = build_transform(layout, show_shadows, options);
    let background = parse_color_string(&display.background_color, FabricColor::rgb(255, 255, 255));
    let mut image = RgbaImage::from_pixel(transform.width, transform.height, to_rgba(background));

    if display.show_annotations {
        draw_annotations(&mut image, layout, display, &transform, show_shadows);
    }

    let palette = ColorPalette::full_palette();
    let node_thickness = display.node_line_width.max(1.0).round() as i32;
    let link_thickness = display.link_line_width.max(1.0).round() as i32;

    // Optional low-alpha node-zone tinting behind geometry.
    if display.node_zone_coloring {
        let mut nodes: Vec<_> = layout.iter_nodes().collect();
        nodes.sort_by_key(|(_, n)| n.row);
        for (node_id, node) in nodes {
            if let Some((min_col, max_col)) = node_span(node, show_shadows) {
                let mut color = node_color(node_id.as_str(), node, &palette, display);
                color.a = 38;
                let x1 = transform.x_start(min_col);
                let x2 = transform.x_end(max_col);
                let y1 = transform.y_start(node.row);
                let y2 = transform.y_end(node.row);
                fill_rect(&mut image, x1, y1, x2, y2, to_rgba(color));
            }
        }
    }

    // Links pass first (behind node horizontals).
    for link in layout.iter_links() {
        if let Some(col) = link_column_for_mode(link, show_shadows) {
            let x = transform.x_center(col);
            let y1 = transform.y_center(link.top_row());
            let y2 = transform.y_center(link.bottom_row());
            let color = link_color(link, &palette, display, show_shadows);
            draw_vertical_line(&mut image, x, y1, y2, to_rgba(color), link_thickness);
        }
    }

    // Nodes pass on top.
    let mut nodes: Vec<_> = layout.iter_nodes().collect();
    nodes.sort_by_key(|(_, n)| n.row);
    for (node_id, node) in nodes {
        if let Some((min_col, max_col)) = node_span(node, show_shadows) {
            let x1 = transform.x_center(min_col);
            let x2 = transform.x_center(max_col);
            let y = transform.y_center(node.row);
            let color = node_color(node_id.as_str(), node, &palette, display);
            draw_horizontal_line(&mut image, x1, x2, y, to_rgba(color), node_thickness);
        }
    }

    Ok(image)
}

fn build_transform(
    layout: &NetworkLayout,
    show_shadows: bool,
    options: &RenderImageOptions,
) -> RenderTransform {
    let width = options.width.max(1);
    let cols = if show_shadows {
        layout.column_count.max(1)
    } else {
        layout.column_count_no_shadows.max(1)
    };
    let rows = layout.row_count.max(1);

    let margin = options.margin.min(width.saturating_div(2));
    let inner_width = width.saturating_sub(margin.saturating_mul(2)).max(1);
    let sx = inner_width as f64 / cols as f64;

    let height = match options.height {
        Some(h) => h.max(1),
        None => {
            let sy_auto = sx.max(1.0);
            let inner_height = (rows as f64 * sy_auto).ceil().max(1.0) as u32;
            inner_height.saturating_add(margin.saturating_mul(2)).max(1)
        }
    };
    let inner_height = height.saturating_sub(margin.saturating_mul(2)).max(1);
    let sy = inner_height as f64 / rows as f64;

    RenderTransform {
        width,
        height,
        margin,
        sx,
        sy,
    }
}

fn image_format_from_path(path: &Path) -> Result<ImageFormat> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "png" => Ok(ImageFormat::Png),
        "jpg" | "jpeg" => Ok(ImageFormat::Jpeg),
        "tif" | "tiff" => Ok(ImageFormat::Tiff),
        _ => Err(BioFabricError::Render(format!(
            "unsupported image extension '{}'; use .png, .jpg/.jpeg, or .tif/.tiff",
            ext
        ))),
    }
}

fn draw_annotations(
    image: &mut RgbaImage,
    layout: &NetworkLayout,
    display: &DisplayOptions,
    tx: &RenderTransform,
    show_shadows: bool,
) {
    // Link annotation bands (vertical).
    let link_annots = if show_shadows {
        &layout.link_annotations
    } else {
        &layout.link_annotations_no_shadows
    };
    for annot in link_annots.iter() {
        let mut color = parse_color_string(&annot.color, hashed_color(&annot.color));
        color.a = 34;
        let x1 = tx.x_start(annot.start);
        let x2 = tx.x_end(annot.end);
        let y1 = tx.margin as i32;
        let y2 = tx.height as i32 - tx.margin as i32 - 1;
        fill_rect(image, x1, y1, x2, y2, to_rgba(color));
    }

    // Node annotation bands (horizontal).
    for annot in layout.node_annotations.iter() {
        let mut color = parse_color_string(&annot.color, hashed_color(&annot.color));
        color.a = if display.show_annotation_labels {
            42
        } else {
            30
        };
        let x1 = tx.margin as i32;
        let x2 = tx.width as i32 - tx.margin as i32 - 1;
        let y1 = tx.y_start(annot.start);
        let y2 = tx.y_end(annot.end);
        fill_rect(image, x1, y1, x2, y2, to_rgba(color));
    }
}

fn node_span(node: &NodeLayout, show_shadows: bool) -> Option<(usize, usize)> {
    if show_shadows {
        if node.has_edges() {
            Some((node.min_col, node.max_col))
        } else {
            None
        }
    } else if node.has_edges_no_shadows() {
        Some((node.min_col_no_shadows, node.max_col_no_shadows))
    } else {
        None
    }
}

fn link_column_for_mode(link: &LinkLayout, show_shadows: bool) -> Option<usize> {
    if show_shadows {
        Some(link.column)
    } else {
        link.column_no_shadows
    }
}

fn node_color(
    node_id: &str,
    node: &NodeLayout,
    palette: &ColorPalette,
    display: &DisplayOptions,
) -> FabricColor {
    let base = if node_id.starts_with("::") {
        FabricColor::rgb(255, 0, 0) // Red
    } else if node_id.ends_with("::") {
        FabricColor::rgb(0, 0, 255) // Blue
    } else if node_id.contains("::") {
        FabricColor::rgb(128, 0, 128) // Purple
    } else {
        palette.get(node.color_index)
    };
    ColorPalette::brighter(base, display.node_lighter_level.clamp(0.0, 1.0))
}

fn link_color(
    link: &LinkLayout,
    palette: &ColorPalette,
    display: &DisplayOptions,
    show_shadows: bool,
) -> FabricColor {
    let base =
        alignment_relation_color(&link.relation).unwrap_or_else(|| palette.get(link.color_index));
    let mut dark = ColorPalette::darker(base, display.link_darker_level.clamp(0.0, 1.0));
    if show_shadows && link.is_shadow {
        dark.a = 110;
    }
    dark
}

fn alignment_relation_color(relation: &str) -> Option<FabricColor> {
    match relation {
        "P" => Some(FabricColor::rgb(128, 0, 128)),
        "pBp" => Some(FabricColor::rgb(0, 0, 255)),
        "pBb" => Some(FabricColor::rgb(0, 200, 255)),
        "bBb" => Some(FabricColor::rgb(0, 0, 139)),
        "pRp" => Some(FabricColor::rgb(255, 0, 0)),
        "pRr" => Some(FabricColor::rgb(255, 165, 0)),
        "rRr" => Some(FabricColor::rgb(139, 0, 0)),
        _ => None,
    }
}

fn named_color(name: &str) -> Option<FabricColor> {
    let key = name
        .trim()
        .to_ascii_lowercase()
        .replace([' ', '_', '-'], "");
    match key.as_str() {
        "black" => Some(FabricColor::rgb(0, 0, 0)),
        "white" => Some(FabricColor::rgb(255, 255, 255)),
        "red" => Some(FabricColor::rgb(255, 0, 0)),
        "darkred" => Some(FabricColor::rgb(139, 0, 0)),
        "blue" => Some(FabricColor::rgb(0, 0, 255)),
        "powderblue" => Some(FabricColor::rgb(176, 224, 230)),
        "darkpowderblue" => Some(FabricColor::rgb(92, 144, 160)),
        "green" => Some(FabricColor::rgb(0, 170, 0)),
        "darkgreen" => Some(FabricColor::rgb(0, 110, 0)),
        "yellow" => Some(FabricColor::rgb(255, 230, 0)),
        "darkyellow" => Some(FabricColor::rgb(184, 160, 0)),
        "orange" => Some(FabricColor::rgb(255, 165, 0)),
        "darkorange" => Some(FabricColor::rgb(205, 110, 0)),
        "peach" => Some(FabricColor::rgb(255, 200, 150)),
        "darkpeach" => Some(FabricColor::rgb(220, 145, 100)),
        "purple" => Some(FabricColor::rgb(128, 0, 128)),
        "darkpurple" => Some(FabricColor::rgb(90, 0, 120)),
        "pink" => Some(FabricColor::rgb(255, 105, 180)),
        "darkpink" => Some(FabricColor::rgb(192, 68, 135)),
        "grayblue" => Some(FabricColor::rgb(132, 152, 184)),
        "darkgrayblue" => Some(FabricColor::rgb(90, 108, 138)),
        _ => None,
    }
}

fn parse_color_string(input: &str, fallback: FabricColor) -> FabricColor {
    let raw = input.trim();
    if raw.is_empty() {
        return fallback;
    }
    if let Some(parsed) = parse_hex_color(raw) {
        return parsed;
    }
    if let Some(parsed) = named_color(raw) {
        return parsed;
    }
    fallback
}

fn hashed_color(name: &str) -> FabricColor {
    let key = name
        .trim()
        .to_ascii_lowercase()
        .replace([' ', '_', '-'], "");
    let mut hasher = DefaultHasher::new();
    key.hash(&mut hasher);
    let idx = hasher.finish() as usize;
    ColorPalette::default_palette().get(idx % 32)
}

fn parse_hex_color(hex: &str) -> Option<FabricColor> {
    let v = hex.trim().trim_start_matches('#');
    match v.len() {
        6 => {
            let r = u8::from_str_radix(&v[0..2], 16).ok()?;
            let g = u8::from_str_radix(&v[2..4], 16).ok()?;
            let b = u8::from_str_radix(&v[4..6], 16).ok()?;
            Some(FabricColor::rgb(r, g, b))
        }
        8 => {
            let r = u8::from_str_radix(&v[0..2], 16).ok()?;
            let g = u8::from_str_radix(&v[2..4], 16).ok()?;
            let b = u8::from_str_radix(&v[4..6], 16).ok()?;
            let a = u8::from_str_radix(&v[6..8], 16).ok()?;
            Some(FabricColor::rgba(r, g, b, a))
        }
        _ => None,
    }
}

fn to_rgba(color: FabricColor) -> Rgba<u8> {
    Rgba([color.r, color.g, color.b, color.a])
}

fn blend_pixel(image: &mut RgbaImage, x: i32, y: i32, color: Rgba<u8>) {
    if x < 0 || y < 0 {
        return;
    }
    let ux = x as u32;
    let uy = y as u32;
    if ux >= image.width() || uy >= image.height() {
        return;
    }
    if color[3] == 255 {
        image.put_pixel(ux, uy, color);
        return;
    }

    let dst = image.get_pixel_mut(ux, uy);
    let src_a = color[3] as f32 / 255.0;
    let dst_a = dst[3] as f32 / 255.0;
    let out_a = src_a + dst_a * (1.0 - src_a);
    if out_a <= f32::EPSILON {
        return;
    }
    for i in 0..3 {
        let src = color[i] as f32 / 255.0;
        let dst_v = dst[i] as f32 / 255.0;
        let out = (src * src_a + dst_v * dst_a * (1.0 - src_a)) / out_a;
        dst[i] = (out * 255.0).round().clamp(0.0, 255.0) as u8;
    }
    dst[3] = (out_a * 255.0).round().clamp(0.0, 255.0) as u8;
}

fn fill_rect(image: &mut RgbaImage, x1: i32, y1: i32, x2: i32, y2: i32, color: Rgba<u8>) {
    let left = x1.min(x2);
    let right = x1.max(x2);
    let top = y1.min(y2);
    let bottom = y1.max(y2);
    for y in top..=bottom {
        for x in left..=right {
            blend_pixel(image, x, y, color);
        }
    }
}

fn draw_vertical_line(
    image: &mut RgbaImage,
    x: i32,
    y1: i32,
    y2: i32,
    color: Rgba<u8>,
    thickness: i32,
) {
    let top = y1.min(y2);
    let bottom = y1.max(y2);
    let width = thickness.max(1);
    let half = width / 2;
    for t in 0..width {
        let dx = t - half;
        let px = x + dx;
        for py in top..=bottom {
            blend_pixel(image, px, py, color);
        }
    }
}

fn draw_horizontal_line(
    image: &mut RgbaImage,
    x1: i32,
    x2: i32,
    y: i32,
    color: Rgba<u8>,
    thickness: i32,
) {
    let left = x1.min(x2);
    let right = x1.max(x2);
    let width = thickness.max(1);
    let half = width / 2;
    for t in 0..width {
        let dy = t - half;
        let py = y + dy;
        for px in left..=right {
            blend_pixel(image, px, py, color);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::layout::result::{LinkLayout, NetworkLayout, NodeLayout};
    use crate::model::NodeId;
    use indexmap::IndexMap;

    fn tiny_layout() -> NetworkLayout {
        let mut layout = NetworkLayout::new();
        let mut a = NodeLayout::new(0, "A");
        a.update_span(0);
        a.update_span(2);
        a.update_span_no_shadows(0);
        a.update_span_no_shadows(1);
        let mut b = NodeLayout::new(1, "B");
        b.update_span(0);
        b.update_span(2);
        b.update_span_no_shadows(0);
        b.update_span_no_shadows(1);
        layout.nodes = IndexMap::from([(NodeId::new("A"), a), (NodeId::new("B"), b)]);
        let mut l0 = LinkLayout::new(0, NodeId::new("A"), NodeId::new("B"), 0, 1, "pp", false);
        l0.column_no_shadows = Some(0);
        layout.links = vec![l0];
        layout.row_count = 2;
        layout.column_count = 1;
        layout.column_count_no_shadows = 1;
        layout
    }

    #[test]
    fn render_layout_produces_pixels() {
        let layout = tiny_layout();
        let display = DisplayOptions::for_image_export(true);
        let options = RenderImageOptions::new(320, Some(180));
        let img = render_layout_to_image(&layout, &display, &options).unwrap();
        assert_eq!(img.width(), 320);
        assert_eq!(img.height(), 180);
    }

    #[test]
    fn parse_hex_works_for_rgb_and_rgba() {
        assert_eq!(
            parse_hex_color("#FF0000").unwrap(),
            FabricColor::rgb(255, 0, 0)
        );
        assert_eq!(
            parse_hex_color("#10203040").unwrap(),
            FabricColor::rgba(16, 32, 48, 64)
        );
    }
}
