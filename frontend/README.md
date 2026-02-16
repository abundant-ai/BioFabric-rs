# BioFabric Frontend

This folder contains the React + TypeScript frontend for interactive BioFabric rendering.

## Implemented

- Layout/session/network file loading:
  - JSON layout (`NetworkLayout`)
  - JSON session (`Session`)
  - JSON network fallback (deterministic preview ordering)
  - SIF import with fallback ordering
- Typed schema normalization against Rust field names (snake_case and camelCase accepted)
- Scene preparation worker:
  - Builds packed line vertex buffers off the UI thread
  - Supports alignment view relation filtering (`all/group/orphan/cycle`)
- Rendering pipeline:
  - WebGL2 line renderer (with CPU 2D fallback)
  - Overlay pass for annotations, labels, selection, and marquee box
- Interaction:
  - Pan/zoom
  - Click + shift-click selection
  - Shift-drag rectangle selection
  - Focus selection and fit-to-scene
  - Hover inspection
- Side panels:
  - Search + locate
  - Overview/minimap
  - Alignment metrics panel (when present in payload)
  - Display option toggles and thresholds
- PNG export from the current viewport

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm typecheck
```
