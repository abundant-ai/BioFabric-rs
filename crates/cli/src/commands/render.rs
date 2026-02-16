//! `biofabric render` — render a layout/session/network input to an image.

use crate::args::RenderArgs;
use biofabric_core::io::display_options::DisplayOptions;
use biofabric_core::io::factory::{FabricFactory, InputFormat};
use biofabric_core::io::session::Session;
use biofabric_core::layout::result::NetworkLayout;
use biofabric_core::layout::traits::{
    LayoutMode, LayoutParams, NetworkLayoutAlgorithm, TwoPhaseLayout,
};
use biofabric_core::layout::{DefaultEdgeLayout, DefaultNodeLayout};
use biofabric_core::model::Network;
use biofabric_core::render::{render_session_to_path, RenderImageOptions};
use biofabric_core::worker::NoopMonitor;

fn export_display_options(base: &DisplayOptions, show_shadows: bool) -> DisplayOptions {
    let mut out = DisplayOptions::for_image_export(show_shadows);
    out.background_color = base.background_color.clone();
    out.node_zone_coloring = base.node_zone_coloring;
    out.node_lighter_level = base.node_lighter_level;
    out.link_darker_level = base.link_darker_level;
    out.min_drain_zone = base.min_drain_zone;
    out.show_annotations = base.show_annotations;
    out.show_annotation_labels = base.show_annotation_labels;
    out.show_node_labels = base.show_node_labels;
    out.show_link_labels = base.show_link_labels;
    out
}

fn build_session_from_network(
    mut network: Network,
    show_shadows: bool,
) -> Result<Session, Box<dyn std::error::Error>> {
    if show_shadows {
        if !network.has_shadows() {
            network.generate_shadows();
        }
    } else {
        network.links_mut().retain(|l| !l.is_shadow);
    }

    let params = LayoutParams {
        include_shadows: show_shadows,
        layout_mode: LayoutMode::PerNetwork,
        ..Default::default()
    };
    let two_phase = TwoPhaseLayout::new(DefaultNodeLayout::new(), DefaultEdgeLayout::new());
    let layout = two_phase.layout(&network, &params, &NoopMonitor)?;

    let mut session = Session::with_layout(network, layout);
    session.display_options = DisplayOptions::for_image_export(show_shadows);
    Ok(session)
}

fn parse_json_as_session(
    input: &std::path::Path,
    show_shadows: bool,
) -> Result<Session, Box<dyn std::error::Error>> {
    let data = std::fs::read_to_string(input)?;

    if let Ok(mut session) = serde_json::from_str::<Session>(&data) {
        if session.layout.is_none() {
            let mut computed = build_session_from_network(session.network.clone(), show_shadows)?;
            computed.display_options =
                export_display_options(&session.display_options, show_shadows);
            return Ok(computed);
        }
        session.display_options = export_display_options(&session.display_options, show_shadows);
        return Ok(session);
    }

    if let Ok(layout) = serde_json::from_str::<NetworkLayout>(&data) {
        let mut session = Session::with_layout(Network::default(), layout);
        session.display_options = DisplayOptions::for_image_export(show_shadows);
        return Ok(session);
    }

    if let Ok(network) = serde_json::from_str::<Network>(&data) {
        return build_session_from_network(network, show_shadows);
    }

    Err(format!(
        "Failed to parse JSON input '{}'. Expected Session JSON, NetworkLayout JSON, or Network JSON.",
        input.display()
    )
    .into())
}

pub fn run(args: RenderArgs, quiet: bool) -> Result<(), Box<dyn std::error::Error>> {
    let show_shadows = args.shadows && !args.no_shadows;
    let mut session = match FabricFactory::detect_format(&args.input) {
        Some(InputFormat::Xml) => {
            let mut s = FabricFactory::load_session(&args.input)?;
            if s.layout.is_none() {
                return Err("Session input has no layout; cannot render image.".into());
            }
            s.display_options = export_display_options(&s.display_options, show_shadows);
            s
        }
        Some(InputFormat::Json) => parse_json_as_session(&args.input, show_shadows)?,
        Some(InputFormat::Sif) | Some(InputFormat::Gw) => {
            let network = FabricFactory::load_network(&args.input)?;
            build_session_from_network(network, show_shadows)?
        }
        Some(InputFormat::Align) => {
            return Err(
                "Alignment map (.align) does not contain renderable network geometry.".into(),
            )
        }
        None => {
            return Err(format!(
                "Unsupported input format '{}'. Use .bif/.xml, .json, .sif, or .gw.",
                args.input.display()
            )
            .into())
        }
    };

    if session.layout.is_none() {
        return Err("Input contains no computed layout; cannot render image.".into());
    }

    session.display_options = export_display_options(&session.display_options, show_shadows);
    let options = RenderImageOptions::new(
        args.width.max(1),
        if args.height == 0 {
            None
        } else {
            Some(args.height)
        },
    );
    render_session_to_path(&session, &args.output, &options)?;

    if !quiet {
        let layout = session.layout.as_ref().expect("checked above");
        eprintln!(
            "Rendered {} ({} rows, {} cols{}) -> {}",
            args.input.display(),
            layout.row_count,
            if show_shadows {
                layout.column_count
            } else {
                layout.column_count_no_shadows
            },
            if show_shadows {
                ", shadows on"
            } else {
                ", shadows off"
            },
            args.output.display()
        );
    }

    Ok(())
}
