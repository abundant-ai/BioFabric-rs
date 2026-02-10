//! Alignment cycle and path detection.
//!
//! When an alignment is imperfect, following the mapping from G1→G2 and back
//! can reveal **cycles** (closed loops of misalignment) and **paths** (open
//! chains ending at unaligned nodes).

use crate::io::align::AlignmentMap;
use crate::model::NodeId;
use crate::worker::ProgressMonitor;
use std::collections::HashMap;

/// Classification of an alignment cycle or path.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CycleCase {
    /// Case 1: Correctly unaligned blue (G1-only) node.
    CorrectlyUnalignedBlue,
    /// Case 2: Correctly unaligned red (G2-only) node.
    CorrectlyUnalignedRed,
    /// Case 3: Correctly aligned purple singleton.
    CorrectSingleton,
    /// Case 4: Incorrectly aligned purple singleton.
    IncorrectSingleton,
    /// Case 5: Incorrect 2-node path (red + blue).
    PathRedBlue,
    /// Case 6: Incorrect path (red + N purple).
    PathRedPurple,
    /// Case 7: Incorrect path (N purple + blue).
    PathPurpleBlue,
    /// Case 8: Incorrect path (red + N purple + blue).
    PathRedPurpleBlue,
    /// Case 9: Incorrect cycle of N purple nodes (N > 1).
    IncorrectCycle,
}

impl CycleCase {
    /// All 9 cases in canonical order.
    pub fn all() -> &'static [CycleCase] {
        todo!()
    }

    /// Zero-based index of this case (0–8).
    pub fn index(&self) -> usize {
        todo!()
    }

    /// Whether this case represents a correct alignment.
    pub fn is_correct(&self) -> bool {
        todo!()
    }

    /// Whether this case is a cycle (as opposed to a path or singleton).
    pub fn is_cycle(&self) -> bool {
        todo!()
    }
}

/// A single detected cycle or path in the alignment.
#[derive(Debug, Clone)]
pub struct AlignmentCyclePath {
    /// The case classification.
    pub case: CycleCase,

    /// Ordered list of node IDs forming the cycle/path.
    ///
    /// For cycles, the first and last node are the same. For paths, the
    /// endpoints are unaligned (blue/red) nodes.
    pub nodes: Vec<NodeId>,
}

/// All detected cycles and paths in an alignment.
#[derive(Debug, Clone)]
pub struct AlignmentCycles {
    /// All detected cycles/paths.
    pub entries: Vec<AlignmentCyclePath>,

    /// Count by case type (indexed by `CycleCase::index()`).
    pub case_counts: [usize; 9],
}

impl AlignmentCycles {
    /// Detect all cycles and paths in an alignment.
    ///
    /// # Arguments
    ///
    /// * `alignment` — The G1→G2 alignment mapping
    /// * `perfect` — Optional perfect (reference) alignment for correctness
    ///   classification.
    /// * `monitor` — Progress/cancellation monitor
    pub fn detect(
        alignment: &AlignmentMap,
        perfect: Option<&AlignmentMap>,
        _monitor: &dyn ProgressMonitor,
    ) -> Self {
        todo!()
    }

    /// Total number of cycles/paths detected.
    pub fn total(&self) -> usize {
        todo!()
    }

    /// Count for a specific case.
    pub fn count(&self, case: CycleCase) -> usize {
        todo!()
    }

    /// Number of correctly aligned structures (cases 1–3).
    pub fn correct_count(&self) -> usize {
        todo!()
    }

    /// Number of incorrectly aligned structures (cases 4–9).
    pub fn incorrect_count(&self) -> usize {
        todo!()
    }
}
