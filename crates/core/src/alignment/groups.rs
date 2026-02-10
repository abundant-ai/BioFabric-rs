//! Node group classification for alignment visualization.
//!
//! Each node in the merged network is assigned to a **node group** based on
//! its color (Purple/Blue/Red) and the set of edge types incident to it.
//! For example, a purple node with both COVERED and INDUCED_GRAPH1 edges
//! belongs to group `(P:P/pBp)`.
//!
//! The Java implementation produces 40-76 distinct groups depending on the
//! network. These groups drive both the layout ordering and the color
//! assignments in the visualization.
//!
//! ## References
//!
//! - Java: `org.systemsbiology.biofabric.plugin.core.align.NodeGroupMap`

use super::merge::MergedNetwork;
use super::types::{EdgeType, NodeColor};
use crate::model::NodeId;
use crate::worker::ProgressMonitor;
use std::collections::{BTreeSet, HashMap};

// Java ordering + color map (NodeGroupMap.nodeGroupAnnots / nodeGroupAnnotsPerfectNG)
const NODE_GROUP_ANNOTS: &[(&str, &str)] = &[
    ("(P:0)", "GrayBlue"),
    ("(P:P)", "Orange"),
    ("(P:pBp)", "Yellow"),
    ("(P:pBb)", "DarkPeach"),
    ("(P:pBp/pBb)", "DarkPowderBlue"),
    ("(P:pRp)", "Green"),
    ("(P:P/pBp)", "Purple"),
    ("(P:P/pBb)", "DarkOrange"),
    ("(P:P/pBp/pBb)", "DarkYellow"),
    ("(P:P/pRp)", "Pink"),
    ("(P:pBp/pRp)", "PowderBlue"),
    ("(P:pBb/pRp)", "DarkGreen"),
    ("(P:pBp/pBb/pRp)", "DarkPurple"),
    ("(P:P/pBp/pRp)", "Peach"),
    ("(P:P/pBb/pRp)", "DarkGrayBlue"),
    ("(P:P/pBp/pBb/pRp)", "DarkPink"),
    ("(P:pRr)", "GrayBlue"),
    ("(P:P/pRr)", "Orange"),
    ("(P:pBp/pRr)", "Yellow"),
    ("(P:pBb/pRr)", "DarkPowderBlue"),
    ("(P:pBp/pBb/pRr)", "DarkPeach"),
    ("(P:pRp/pRr)", "Green"),
    ("(P:P/pBp/pRr)", "Purple"),
    ("(P:P/pBb/pRr)", "DarkGrayBlue"),
    ("(P:P/pBp/pBb/pRr)", "DarkOrange"),
    ("(P:P/pRp/pRr)", "Pink"),
    ("(P:pBp/pRp/pRr)", "PowderBlue"),
    ("(P:pBb/pRp/pRr)", "DarkYellow"),
    ("(P:pBp/pBb/pRp/pRr)", "DarkPurple"),
    ("(P:P/pBp/pRp/pRr)", "Peach"),
    ("(P:P/pBb/pRp/pRr)", "DarkPink"),
    ("(P:P/pBp/pBb/pRp/pRr)", "DarkGreen"),
    ("(B:pBb)", "PowderBlue"),
    ("(B:bBb)", "Purple"),
    ("(B:pBb/bBb)", "Pink"),
    ("(B:0)", "Peach"),
    ("(R:pRr)", "GrayBlue"),
    ("(R:rRr)", "Orange"),
    ("(R:pRr/rRr)", "Yellow"),
    ("(R:0)", "Green"),
];

const NODE_GROUP_ANNOTS_PERFECT: &[(&str, &str)] = &[
    ("(P:0/1)", "GrayBlue"),
    ("(P:0/0)", "DarkGrayBlue"),
    ("(P:P/1)", "Orange"),
    ("(P:P/0)", "DarkOrange"),
    ("(P:pBp/1)", "Yellow"),
    ("(P:pBp/0)", "DarkYellow"),
    ("(P:pBb/1)", "DarkPeach"),
    ("(P:pBb/0)", "Peach"),
    ("(P:pBp/pBb/1)", "DarkPowderBlue"),
    ("(P:pBp/pBb/0)", "PowderBlue"),
    ("(P:pRp/1)", "Green"),
    ("(P:pRp/0)", "DarkGreen"),
    ("(P:P/pBp/1)", "Purple"),
    ("(P:P/pBp/0)", "DarkPurple"),
    ("(P:P/pBb/1)", "DarkOrange"),
    ("(P:P/pBb/0)", "Orange"),
    ("(P:P/pBp/pBb/1)", "DarkYellow"),
    ("(P:P/pBp/pBb/0)", "Yellow"),
    ("(P:P/pRp/1)", "Pink"),
    ("(P:P/pRp/0)", "DarkPink"),
    ("(P:pBp/pRp/1)", "PowderBlue"),
    ("(P:pBp/pRp/0)", "DarkPowderBlue"),
    ("(P:pBb/pRp/1)", "DarkGreen"),
    ("(P:pBb/pRp/0)", "Green"),
    ("(P:pBp/pBb/pRp/1)", "DarkPurple"),
    ("(P:pBp/pBb/pRp/0)", "Purple"),
    ("(P:P/pBp/pRp/1)", "Peach"),
    ("(P:P/pBp/pRp/0)", "DarkPeach"),
    ("(P:P/pBb/pRp/1)", "DarkGrayBlue"),
    ("(P:P/pBb/pRp/0)", "GrayBlue"),
    ("(P:P/pBp/pBb/pRp/1)", "DarkPink"),
    ("(P:P/pBp/pBb/pRp/0)", "Pink"),
    ("(P:pRr/1)", "GrayBlue"),
    ("(P:pRr/0)", "DarkGrayBlue"),
    ("(P:P/pRr/1)", "Orange"),
    ("(P:P/pRr/0)", "DarkOrange"),
    ("(P:pBp/pRr/1)", "Yellow"),
    ("(P:pBp/pRr/0)", "DarkYellow"),
    ("(P:pBb/pRr/1)", "DarkPowderBlue"),
    ("(P:pBb/pRr/0)", "PowderBlue"),
    ("(P:pBp/pBb/pRr/1)", "DarkPeach"),
    ("(P:pBp/pBb/pRr/0)", "Peach"),
    ("(P:pRp/pRr/1)", "Green"),
    ("(P:pRp/pRr/0)", "DarkGreen"),
    ("(P:P/pBp/pRr/1)", "Purple"),
    ("(P:P/pBp/pRr/0)", "DarkPurple"),
    ("(P:P/pBb/pRr/1)", "DarkGrayBlue"),
    ("(P:P/pBb/pRr/0)", "GrayBlue"),
    ("(P:P/pBp/pBb/pRr/1)", "DarkOrange"),
    ("(P:P/pBp/pBb/pRr/0)", "Orange"),
    ("(P:P/pRp/pRr/1)", "Pink"),
    ("(P:P/pRp/pRr/0)", "DarkPink"),
    ("(P:pBp/pRp/pRr/1)", "PowderBlue"),
    ("(P:pBp/pRp/pRr/0)", "DarkPowderBlue"),
    ("(P:pBb/pRp/pRr/1)", "DarkYellow"),
    ("(P:pBb/pRp/pRr/0)", "Yellow"),
    ("(P:pBp/pBb/pRp/pRr/1)", "DarkPurple"),
    ("(P:pBp/pBb/pRp/pRr/0)", "Purple"),
    ("(P:P/pBp/pRp/pRr/1)", "Peach"),
    ("(P:P/pBp/pRp/pRr/0)", "DarkPeach"),
    ("(P:P/pBb/pRp/pRr/1)", "DarkPink"),
    ("(P:P/pBb/pRp/pRr/0)", "Pink"),
    ("(P:P/pBp/pBb/pRp/pRr/1)", "DarkGreen"),
    ("(P:P/pBp/pBb/pRp/pRr/0)", "Green"),
    ("(B:pBb/1)", "PowderBlue"),
    ("(B:pBb/0)", "DarkPowderBlue"),
    ("(B:bBb/1)", "Purple"),
    ("(B:bBb/0)", "DarkPurple"),
    ("(B:pBb/bBb/1)", "Pink"),
    ("(B:pBb/bBb/0)", "DarkPink"),
    ("(B:0/1)", "Peach"),
    ("(B:0/0)", "DarkPeach"),
    ("(R:pRr/0)", "GrayBlue"),
    ("(R:rRr/0)", "Orange"),
    ("(R:pRr/rRr/0)", "Yellow"),
    ("(R:0/0)", "Green"),
];

/// How to subdivide node groups when a perfect alignment is available.
///
/// Without a perfect alignment, there are ~40 base node groups. With a
/// perfect alignment, each base group can be split into "correct" and
/// "incorrect" subgroups, yielding ~76 groups.
///
/// ## References
///
/// - Java: `NodeGroupMap.PerfectNGMode`
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum PerfectNGMode {
    /// No perfect alignment — use base groups only (~40 groups).
    #[default]
    None,
    /// Split groups by node correctness (does alignment match perfect?).
    /// Produces ~76 groups (each base group split into correct/incorrect).
    NodeCorrectness,
    /// Split groups by Jaccard similarity threshold (default 0.75).
    /// Produces ~76 groups (each base group split into above/below threshold).
    JaccardSimilarity,
}

/// Jaccard similarity threshold for [`PerfectNGMode::JaccardSimilarity`].
///
/// ## References
///
/// - Java: `NodeGroupMap.JACCARD_THRESHOLD` (0.75)
pub const DEFAULT_JACCARD_THRESHOLD: f64 = 0.75;

/// Tag identifying a node group.
///
/// Format: `"(color:edge_type1/edge_type2/...)"`, where color is `P`, `B`,
/// or `R` and edge types are in canonical order.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct NodeGroupTag(pub String);

impl NodeGroupTag {
    /// Build a tag from a node color and its incident edge types.
    pub fn from_parts(color: NodeColor, edge_types: &[EdgeType]) -> Self {
        todo!()
    }
}

impl PartialOrd for NodeGroupTag {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        todo!()
    }
}

impl Ord for NodeGroupTag {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        todo!()
    }
}

/// A single node group — a set of nodes sharing the same color + edge pattern.
#[derive(Debug, Clone)]
pub struct NodeGroup {
    /// The group tag (e.g., `"(P:P/pBp)"`).
    pub tag: NodeGroupTag,
    /// Node color for all members.
    pub color: NodeColor,
    /// Edge types incident to members of this group.
    pub edge_types: Vec<EdgeType>,
    /// Member node IDs.
    pub members: Vec<NodeId>,
    /// Annotation color name (Java group color map).
    pub annot_color: String,
}

/// Complete node group classification for a merged network.
///
/// Maps each node to its group and provides group-level statistics.
#[derive(Debug, Clone)]
pub struct NodeGroupMap {
    /// All groups, in canonical display order.
    pub groups: Vec<NodeGroup>,
    /// Lookup: node ID -> index into `groups`.
    pub node_to_group: HashMap<NodeId, usize>,
    /// The perfect NG mode used to build this map.
    pub perfect_mode: PerfectNGMode,
    /// Jaccard threshold (only meaningful when mode is JaccardSimilarity).
    pub jaccard_threshold: f64,
}

impl NodeGroupMap {
    /// Build the node group map from a merged network.
    pub fn from_merged(merged: &MergedNetwork, _monitor: &dyn ProgressMonitor) -> Self {
        todo!()
    }

    /// Build the node group map from a merged network with a PerfectNG mode.
    pub fn from_merged_with_mode(
        merged: &MergedNetwork,
        mode: PerfectNGMode,
        jaccard_correct: Option<&HashMap<NodeId, bool>>,
        jaccard_threshold: f64,
        _monitor: &dyn ProgressMonitor,
    ) -> Self {
        todo!()
    }

    /// Total number of groups (including empty).
    pub fn group_count(&self) -> usize {
        todo!()
    }

    /// Group index for a node.
    pub fn group_index(&self, node_id: &NodeId) -> Option<usize> {
        todo!()
    }

    /// Compute the group ratio vector (fraction of nodes in each group).
    ///
    /// Used for NGS (Node Group Similarity) scoring.
    pub fn ratio_vector(&self) -> Vec<f64> {
        todo!()
    }

    /// Compute the link group ratio vector.
    ///
    /// For each edge type, counts the edges of that type and divides by total.
    /// Used for LGS (Link Group Similarity) scoring.
    pub fn link_ratio_vector(merged: &MergedNetwork) -> Vec<f64> {
        todo!()
    }
}
