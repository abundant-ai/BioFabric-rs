//! `biofabric layout` — compute a layout for a network file.

use crate::args::{
    ClusterOrderMode, ControlOrderMode, LayoutAlgorithm, LayoutArgs, LinkGroupMode, TargetOrderMode,
};
use biofabric_core::io::{attribute, factory::FabricFactory, order};
use biofabric_core::layout::build_data::LayoutBuildData;
use biofabric_core::layout::cluster::{ClusterOrder, NodeClusterLayout};
use biofabric_core::layout::control_top::{ControlOrder, ControlTopLayout, TargetOrder};
use biofabric_core::layout::hierarchy::HierDAGLayout;
use biofabric_core::layout::result::NetworkLayout;
use biofabric_core::layout::set::SetLayout;
use biofabric_core::layout::similarity::NodeSimilarityLayout;
use biofabric_core::layout::traits::{
    EdgeLayout, LayoutMode, LayoutParams, NetworkLayoutAlgorithm, NodeLayout, TwoPhaseLayout,
};
use biofabric_core::layout::{DefaultEdgeLayout, DefaultNodeLayout, WorldBankLayout};
use biofabric_core::model::{Network, NodeId};
use biofabric_core::worker::NoopMonitor;
use std::collections::BTreeSet;
use std::path::Path;

fn map_cluster_order(mode: ClusterOrderMode) -> ClusterOrder {
    match mode {
        ClusterOrderMode::Bfs => ClusterOrder::BreadthFirst,
        ClusterOrderMode::LinkSize => ClusterOrder::LinkSize,
        ClusterOrderMode::NodeSize => ClusterOrder::NodeSize,
        ClusterOrderMode::Name => ClusterOrder::Name,
    }
}

fn map_control_order(mode: ControlOrderMode) -> ControlOrder {
    match mode {
        ControlOrderMode::PartialOrder => ControlOrder::PartialOrder,
        ControlOrderMode::IntraDegree => ControlOrder::IntraDegree,
        ControlOrderMode::MedianTargetDegree => ControlOrder::MedianTargetDegree,
        ControlOrderMode::DegreeOnly => ControlOrder::DegreeOnly,
    }
}

fn map_target_order(mode: TargetOrderMode) -> TargetOrder {
    match mode {
        TargetOrderMode::GrayCode => TargetOrder::GrayCode,
        TargetOrderMode::DegreeOdometer => TargetOrder::DegreeOdometer,
        TargetOrderMode::TargetDegree => TargetOrder::TargetDegree,
        TargetOrderMode::BreadthOrder => TargetOrder::BreadthOrder,
    }
}

fn apply_attribute_table(network: &mut Network, attrs: &attribute::AttributeTable, quiet: bool) {
    let mut missing_nodes = 0usize;
    let mut applied_cells = 0usize;

    for (node_id, attr_map) in &attrs.node_attributes {
        if !network.contains_node(node_id) {
            missing_nodes += 1;
            continue;
        }
        for (key, value) in attr_map {
            if network.set_node_attribute(node_id, key.clone(), value.clone()) {
                applied_cells += 1;
            }
        }
    }

    if !quiet {
        eprintln!(
            "Loaded attributes: {} node rows, {} values applied",
            attrs.len(),
            applied_cells
        );
        if missing_nodes > 0 {
            eprintln!(
                "Warning: {} attribute rows referenced nodes not present in the network",
                missing_nodes
            );
        }
    }
}

fn collect_cluster_assignments(
    network: &Network,
    cluster_attribute: &str,
) -> std::collections::HashMap<NodeId, String> {
    network
        .nodes()
        .filter_map(|node| {
            node.get_attribute(cluster_attribute).and_then(|value| {
                let v = value.trim();
                if v.is_empty() {
                    None
                } else {
                    Some((node.id.clone(), v.to_string()))
                }
            })
        })
        .collect()
}

fn collect_control_nodes_from_attribute(
    network: &Network,
    control_attribute: &str,
    control_value: Option<&str>,
) -> Vec<NodeId> {
    let mut nodes: Vec<NodeId> = network
        .nodes()
        .filter_map(|node| {
            node.get_attribute(control_attribute).and_then(|value| {
                let v = value.trim();
                let is_control = match control_value {
                    Some(want) => v == want,
                    None => !v.is_empty(),
                };
                if is_control {
                    Some(node.id.clone())
                } else {
                    None
                }
            })
        })
        .collect();
    nodes.sort();
    nodes.dedup();
    nodes
}

fn collect_control_nodes_from_links(network: &Network) -> Vec<NodeId> {
    let mut controls: BTreeSet<NodeId> = BTreeSet::new();
    for link in network.links() {
        if !link.is_shadow {
            controls.insert(link.source.clone());
        }
    }
    controls.into_iter().collect()
}

fn layout_from_node_order_file(
    network: &Network,
    node_order_file: &Path,
    params: &LayoutParams,
) -> Result<NetworkLayout, Box<dyn std::error::Error>> {
    let node_order = order::parse_node_order_file(node_order_file)?;
    if node_order.is_empty() {
        return Err("custom node order file is empty".into());
    }

    let mut seen: BTreeSet<NodeId> = BTreeSet::new();
    for node_id in &node_order {
        if !seen.insert(node_id.clone()) {
            return Err(format!("custom node order contains duplicate node '{}'", node_id).into());
        }
    }

    let expected: BTreeSet<NodeId> = network.node_ids().cloned().collect();
    let provided: BTreeSet<NodeId> = node_order.iter().cloned().collect();
    if expected != provided {
        let missing: Vec<String> = expected
            .difference(&provided)
            .take(5)
            .map(|n| n.to_string())
            .collect();
        let extra: Vec<String> = provided
            .difference(&expected)
            .take(5)
            .map(|n| n.to_string())
            .collect();
        return Err(format!(
            "custom node order must list each network node exactly once (missing sample: {:?}, extra sample: {:?})",
            missing,
            extra
        )
        .into());
    }

    let has_shadows = network.has_shadows();
    let mut build_data =
        LayoutBuildData::new(network.clone(), node_order, has_shadows, params.layout_mode);
    let edge_layout = DefaultEdgeLayout::new();
    Ok(edge_layout.layout_edges(&mut build_data, params, &NoopMonitor)?)
}

pub fn run(args: LayoutArgs, quiet: bool) -> Result<(), Box<dyn std::error::Error>> {
    let mut network = FabricFactory::load_network(&args.input)?;

    if let Some(attr_path) = &args.attributes {
        let attrs = attribute::parse_file(attr_path)?;
        apply_attribute_table(&mut network, &attrs, quiet);
    }

    // Generate shadows if requested
    let show_shadows = args.shadows && !args.no_shadows;
    if show_shadows {
        network.generate_shadows();
    }
    network.detect_directed();

    // Build layout params
    let layout_mode = match args.link_group_mode {
        LinkGroupMode::PerNetwork => LayoutMode::PerNetwork,
        LinkGroupMode::PerNode => LayoutMode::PerNode,
    };

    let params = LayoutParams {
        start_node: args.start_node.map(|s| NodeId::new(&s)),
        include_shadows: show_shadows,
        layout_mode,
        link_groups: args.link_group_order.clone(),
        cluster_attribute: args.cluster_attribute.clone(),
        set_attribute: args.set_attribute.clone(),
        control_attribute: args.control_attribute.clone(),
        control_value: args.control_value.clone(),
        ..Default::default()
    };

    let layout_result = if let Some(node_order_file) = &args.node_order {
        if !quiet {
            eprintln!("Using custom node order from {}", node_order_file.display());
        }
        layout_from_node_order_file(&network, node_order_file, &params)?
    } else {
        // Select and run the requested layout algorithm.
        match args.algorithm {
            LayoutAlgorithm::Default => {
                let two_phase =
                    TwoPhaseLayout::new(DefaultNodeLayout::new(), DefaultEdgeLayout::new());
                two_phase.layout(&network, &params, &NoopMonitor)?
            }
            LayoutAlgorithm::Similarity => {
                let two_phase =
                    TwoPhaseLayout::new(NodeSimilarityLayout::default(), DefaultEdgeLayout::new());
                two_phase.layout(&network, &params, &NoopMonitor)?
            }
            LayoutAlgorithm::Hierarchy => {
                let node_layout = HierDAGLayout::new();
                node_layout.criteria_met(&network)?;
                let node_order = node_layout.layout_nodes(&network, &params, &NoopMonitor)?;
                let mut build_data = LayoutBuildData::new(
                    network.clone(),
                    node_order,
                    show_shadows,
                    params.layout_mode,
                );
                let mut layout = DefaultEdgeLayout::new().layout_edges(
                    &mut build_data,
                    &params,
                    &NoopMonitor,
                )?;
                HierDAGLayout::install_node_annotations(&network, &params, &mut layout);
                layout
            }
            LayoutAlgorithm::Cluster => {
                let cluster_attribute = args.cluster_attribute.as_deref().unwrap_or("cluster");
                let assignments = collect_cluster_assignments(&network, cluster_attribute);
                if assignments.is_empty() {
                    return Err(format!(
                        "Cluster layout requires node attributes; no values found for '{}'. Use --attributes and --cluster-attribute.",
                        cluster_attribute
                    )
                    .into());
                }
                let layout = NodeClusterLayout::new(assignments)
                    .with_order(map_cluster_order(args.cluster_order));
                layout.full_layout(&network, &params, &NoopMonitor)?
            }
            LayoutAlgorithm::ControlTop => {
                let control_nodes =
                    if let Some(control_attribute) = args.control_attribute.as_deref() {
                        let controls = collect_control_nodes_from_attribute(
                            &network,
                            control_attribute,
                            args.control_value.as_deref(),
                        );
                        if controls.is_empty() {
                            return Err(format!(
                                "No control nodes matched attribute '{}'{}",
                                control_attribute,
                                args.control_value
                                    .as_ref()
                                    .map(|v| format!(" with value '{}'", v))
                                    .unwrap_or_default()
                            )
                            .into());
                        }
                        controls
                    } else {
                        collect_control_nodes_from_links(&network)
                    };

                let node_layout = ControlTopLayout::new(control_nodes)
                    .with_control_order(map_control_order(args.control_order))
                    .with_target_order(map_target_order(args.target_order));
                node_layout.criteria_met(&network)?;
                let two_phase = TwoPhaseLayout::new(node_layout, DefaultEdgeLayout::new());
                two_phase.layout(&network, &params, &NoopMonitor)?
            }
            LayoutAlgorithm::Set => {
                let mut layout = SetLayout::new();
                if let Some(membership_relation) = args.set_attribute.as_ref() {
                    layout = layout.with_relation(membership_relation.clone());
                }
                layout.full_layout(&network, &NoopMonitor)?
            }
            LayoutAlgorithm::WorldBank => {
                let two_phase =
                    TwoPhaseLayout::new(WorldBankLayout::new(), DefaultEdgeLayout::new());
                two_phase.layout(&network, &params, &NoopMonitor)?
            }
        }
    };

    // Write output
    if let Some(output) = &args.output {
        let ext = output.extension().and_then(|e| e.to_str()).unwrap_or("");
        match ext {
            "json" => {
                let json = serde_json::to_string_pretty(&layout_result)?;
                std::fs::write(output, json)?;
            }
            "bif" | "xml" => {
                let session =
                    biofabric_core::io::session::Session::with_layout(network, layout_result);
                FabricFactory::save_session(&session, output)?;
            }
            _ => {
                return Err(format!(
                    "Unsupported output format '{}'. Use .json, .bif, or .xml",
                    ext
                )
                .into());
            }
        }
        if !quiet {
            eprintln!("Layout written to {}", output.display());
        }
    } else {
        // Print layout JSON to stdout
        let json = serde_json::to_string_pretty(&layout_result)?;
        println!("{}", json);
    }

    Ok(())
}
