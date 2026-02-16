import { useMemo } from "react";
import { defaultRendererConfig, getRendererBackendSummary } from "./lib/renderbiofabric";

export function App() {
  const rendererInfo = useMemo(() => getRendererBackendSummary(), []);

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>BioFabric Frontend</h1>
        <p>TypeScript + GPU renderer skeleton for parity work.</p>
      </header>

      <section className="status-grid">
        <article className="status-card">
          <h2>Renderer backend</h2>
          <p>{rendererInfo.backend}</p>
        </article>
        <article className="status-card">
          <h2>WebGL2 support</h2>
          <p>{rendererInfo.webgl2Supported ? "available" : "not available"}</p>
        </article>
        <article className="status-card">
          <h2>WASM role</h2>
          <p>CPU-side prep, culling, hit-testing</p>
        </article>
      </section>

      <section className="canvas-shell">
        <div className="canvas-placeholder">
          Canvas viewport and renderer pipeline will mount here.
        </div>
      </section>

      <footer className="app-footer">
        <small>
          Next: wire session loading, scene conversion, and interactive draw loop.
        </small>
        <small>Target line width: {defaultRendererConfig.lineWidthPx}px</small>
      </footer>
    </main>
  );
}
