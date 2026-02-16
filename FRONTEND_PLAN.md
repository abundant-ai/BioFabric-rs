# BioFabric-rs Frontend + Rendering Plan

This document is the implementation blueprint for achieving parity with:

- Java `BioFabric`
- Java `AlignmentPlugin` (VISNAB)
- Existing `biofabric-rs` CLI/core behavior

The plan is written so a coding agent can execute it phase-by-phase.

## Goals

1. Build a TypeScript frontend with interactive BioFabric visualization.
2. Preserve high performance on large networks.
3. Maintain behavior parity with Java BioFabric and AlignmentPlugin.
4. Add deterministic image export via CLI (headless).
5. Reuse Rust core data structures and layout logic as the source of truth.

## Non-Goals (Initial Delivery)

1. Perfect pixel-level parity with Java UI styling on day one.
2. Shipping all advanced tools before core interaction performance is stable.
3. Making WebGPU mandatory (WebGL2 baseline first for compatibility).

## Architecture Decisions

### Rendering Strategy

- Use a custom GPU renderer in the frontend.
- Start with WebGL2, keep API boundaries compatible with a future WebGPU backend.
- Use a multi-pass renderer:
  1. Base geometry pass (nodes, links)
  2. Annotation pass (node/link bands)
  3. Selection/focus pass
  4. Label pass (zoom-gated)

### WASM Strategy

- Use Rust+WASM for CPU-heavy operations, not for direct GPU rendering.
- WASM responsibilities:
  - Optional parse/validation helpers
  - Spatial indexing (hit testing, rectangle queries)
  - LOD/culling preparation
  - Alignment metric calculations (if needed in UI)

### Export Strategy (CLI)

- Implement export in Rust for deterministic headless outputs.
- Output formats:
  - PNG
- Export uses the same `Session + DisplayOptions` model as interactive UI.

## Parity Scope Checklist

### Core BioFabric

- [x] Open/load session + networks
- [x] Pan/zoom navigation
- [x] Node/link rendering (with shadows toggle)
- [x] Selection: click, shift-click, rectangle
- [x] Focus box and clear selection
- [x] Node/link annotations and label toggles
- [x] Minimap/overview panel
- [x] Search and locate
- [x] Export image

### Layout/Ordering

- [ ] Default
- [ ] Similarity
- [ ] Hierarchy
- [ ] Cluster
- [ ] Control-top
- [ ] Set
- [ ] WorldBank
- [ ] Link group mode/order controls

### AlignmentPlugin (VISNAB)

- [x] Group view
- [x] Orphan view
- [x] Cycle view
- [x] Alignment score panel (EC/S3/ICS/NC/JS/NGS/LGS)
- [ ] Perfect alignment option + thresholds
- [ ] Node/edge color semantics

## Phased Execution Plan

## Phase 0 - Repo Foundation

Deliverables:

- Frontend project skeleton (Vite + React + TS)
- Typed contracts for layout/session/render data
- Renderer interface stubs
- Worker and WASM placeholder boundaries
- Plan + tracking docs

Acceptance:

- `pnpm dev` works
- `pnpm build` works
- App renders canvas placeholder and reports GPU capability

## Phase 1 - Data Plumbing

Deliverables:

- File import support (JSON/session first, then SIF/GW through backend conversion)
- Canonical front-end scene model derived from `NetworkLayout`
- Versioned schema guards for session/layout payloads

Acceptance:

- Sample session loads and maps to typed render model
- Basic viewport transforms are stable

## Phase 2 - GPU Renderer MVP

Deliverables:

- WebGL2 renderer drawing nodes/links from typed buffers
- Camera/viewport controls (pan, zoom to fit, zoom box)
- LOD culling using `DisplayOptions` thresholds

Acceptance:

- Smooth interaction on medium-large graph fixtures
- No full redraw on unrelated UI updates

## Phase 3 - Interaction Parity

Deliverables:

- Point and rectangle hit testing
- Multi-selection logic
- Focus box + selection overlay
- Tooltip/location info panel
- Search integration

Acceptance:

- Selection behavior matches Java expectations for common workflows

## Phase 4 - Annotation + Labels + Overview

Deliverables:

- Node/link annotation rendering
- Label pipeline with zoom threshold + collision policy
- Overview/minimap viewport indicator

Acceptance:

- Annotation toggles and label toggles match display options

## Phase 5 - Alignment Views

Deliverables:

- Group/Orphan/Cycle view toggles in UI
- Alignment metrics panel
- Perfect alignment support in controls and metrics

Acceptance:

- Alignment workflows produce expected classes/colors/metrics

## Phase 6 - CLI Export Parity

Deliverables:

- [x] Implement `biofabric render` command in CLI
- [x] Wire `align --output <image>` image path handling
- [x] Shared render model with image export options
- [x] PNG baseline export tests

Acceptance:

- [x] Deterministic PNG export in CI/headless environment
- [x] `DisplayOptions::for_image_export()` actively used

## Phase 7 - Performance Hardening

Deliverables:

- Instanced drawing and packed GPU buffers
- Worker-driven buffer rebuilds
- Optional WASM acceleration for culling/indexing
- Frame timing and memory telemetry
- Progressive refinement at low zoom (density pass)

Acceptance:

- Large graph operations remain interactive
- Perf regressions are detectable via benchmarks

## Work Breakdown Structure

## Frontend app (`frontend/`)

1. `src/types`
   - Schema/types for session/layout/alignment
2. `src/lib`
   - Parser/adapter to scene model
   - Renderer abstractions + backend selection
3. `src/workers`
   - Buffer preparation/culling worker
4. `src/components`
   - Canvas viewport, controls, minimap, metrics panel
5. `src/state`
   - App/store state for view + selection + display options

## Rust core/CLI (`crates/core`, `crates/cli`)

1. Add render command and image export path.
2. Build render model conversion from `Session`.
3. Implement raster/vector exporters.
4. Add integration tests and golden comparisons.

## Test Plan

1. Unit tests
   - Parsing adapters
   - LOD decisions
   - Selection geometry logic
2. Integration tests
   - Load session and render first frame
   - Alignment metric correctness
3. Snapshot/golden tests
   - Export PNG fixtures from known sessions
4. Performance tests
   - Frame time and memory thresholds for representative datasets

## Risks and Mitigations

1. Risk: GPU driver/browser variance
   - Mitigation: WebGL2 baseline + feature probes + graceful fallback
2. Risk: label rendering cost at scale
   - Mitigation: strict zoom gating and incremental label passes
3. Risk: divergence between frontend and export visuals
   - Mitigation: shared render model and display option mapping tests
4. Risk: alignment parity edge-cases
   - Mitigation: fixture corpus from Java plugin outputs

## Agent Execution Instructions

Suggested branch flow:

1. `feat/frontend-skeleton`
2. `feat/frontend-renderer-mvp`
3. `feat/frontend-interaction-parity`
4. `feat/alignment-views`
5. `feat/cli-image-export`
6. `perf/renderer-hardening`

Suggested commit cadence:

1. One commit per phase or sub-phase.
2. Keep rendering, state, and parsing changes separated when possible.
3. Include screenshot or perf notes in commit body for rendering milestones.

Definition of done:

1. Frontend parity checklist complete.
2. Alignment parity checklist complete.
3. CLI image export available and tested.
4. Performance target met on large fixture set.
