//! Network merging for alignment visualization.
//!
//! Given two networks (G1, G2) and an alignment mapping, produces a single
//! merged network where aligned nodes are combined and edges are classified
//! by their alignment status.
//!
//! ## References
//!
//! - Java: `org.systemsbiology.biofabric.plugin.core.align.NetworkAlignment.mergeNetworks()`

use super::types::{EdgeType, MergedNodeId, NodeColor};
use crate::io::align::AlignmentMap;
use crate::model::{Network, NodeId};
use crate::worker::ProgressMonitor;
use std::collections::HashMap;

/// The result of merging two networks via an alignment.
///
/// Contains the merged network plus metadata about each node and edge's
/// alignment classification.
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

    /// Per-node correctness when a perfect (reference) alignment is provided.
    ///
    /// Maps merged node IDs to `true` if the alignment matches the perfect
    /// alignment for that node. Populated only when a perfect alignment is
    /// provided; `None` otherwise.
    ///
    /// For **purple** (aligned) nodes:
    ///   `true` if `alignment[g1] == perfect_alignment[g1]`
    ///
    /// For **blue** (unaligned G1) nodes:
    ///   `true` if the perfect alignment also does NOT align this G1 node
    ///   (i.e., `perfect_alignment[g1]` is `None`)
    ///
    /// Red (G2-only) nodes are not tracked (the Java code doesn't track them
    /// either — correctness is only meaningful for G1 nodes).
    ///
    /// ## References
    ///
    /// - Java: `NetworkAlignment.mergedToCorrectNC_`
    /// - Java: `NetworkAlignment.createMergedNodes()` (line 277)
    /// - Java: `NetworkAlignment.createUnmergedNodes()` (line 322)
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
    ///
    /// # Arguments
    ///
    /// * `g1` — The smaller network
    /// * `g2` — The larger network
    /// * `alignment` — Mapping from G1 node IDs to G2 node IDs
    /// * `perfect` — Optional perfect (reference) alignment for correctness
    ///   tracking. When provided, `merged_to_correct` is populated.
    /// * `monitor` — Progress/cancellation monitor
    ///
    /// # Returns
    ///
    /// A `MergedNetwork` containing the combined graph with classified nodes
    /// and edges.
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

    /// Whether a perfect alignment was provided (i.e., correctness data is available).
    pub fn has_perfect_alignment(&self) -> bool {
        todo!()
    }

    /// Whether a node is correctly aligned/unaligned according to the perfect alignment.
    ///
    /// Returns `None` if no perfect alignment was provided, or if the node
    /// is not tracked (e.g., red/G2-only nodes).
    pub fn is_node_correct(&self, node_id: &NodeId) -> Option<bool> {
        todo!()
    }

    /// Number of correctly aligned/unaligned nodes (from `merged_to_correct`).
    ///
    /// Returns `None` if no perfect alignment was provided.
    pub fn correct_count(&self) -> Option<usize> {
        todo!()
    }

    /// Node correctness (NC) metric: fraction of tracked nodes that are correct.
    ///
    /// NC = |{n : merged_to_correct[n] = true}| / |merged_to_correct|
    ///
    /// Returns `None` if no perfect alignment was provided.
    pub fn node_correctness(&self) -> Option<f64> {
        todo!()
    }
}
