//! Node similarity layout algorithm.
//!
//! This layout orders nodes by their structural similarity, with two modes:
//! **Resort** and **Clustered**.

use super::traits::{LayoutParams, LayoutResult, NodeLayout};
use crate::model::{Network, NodeId};
use crate::worker::ProgressMonitor;

// ============================================================================
// Public types
// ============================================================================

/// Which similarity algorithm to use.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SimilarityMode {
    /// Resort mode: iteratively improve default layout by grouping nodes
    /// with similar connection patterns together.
    Resort,
    /// Clustered mode: order nodes by structural similarity.
    Clustered,
}

/// Node similarity layout algorithm.
///
/// Orders nodes by structural similarity using either resort or clustered mode.
#[derive(Debug, Clone)]
pub struct NodeSimilarityLayout {
    mode: SimilarityMode,
    pass_count: usize,
    terminate_at_increase: bool,
    tolerance: f64,
    chain_length: usize,
}

impl Default for NodeSimilarityLayout {
    fn default() -> Self {
        todo!()
    }
}

impl NodeSimilarityLayout {
    /// Create a new node similarity layout with the given mode.
    pub fn new(mode: SimilarityMode) -> Self {
        Self {
            mode,
            pass_count: 10,
            terminate_at_increase: false,
            tolerance: 0.80,
            chain_length: 15,
        }
    }

    /// Create a resort-mode layout.
    pub fn resort() -> Self {
        Self::new(SimilarityMode::Resort)
    }

    /// Create a clustered-mode layout.
    pub fn clustered() -> Self {
        Self::new(SimilarityMode::Clustered)
    }

    /// Set the number of improvement passes (Resort mode).
    pub fn with_pass_count(mut self, count: usize) -> Self {
        self.pass_count = count;
        self
    }

    /// Set the similarity tolerance (Clustered mode).
    pub fn with_tolerance(mut self, tolerance: f64) -> Self {
        self.tolerance = tolerance;
        self
    }

    /// Set the maximum chain length (Clustered mode).
    pub fn with_chain_length(mut self, chain_length: usize) -> Self {
        self.chain_length = chain_length;
        self
    }
}

impl NodeLayout for NodeSimilarityLayout {
    fn layout_nodes(
        &self,
        network: &Network,
        params: &LayoutParams,
        monitor: &dyn ProgressMonitor,
    ) -> LayoutResult<Vec<NodeId>> {
        todo!()
    }

    fn name(&self) -> &'static str {
        match self.mode {
            SimilarityMode::Resort => "Node Similarity (Resort)",
            SimilarityMode::Clustered => "Node Similarity (Clustered)",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_similarity_mode_constructors() {
        let resort = NodeSimilarityLayout::resort();
        assert_eq!(resort.mode, SimilarityMode::Resort);

        let clustered = NodeSimilarityLayout::clustered();
        assert_eq!(clustered.mode, SimilarityMode::Clustered);
    }
}
