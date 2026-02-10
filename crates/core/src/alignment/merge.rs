//! Network merging for alignment visualization.

use super::types::{EdgeType, MergedNodeId, NodeColor};
use crate::io::align::AlignmentMap;
use crate::model::{Network, NodeId};
use crate::worker::ProgressMonitor;
use std::collections::HashMap;

/// The result of merging two networks via an alignment.
#[derive(Debug, Clone)]
pub struct MergedNetwork {
    /// The merged network (nodes use `"G1::G2"` naming convention).
    pub network: Network,

    /// Color classification for each merged node.
    pub node_colors: HashMap<NodeId, NodeColor>,

    /// Edge type classification for each link (by link index in the network).
    pub edge_types: Vec<EdgeType>,

    /// Map from merged node IDs back to their original components.
    pub node_origins: HashMap<NodeId, MergedNodeId>,

    /// Optional per-node correctness metadata.
    pub merged_to_correct: Option<HashMap<NodeId, bool>>,

    /// Number of nodes from G1.
    pub g1_node_count: usize,

    /// Number of nodes from G2.
    pub g2_node_count: usize,

    /// Number of aligned (purple) nodes.
    pub aligned_count: usize,
}

impl MergedNetwork {
    /// Merge two networks using an alignment mapping.
    pub fn from_alignment(
        g1: &Network,
        g2: &Network,
        alignment: &AlignmentMap,
        perfect: Option<&AlignmentMap>,
        _monitor: &dyn ProgressMonitor,
    ) -> Result<Self, String> {
        todo!()
    }

    /// Count of nodes by color.
    pub fn count_by_color(&self, color: NodeColor) -> usize {
        todo!()
    }

    /// Count of edges by type.
    pub fn count_by_edge_type(&self, edge_type: EdgeType) -> usize {
        todo!()
    }

    /// Get the node color for a merged node.
    pub fn node_color(&self, node_id: &NodeId) -> Option<NodeColor> {
        todo!()
    }

    /// Get the original (G1/G2) components for a merged node.
    pub fn node_origin(&self, node_id: &NodeId) -> Option<&MergedNodeId> {
        todo!()
    }

    /// Get the edge type for a link index in the merged network.
    pub fn edge_type(&self, link_index: usize) -> Option<EdgeType> {
        todo!()
    }

    /// Whether a node is aligned (purple).
    pub fn is_aligned_node(&self, node_id: &NodeId) -> bool {
        todo!()
    }

    /// Whether correctness data is available.
    pub fn has_perfect_alignment(&self) -> bool {
        todo!()
    }

    /// Per-node correctness lookup.
    pub fn is_node_correct(&self, node_id: &NodeId) -> Option<bool> {
        todo!()
    }

    /// Count of nodes with positive correctness.
    pub fn correct_count(&self) -> Option<usize> {
        todo!()
    }

    /// Node correctness metric.
    pub fn node_correctness(&self) -> Option<f64> {
        todo!()
    }
}
