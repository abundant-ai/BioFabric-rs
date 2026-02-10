//! Set membership layout.

use super::build_data::LayoutBuildData;
use super::default::DefaultEdgeLayout;
use super::result::NetworkLayout;
use super::traits::{EdgeLayout, LayoutMode, LayoutParams, LayoutResult, NodeLayout};
use crate::model::{Annotation, AnnotationSet, Network, NodeId};
use crate::worker::ProgressMonitor;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

/// Set membership semantics.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SetSemantics {
    /// Members belong to sets (edge: member -> set).
    #[default]
    BelongsTo,
    /// Sets contain members (edge: set -> member).
    Contains,
}

/// Set layout configuration.
#[derive(Debug, Clone, Default)]
pub struct SetLayoutParams {
    pub semantics: SetSemantics,
    pub membership_relation: Option<String>,
}

/// Set membership layout.
#[derive(Debug, Clone, Default)]
pub struct SetLayout {
    pub config: SetLayoutParams,
}

impl SetLayout {
    /// Create a new set layout with default configuration.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the membership semantics.
    pub fn with_semantics(mut self, semantics: SetSemantics) -> Self {
        self.config.semantics = semantics;
        self
    }

    /// Set the membership relation type.
    pub fn with_relation(mut self, relation: impl Into<String>) -> Self {
        self.config.membership_relation = Some(relation.into());
        self
    }

    /// Extract set→members mapping from the network.
    fn extract_sets(
        &self,
        network: &Network,
    ) -> (
        HashMap<NodeId, BTreeSet<NodeId>>,
        HashMap<NodeId, BTreeSet<NodeId>>,
    ) {
        todo!()
    }

    /// Order the set nodes.
    fn order_sets(elems_per_set: &HashMap<NodeId, BTreeSet<NodeId>>) -> Vec<NodeId> {
        todo!()
    }

    /// Order the member nodes.
    fn order_members(
        set_list: &[NodeId],
        sets_per_elem: &HashMap<NodeId, BTreeSet<NodeId>>,
        network: &Network,
    ) -> Vec<NodeId> {
        todo!()
    }

    /// Run set node and edge layout.
    pub fn full_layout(
        &self,
        network: &Network,
        monitor: &dyn ProgressMonitor,
    ) -> LayoutResult<NetworkLayout> {
        todo!()
    }
}

impl NodeLayout for SetLayout {
    fn layout_nodes(
        &self,
        network: &Network,
        _params: &LayoutParams,
        _monitor: &dyn ProgressMonitor,
    ) -> LayoutResult<Vec<NodeId>> {
        todo!()
    }

    fn name(&self) -> &'static str {
        "Set Membership"
    }
}
