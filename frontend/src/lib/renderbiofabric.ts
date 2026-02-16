export type RendererBackend = "webgl2" | "cpu-fallback";

export interface RendererConfig {
  lineWidthPx: number;
  enableAnnotations: boolean;
  enableLabels: boolean;
}

export const defaultRendererConfig: RendererConfig = {
  lineWidthPx: 1.0,
  enableAnnotations: true,
  enableLabels: true,
};

export function isWebGl2Supported(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2"));
  } catch {
    return false;
  }
}

export function pickRendererBackend(): RendererBackend {
  return isWebGl2Supported() ? "webgl2" : "cpu-fallback";
}

export function getRendererBackendSummary(): {
  backend: RendererBackend;
  webgl2Supported: boolean;
} {
  const webgl2Supported = isWebGl2Supported();
  return {
    backend: webgl2Supported ? "webgl2" : "cpu-fallback",
    webgl2Supported,
  };
}
