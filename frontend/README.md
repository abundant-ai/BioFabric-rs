# BioFabric Frontend (Skeleton)

This folder contains the TypeScript frontend scaffold for BioFabric-rs.

## Current Status

- Vite + React + TypeScript app shell
- Typed contracts for session/layout payloads
- Scene model adapter stub
- Renderer backend selection stub (WebGL2 vs fallback)
- Worker boundary stub for scene preparation

## Commands

```bash
pnpm install
pnpm dev
pnpm build
```

You can still run the same scripts with `npm run <script>` if needed, but
`pnpm` is the default package manager for this frontend.

## Next Steps

1. Implement canvas viewport and draw loop.
2. Add session file loading and parsing.
3. Replace renderer stubs with WebGL2 pipeline.
4. Integrate selection, annotation, and minimap systems.
