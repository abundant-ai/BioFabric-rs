import { rgbaFromHex, rgbaToCss } from "./colors";
import type { PreparedSceneBuffers } from "./scenePrep";
import type { CameraState } from "../state/viewState";

export type RendererBackend = "webgl2" | "cpu-fallback";

export interface RendererConfig {
  lineWidthPx: number;
  enableAnnotations: boolean;
  enableLabels: boolean;
}

export interface DrawOptions {
  showShadows: boolean;
  backgroundColor: string;
  nodeLineWidth: number;
  linkLineWidth: number;
}

interface GeometryStore {
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  vertexCount: number;
}

export const defaultRendererConfig: RendererConfig = {
  lineWidthPx: 1,
  enableAnnotations: true,
  enableLabels: true,
};

export function isWebGl2Supported(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
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

function compileShader(
  gl: WebGL2RenderingContext,
  kind: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(kind);
  if (!shader) {
    throw new Error("Failed to allocate WebGL shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? "unknown shader compile failure";
    gl.deleteShader(shader);
    throw new Error(`WebGL shader compilation failed: ${info}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertexSource = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec4 a_color;
uniform vec2 u_canvas_px;
uniform vec2 u_pan_px;
uniform float u_zoom_px_per_world;
out vec4 v_color;
void main() {
  vec2 screen = (a_pos * u_zoom_px_per_world) + u_pan_px;
  vec2 clip = vec2(
    (screen.x / u_canvas_px.x) * 2.0 - 1.0,
    1.0 - (screen.y / u_canvas_px.y) * 2.0
  );
  gl_Position = vec4(clip, 0.0, 1.0);
  v_color = a_color;
}
`;

  const fragmentSource = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 out_color;
void main() {
  out_color = v_color;
}
`;

  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error("Failed to create WebGL program");
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? "unknown link failure";
    gl.deleteProgram(program);
    throw new Error(`WebGL program link failed: ${info}`);
  }
  return program;
}

function createGeometryStore(gl: WebGL2RenderingContext): GeometryStore {
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  if (!vao || !buffer) {
    throw new Error("Failed to allocate WebGL geometry resources");
  }

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 6 * Float32Array.BYTES_PER_ELEMENT, 0);
  gl.vertexAttribPointer(
    1,
    4,
    gl.FLOAT,
    false,
    6 * Float32Array.BYTES_PER_ELEMENT,
    2 * Float32Array.BYTES_PER_ELEMENT,
  );
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return {
    vao,
    buffer,
    vertexCount: 0,
  };
}

export class WebGl2LineRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly uCanvasPx: WebGLUniformLocation;
  private readonly uPanPx: WebGLUniformLocation;
  private readonly uZoomPxPerWorld: WebGLUniformLocation;
  private readonly nodeShadow: GeometryStore;
  private readonly nodeNoShadows: GeometryStore;
  private readonly linkShadow: GeometryStore;
  private readonly linkNoShadows: GeometryStore;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
    });
    if (!gl) {
      throw new Error("WebGL2 context unavailable");
    }
    this.gl = gl;
    this.program = createProgram(gl);
    this.uCanvasPx = gl.getUniformLocation(this.program, "u_canvas_px")!;
    this.uPanPx = gl.getUniformLocation(this.program, "u_pan_px")!;
    this.uZoomPxPerWorld = gl.getUniformLocation(this.program, "u_zoom_px_per_world")!;
    this.nodeShadow = createGeometryStore(gl);
    this.nodeNoShadows = createGeometryStore(gl);
    this.linkShadow = createGeometryStore(gl);
    this.linkNoShadows = createGeometryStore(gl);

    gl.useProgram(this.program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  setPreparedBuffers(buffers: PreparedSceneBuffers): void {
    this.upload(this.nodeShadow, buffers.nodeVerticesShadow);
    this.upload(this.nodeNoShadows, buffers.nodeVerticesNoShadows);
    this.upload(this.linkShadow, buffers.linkVerticesShadow);
    this.upload(this.linkNoShadows, buffers.linkVerticesNoShadows);
  }

  private upload(target: GeometryStore, vertices: Float32Array): void {
    const gl = this.gl;
    target.vertexCount = vertices.length / 6;
    gl.bindBuffer(gl.ARRAY_BUFFER, target.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private resize(width: number, height: number): void {
    const pxWidth = Math.max(1, Math.floor(width));
    const pxHeight = Math.max(1, Math.floor(height));
    if (this.canvas.width !== pxWidth || this.canvas.height !== pxHeight) {
      this.canvas.width = pxWidth;
      this.canvas.height = pxHeight;
    }
    this.gl.viewport(0, 0, pxWidth, pxHeight);
  }

  draw(camera: CameraState, viewportWidth: number, viewportHeight: number, options: DrawOptions): void {
    const gl = this.gl;
    this.resize(viewportWidth, viewportHeight);
    const [r, g, b, a] = rgbaFromHex(options.backgroundColor, "#ffffff");
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);
    gl.uniform2f(this.uCanvasPx, Math.max(1, viewportWidth), Math.max(1, viewportHeight));
    gl.uniform2f(this.uPanPx, camera.panX, camera.panY);
    gl.uniform1f(this.uZoomPxPerWorld, camera.zoom);

    const linkStore = options.showShadows ? this.linkShadow : this.linkNoShadows;
    const nodeStore = options.showShadows ? this.nodeShadow : this.nodeNoShadows;

    if (linkStore.vertexCount > 0) {
      gl.bindVertexArray(linkStore.vao);
      gl.lineWidth(Math.max(1, options.linkLineWidth));
      gl.drawArrays(gl.LINES, 0, linkStore.vertexCount);
    }
    if (nodeStore.vertexCount > 0) {
      gl.bindVertexArray(nodeStore.vao);
      gl.lineWidth(Math.max(1, options.nodeLineWidth));
      gl.drawArrays(gl.LINES, 0, nodeStore.vertexCount);
    }
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.nodeShadow.vao);
    gl.deleteVertexArray(this.nodeNoShadows.vao);
    gl.deleteVertexArray(this.linkShadow.vao);
    gl.deleteVertexArray(this.linkNoShadows.vao);
    gl.deleteBuffer(this.nodeShadow.buffer);
    gl.deleteBuffer(this.nodeNoShadows.buffer);
    gl.deleteBuffer(this.linkShadow.buffer);
    gl.deleteBuffer(this.linkNoShadows.buffer);
  }
}

export function drawPreparedBuffers2d(
  ctx: CanvasRenderingContext2D,
  prepared: PreparedSceneBuffers,
  camera: CameraState,
  viewportWidth: number,
  viewportHeight: number,
  options: DrawOptions,
): void {
  ctx.clearRect(0, 0, viewportWidth, viewportHeight);
  ctx.fillStyle = options.backgroundColor;
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);

  const links = options.showShadows ? prepared.linkVerticesShadow : prepared.linkVerticesNoShadows;
  const nodes = options.showShadows ? prepared.nodeVerticesShadow : prepared.nodeVerticesNoShadows;

  const drawSet = (vertices: Float32Array, lineWidth: number) => {
    ctx.lineWidth = Math.max(1, lineWidth);
    for (let i = 0; i < vertices.length; i += 12) {
      const x1 = vertices[i] * camera.zoom + camera.panX;
      const y1 = vertices[i + 1] * camera.zoom + camera.panY;
      const r = vertices[i + 2];
      const g = vertices[i + 3];
      const b = vertices[i + 4];
      const a = vertices[i + 5];
      const x2 = vertices[i + 6] * camera.zoom + camera.panX;
      const y2 = vertices[i + 7] * camera.zoom + camera.panY;
      ctx.strokeStyle = rgbaToCss(r, g, b, a);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  };

  drawSet(links, options.linkLineWidth);
  drawSet(nodes, options.nodeLineWidth);
}
