//! Link groups and column assignment for edge layout.
//!
//! A **link group** is a contiguous run of edges sharing the same relation type
//! that are incident to the same node.
//!
//! The [`ColumnAssigner`] tracks dual column numbering (shadow-on and shadow-off)
//! during edge layout, so shadow toggle is O(1) in the renderer.

use crate::model::{Link, NodeId};
use std::cmp::Ordering;
use std::collections::HashMap;

// ============================================================================
// Link groups
// ============================================================================

/// A link group: a set of edges sharing the same relation and endpoint node.
#[derive(Debug, Clone)]
pub struct LinkGroup {
    /// The node that anchors this group (the "top" endpoint).
    pub node: NodeId,

    /// The relation type shared by all edges in this group.
    pub relation: String,

    /// Indices into the network's link list for edges in this group.
    pub link_indices: Vec<usize>,
}

/// A map from `(node, relation)` to link group.
///
/// Built once during edge layout and used by the edge comparator.
#[derive(Debug, Clone, Default)]
pub struct LinkGroupIndex {
    /// Groups keyed by `(node_id, relation)`.
    groups: HashMap<(NodeId, String), LinkGroup>,

    /// Canonical order of link groups. Each entry is a `(node_id, relation)` key.
    /// Within a node's groups, relations are in encounter order.
    order: Vec<(NodeId, String)>,
}

impl LinkGroupIndex {
    /// Build link groups for all nodes in the given node order.
    ///
    /// For each node (processed in row order), collects all incident links
    /// grouped by relation type. The resulting order determines the canonical
    /// link-group ordering used by the comparator.
    ///
    /// # Arguments
    ///
    /// * `links` — All links in the network
    /// * `node_order` — Nodes in row order (index = row number)
    pub fn build(links: &[Link], node_order: &[NodeId]) -> Self {
        todo!()
    }

    /// Get the ordinal position of a link group.
    ///
    /// Returns `None` if the `(node, relation)` pair has no group.
    pub fn group_ordinal(&self, node: &NodeId, relation: &str) -> Option<usize> {
        let key = (node.clone(), relation.to_string());
        self.order.iter().position(|k| k == &key)
    }

    /// Get a link group by key.
    pub fn get(&self, node: &NodeId, relation: &str) -> Option<&LinkGroup> {
        let key = (node.clone(), relation.to_string());
        self.groups.get(&key)
    }

    /// Iterate over link groups in canonical order.
    pub fn iter_ordered(&self) -> impl Iterator<Item = &LinkGroup> {
        self.order.iter().filter_map(|k| self.groups.get(k))
    }
}

// ============================================================================
// Edge sort key
// ============================================================================

/// Composite sort key for a single link during edge layout.
#[derive(Debug, Clone, Eq, PartialEq)]
pub struct LinkSortKey {
    /// The "anchor" row.
    pub anchor_row: usize,

    /// Whether this is a shadow link.
    pub is_shadow: bool,

    /// Ordinal of the link group within the canonical group ordering.
    pub group_ordinal: usize,

    /// The "far" row.
    pub far_row: usize,

    /// Directionality ordinal.
    pub direction_ordinal: u8,

    /// Relation name (final tie-breaker).
    pub relation: String,
}

impl LinkSortKey {
    /// Build a sort key for a link.
    ///
    /// # Arguments
    ///
    /// * `source_row` — Row of the link's source node
    /// * `target_row` — Row of the link's target node
    /// * `link` — The link itself
    /// * `group_ordinal` — Ordinal from [`LinkGroupIndex::group_ordinal`]
    pub fn new(
        source_row: usize,
        target_row: usize,
        link: &Link,
        group_ordinal: usize,
    ) -> Self {
        todo!()
    }
}

impl Ord for LinkSortKey {
    fn cmp(&self, other: &Self) -> Ordering {
        todo!()
    }
}

impl PartialOrd for LinkSortKey {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        todo!()
    }
}

// ============================================================================
// Column assignment
// ============================================================================

/// Dual-counter column assigner for edge layout.
///
/// Maintains two column counters — one for "shadow-on" mode and one for
/// "shadow-off" mode — so the renderer can toggle shadow display in O(1).
#[derive(Debug, Clone)]
pub struct ColumnAssigner {
    /// Next column number when shadow links are displayed.
    next_column: usize,

    /// Next column number when shadow links are hidden.
    next_column_no_shadows: usize,
}

impl ColumnAssigner {
    /// Create a new column assigner starting at column 0.
    pub fn new() -> Self {
        Self {
            next_column: 0,
            next_column_no_shadows: 0,
        }
    }

    /// Assign a column to a regular (non-shadow) link.
    ///
    /// Returns `(column_with_shadows, column_without_shadows)`.
    pub fn assign_regular(&mut self) -> (usize, usize) {
        let col = self.next_column;
        let col_no = self.next_column_no_shadows;
        self.next_column += 1;
        self.next_column_no_shadows += 1;
        (col, col_no)
    }

    /// Assign a column to a shadow link.
    ///
    /// Shadow links only get a column in shadow-on mode. In shadow-off mode
    /// they are invisible, so no no-shadow column is consumed.
    ///
    /// Returns the shadow-on column number.
    pub fn assign_shadow(&mut self) -> usize {
        let col = self.next_column;
        self.next_column += 1;
        col
    }

    /// Total columns assigned (shadow-on mode).
    pub fn column_count(&self) -> usize {
        self.next_column
    }

    /// Total columns assigned (shadow-off mode).
    pub fn column_count_no_shadows(&self) -> usize {
        self.next_column_no_shadows
    }
}

impl Default for ColumnAssigner {
    fn default() -> Self {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_column_assigner_regular_only() {
        let mut ca = ColumnAssigner::new();
        assert_eq!(ca.assign_regular(), (0, 0));
        assert_eq!(ca.assign_regular(), (1, 1));
        assert_eq!(ca.assign_regular(), (2, 2));
        assert_eq!(ca.column_count(), 3);
        assert_eq!(ca.column_count_no_shadows(), 3);
    }

    #[test]
    fn test_column_assigner_mixed() {
        let mut ca = ColumnAssigner::new();
        // Regular link at col 0 / no-shadow col 0
        assert_eq!(ca.assign_regular(), (0, 0));
        // Shadow link at col 1 / no no-shadow col
        assert_eq!(ca.assign_shadow(), 1);
        // Regular link at col 2 / no-shadow col 1
        assert_eq!(ca.assign_regular(), (2, 1));
        // Shadow link at col 3
        assert_eq!(ca.assign_shadow(), 3);

        assert_eq!(ca.column_count(), 4);
        assert_eq!(ca.column_count_no_shadows(), 2);
    }

    #[test]
    fn test_link_sort_key_ordering() {
        let link_regular = Link::new("A", "B", "r1");
        let link_shadow = Link::with_shadow("A", "B", "r1", true);

        // Regular link: anchor=top_row=0, far=1
        let key_reg = LinkSortKey::new(0, 1, &link_regular, 0);
        // Shadow link: anchor=bottom_row=1, far=0
        let key_shd = LinkSortKey::new(0, 1, &link_shadow, 0);

        // Regular's anchor (0) < shadow's anchor (1), so regular comes first
        assert!(key_reg < key_shd);
    }

    #[test]
    fn test_shadow_before_regular_at_same_anchor() {
        // Scenario: shadow anchored at row 5, regular also anchored at row 5
        let link_regular = Link::new("X", "Y", "r1");
        let link_shadow = Link::with_shadow("X", "Y", "r1", true);

        // Regular: source_row=5, target_row=10 -> anchor=5 (top)
        let key_reg = LinkSortKey::new(5, 10, &link_regular, 0);
        // Shadow: source_row=0, target_row=5 -> anchor=5 (bottom for shadow)
        let key_shd = LinkSortKey::new(0, 5, &link_shadow, 0);

        // Same anchor row -> shadow comes first
        assert!(key_shd < key_reg);
    }
}
