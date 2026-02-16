import {
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { parseBioFabricFile, buildSceneModel, defaultDisplayOptions, formatSourceKind } from "./lib/parsebiofabric";
import type {
  AlignmentViewMode,
  AnnotationBand,
  DisplayOptions,
  LinkLayout,
  NodeLayout,
  SceneModel,
  SelectionState,
  SessionPayload,
} from "./types/biofabric";
import {
  defaultRendererConfig,
  drawPreparedBuffers2d,
  getRendererBackendSummary,
  type RendererBackend,
  WebGl2LineRenderer,
} from "./lib/renderbiofabric";
import {
  buildPreparedSceneBuffers,
  relationIncluded,
  type PreparedSceneBuffers,
  type ScenePrepInput,
} from "./lib/scenePrep";
import {
  cameraViewportWorldRect,
  clampZoom,
  defaultCameraState,
  fitCameraToRect,
  normalizeRect,
  rectIntersects,
  screenToWorld,
  worldToScreen,
  zoomAroundPoint,
  type CameraState,
  type WorldRect,
} from "./state/viewState";
import { rgbaFromHex, rgbaToCss } from "./lib/colors";

interface ViewportSize {
  width: number;
  height: number;
}

interface HoverInfo {
  title: string;
  details: string;
}

interface PrepareWorkerMessage {
  type: "prepared";
  payload: PreparedSceneBuffers;
}

interface DragState {
  mode: "none" | "pan" | "marquee";
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startWorldX: number;
  startWorldY: number;
  moved: boolean;
}

const ALIGNMENT_VIEWS: Array<{ value: AlignmentViewMode; label: string }> = [
  { value: "all", label: "All links" },
  { value: "group", label: "Group view" },
  { value: "orphan", label: "Orphan view" },
  { value: "cycle", label: "Cycle view" },
];

function emptySelection(): SelectionState {
  return {
    nodeIds: new Set<string>(),
    linkIndices: new Set<number>(),
  };
}

function selectionBounds(scene: SceneModel, selection: SelectionState, showShadows: boolean): WorldRect | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const nodeId of selection.nodeIds) {
    const node = scene.nodes.find((entry) => entry.id === nodeId);
    if (!node) {
      continue;
    }
    const start = showShadows ? node.minCol : node.minColNoShadows;
    const end = (showShadows ? node.maxCol : node.maxColNoShadows) + 1;
    minX = Math.min(minX, start);
    maxX = Math.max(maxX, end);
    minY = Math.min(minY, node.row);
    maxY = Math.max(maxY, node.row + 1);
  }

  for (const linkIndex of selection.linkIndices) {
    const link = scene.links[linkIndex];
    if (!link) {
      continue;
    }
    const col = showShadows ? link.column + 0.5 : link.columnNoShadows === null ? -1 : link.columnNoShadows + 0.5;
    if (col < 0) {
      continue;
    }
    minX = Math.min(minX, col);
    maxX = Math.max(maxX, col);
    minY = Math.min(minY, link.topRow);
    maxY = Math.max(maxY, link.bottomRow + 1);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    minX: minX - 1,
    maxX: maxX + 1,
    minY: minY - 1,
    maxY: maxY + 1,
  };
}

function sceneWorldBounds(scene: SceneModel, showShadows: boolean): WorldRect {
  const maxX = showShadows ? scene.columnCount : Math.max(1, scene.columnCountNoShadows);
  const maxY = Math.max(1, scene.rowCount);
  return {
    minX: 0,
    minY: 0,
    maxX: maxX + 1,
    maxY: maxY + 1,
  };
}

function nodeVisible(node: NodeLayout, camera: CameraState, displayOptions: DisplayOptions, showShadows: boolean): boolean {
  const spanWorld = (showShadows ? node.maxCol - node.minCol : node.maxColNoShadows - node.minColNoShadows) + 1;
  return spanWorld * camera.zoom >= displayOptions.minNodeSpanPx;
}

function linkVisible(link: LinkLayout, camera: CameraState, displayOptions: DisplayOptions, showShadows: boolean): boolean {
  if (!showShadows && link.columnNoShadows === null) {
    return false;
  }
  const spanWorld = link.bottomRow - link.topRow + 1;
  return spanWorld * camera.zoom >= displayOptions.minLinkSpanPx;
}

function drawAnnotationBands(
  ctx: CanvasRenderingContext2D,
  annotations: AnnotationBand[],
  horizontal: boolean,
  camera: CameraState,
  worldBounds: WorldRect,
  viewport: ViewportSize,
  showLabels: boolean,
  labelMinZoom: number,
): void {
  for (const annotation of annotations) {
    const [ar, ag, ab] = rgbaFromHex(annotation.color, "#6078a8");
    const fillColor = rgbaToCss(ar, ag, ab, horizontal ? 0.14 : 0.12);
    if (horizontal) {
      const start = worldToScreen(camera, worldBounds.minX, annotation.start);
      const end = worldToScreen(camera, worldBounds.maxX, annotation.end + 1);
      const y = Math.min(start.y, end.y);
      const h = Math.max(1, Math.abs(end.y - start.y));
      ctx.fillStyle = fillColor;
      ctx.fillRect(0, y, viewport.width, h);
      if (showLabels && camera.zoom >= labelMinZoom && h > 10) {
        ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
        ctx.font = "11px Inter, sans-serif";
        ctx.fillText(annotation.label, 8, y + Math.min(h - 3, 14));
      }
    } else {
      const start = worldToScreen(camera, annotation.start, worldBounds.minY);
      const end = worldToScreen(camera, annotation.end + 1, worldBounds.maxY);
      const x = Math.min(start.x, end.x);
      const w = Math.max(1, Math.abs(end.x - start.x));
      ctx.fillStyle = fillColor;
      ctx.fillRect(x, 0, w, viewport.height);
      if (showLabels && camera.zoom >= labelMinZoom && w > 26) {
        ctx.save();
        ctx.translate(x + 4, 14);
        ctx.rotate(-Math.PI / 6);
        ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
        ctx.font = "11px Inter, sans-serif";
        ctx.fillText(annotation.label, 0, 0);
        ctx.restore();
      }
    }
  }
}

function drawSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  scene: SceneModel,
  selection: SelectionState,
  displayOptions: DisplayOptions,
  camera: CameraState,
  showShadows: boolean,
  alignmentView: AlignmentViewMode,
): void {
  ctx.save();
  ctx.strokeStyle = displayOptions.selectionColor;
  ctx.lineWidth = Math.max(1, displayOptions.selectionLineWidth);
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 2;

  for (const nodeId of selection.nodeIds) {
    const node = scene.nodes.find((entry) => entry.id === nodeId);
    if (!node) {
      continue;
    }
    const minCol = showShadows ? node.minCol : node.minColNoShadows;
    const maxCol = showShadows ? node.maxCol + 1 : node.maxColNoShadows + 1;
    const p1 = worldToScreen(camera, minCol, node.row + 0.5);
    const p2 = worldToScreen(camera, maxCol, node.row + 0.5);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  for (const linkIndex of selection.linkIndices) {
    const link = scene.links[linkIndex];
    if (!link || !relationIncluded(link.relation, alignmentView)) {
      continue;
    }
    const col = showShadows ? link.column + 0.5 : link.columnNoShadows === null ? -1 : link.columnNoShadows + 0.5;
    if (col < 0) {
      continue;
    }
    const p1 = worldToScreen(camera, col, link.topRow);
    const p2 = worldToScreen(camera, col, link.bottomRow + 1);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  ctx.restore();
}

function hitTest(
  scene: SceneModel,
  camera: CameraState,
  displayOptions: DisplayOptions,
  showShadows: boolean,
  alignmentView: AlignmentViewMode,
  screenX: number,
  screenY: number,
): { nodeId?: string; linkIndex?: number } | null {
  const world = screenToWorld(camera, screenX, screenY);
  const rowTol = Math.max(0.32, 6 / camera.zoom);
  const colTol = Math.max(0.26, 6 / camera.zoom);

  let bestNode: { nodeId: string; dist: number } | null = null;
  for (const node of scene.nodes) {
    if (!nodeVisible(node, camera, displayOptions, showShadows)) {
      continue;
    }
    const minCol = showShadows ? node.minCol : node.minColNoShadows;
    const maxCol = showShadows ? node.maxCol + 1 : node.maxColNoShadows + 1;
    const row = node.row + 0.5;
    if (world.x < minCol - colTol || world.x > maxCol + colTol) {
      continue;
    }
    const dist = Math.abs(world.y - row);
    if (dist > rowTol) {
      continue;
    }
    if (!bestNode || dist < bestNode.dist) {
      bestNode = { nodeId: node.id, dist };
    }
  }

  let bestLink: { linkIndex: number; dist: number } | null = null;
  for (const link of scene.links) {
    if (!relationIncluded(link.relation, alignmentView)) {
      continue;
    }
    if (!linkVisible(link, camera, displayOptions, showShadows)) {
      continue;
    }
    const col = showShadows ? link.column + 0.5 : link.columnNoShadows === null ? -1 : link.columnNoShadows + 0.5;
    if (col < 0) {
      continue;
    }
    if (world.y < link.topRow - rowTol || world.y > link.bottomRow + 1 + rowTol) {
      continue;
    }
    const dist = Math.abs(world.x - col);
    if (dist > colTol) {
      continue;
    }
    if (!bestLink || dist < bestLink.dist) {
      bestLink = { linkIndex: link.index, dist };
    }
  }

  if (!bestNode && !bestLink) {
    return null;
  }
  if (bestNode && (!bestLink || bestNode.dist <= bestLink.dist)) {
    return { nodeId: bestNode.nodeId };
  }
  return { linkIndex: bestLink!.linkIndex };
}

function selectInRect(
  scene: SceneModel,
  rect: WorldRect,
  showShadows: boolean,
  alignmentView: AlignmentViewMode,
): SelectionState {
  const normalized = normalizeRect(rect);
  const selectedNodes = new Set<string>();
  const selectedLinks = new Set<number>();
  for (const node of scene.nodes) {
    const minCol = showShadows ? node.minCol : node.minColNoShadows;
    const maxCol = showShadows ? node.maxCol + 1 : node.maxColNoShadows + 1;
    const nodeRect: WorldRect = {
      minX: minCol,
      maxX: maxCol,
      minY: node.row,
      maxY: node.row + 1,
    };
    if (rectIntersects(nodeRect, normalized)) {
      selectedNodes.add(node.id);
    }
  }

  for (const link of scene.links) {
    if (!relationIncluded(link.relation, alignmentView)) {
      continue;
    }
    const col = showShadows ? link.column + 0.5 : link.columnNoShadows === null ? -1 : link.columnNoShadows + 0.5;
    if (col < 0) {
      continue;
    }
    const linkRect: WorldRect = {
      minX: col - 0.2,
      maxX: col + 0.2,
      minY: link.topRow,
      maxY: link.bottomRow + 1,
    };
    if (rectIntersects(linkRect, normalized)) {
      selectedLinks.add(link.index);
    }
  }

  return {
    nodeIds: selectedNodes,
    linkIndices: selectedLinks,
  };
}

export function App() {
  const rendererInfo = useMemo(() => getRendererBackendSummary(), []);
  const [backend, setBackend] = useState<RendererBackend>(rendererInfo.backend);
  const [payload, setPayload] = useState<SessionPayload | null>(null);
  const [scene, setScene] = useState<SceneModel | null>(null);
  const [preparedBuffers, setPreparedBuffers] = useState<PreparedSceneBuffers | null>(null);
  const [displayOptions, setDisplayOptions] = useState<DisplayOptions>({ ...defaultDisplayOptions });
  const [alignmentView, setAlignmentView] = useState<AlignmentViewMode>("all");
  const [camera, setCamera] = useState<CameraState>(defaultCameraState);
  const [selection, setSelection] = useState<SelectionState>(emptySelection);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusMessage, setStatusMessage] = useState("Load a layout/session JSON file or a SIF network.");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [viewport, setViewport] = useState<ViewportSize>({ width: 980, height: 640 });
  const [fitRequest, setFitRequest] = useState(1);
  const [marquee, setMarquee] = useState<WorldRect | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WebGl2LineRenderer | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const dragStateRef = useRef<DragState>({
    mode: "none",
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startWorldX: 0,
    startWorldY: 0,
    moved: false,
  });

  useEffect(() => {
    const worker = new Worker(new URL("./workers/scenePrep.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<PrepareWorkerMessage>) => {
      if (event.data.type !== "prepared") {
        return;
      }
      setPreparedBuffers(event.data.payload);
      setIsPreparing(false);
    };
    worker.onerror = (error) => {
      setWarnings((prev) => [...prev, `Worker failed: ${error.message}`]);
      setIsPreparing(false);
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!scene) {
      setPreparedBuffers(null);
      return;
    }

    const payloadForPrep: ScenePrepInput = {
      nodeRows: scene.nodeRows,
      nodeMinCols: scene.nodeMinCols,
      nodeMaxCols: scene.nodeMaxCols,
      nodeMinColsNoShadows: scene.nodeMinColsNoShadows,
      nodeMaxColsNoShadows: scene.nodeMaxColsNoShadows,
      nodeColorsRgba: scene.nodeColorsRgba,
      linkCols: scene.linkCols,
      linkColsNoShadows: scene.linkColsNoShadows,
      linkTopRows: scene.linkTopRows,
      linkBottomRows: scene.linkBottomRows,
      linkColorsRgba: scene.linkColorsRgba,
      linkRelations: scene.linkRelations,
      alignmentView,
      zoomPxPerWorld: camera.zoom,
      minNodeSpanPx: displayOptions.minNodeSpanPx,
      minLinkSpanPx: displayOptions.minLinkSpanPx,
    };

    setIsPreparing(true);
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: "prepare",
        payload: payloadForPrep,
      });
    } else {
      setPreparedBuffers(buildPreparedSceneBuffers(payloadForPrep));
      setIsPreparing(false);
    }
  }, [
    scene,
    alignmentView,
    camera.zoom,
    displayOptions.minNodeSpanPx,
    displayOptions.minLinkSpanPx,
  ]);

  useEffect(() => {
    const canvas = baseCanvasRef.current;
    if (!canvas) {
      return;
    }
    if (backend === "webgl2") {
      try {
        rendererRef.current = new WebGl2LineRenderer(canvas);
      } catch (error) {
        rendererRef.current = null;
        setBackend("cpu-fallback");
        setWarnings((prev) => [
          ...prev,
          `Fell back to CPU renderer because WebGL2 initialization failed: ${(error as Error).message}`,
        ]);
      }
    } else {
      rendererRef.current = null;
    }
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [backend]);

  useEffect(() => {
    const observerTarget = viewportRef.current;
    if (!observerTarget) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const width = Math.max(200, Math.floor(entry.contentRect.width));
      const height = Math.max(200, Math.floor(entry.contentRect.height));
      setViewport({ width, height });
    });
    observer.observe(observerTarget);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const baseCanvas = baseCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (baseCanvas) {
      baseCanvas.width = viewport.width;
      baseCanvas.height = viewport.height;
    }
    if (overlayCanvas) {
      overlayCanvas.width = viewport.width;
      overlayCanvas.height = viewport.height;
    }
  }, [viewport]);

  useEffect(() => {
    if (!scene) {
      return;
    }
    const bounds = sceneWorldBounds(scene, displayOptions.showShadows);
    setCamera(fitCameraToRect(bounds, viewport.width, viewport.height, 34));
  }, [fitRequest, scene, displayOptions.showShadows, viewport.width, viewport.height]);

  useEffect(() => {
    const baseCanvas = baseCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!baseCanvas || !overlayCanvas) {
      return;
    }
    const overlayCtx = overlayCanvas.getContext("2d");
    if (!overlayCtx) {
      return;
    }

    if (!scene || !preparedBuffers) {
      overlayCtx.clearRect(0, 0, viewport.width, viewport.height);
      return;
    }

    if (backend === "webgl2" && rendererRef.current) {
      rendererRef.current.setPreparedBuffers(preparedBuffers);
      rendererRef.current.draw(camera, viewport.width, viewport.height, {
        showShadows: displayOptions.showShadows,
        backgroundColor: displayOptions.backgroundColor,
        nodeLineWidth: displayOptions.nodeLineWidth,
        linkLineWidth: displayOptions.linkLineWidth,
      });
    } else {
      const baseCtx = baseCanvas.getContext("2d");
      if (baseCtx) {
        drawPreparedBuffers2d(baseCtx, preparedBuffers, camera, viewport.width, viewport.height, {
          showShadows: displayOptions.showShadows,
          backgroundColor: displayOptions.backgroundColor,
          nodeLineWidth: displayOptions.nodeLineWidth,
          linkLineWidth: displayOptions.linkLineWidth,
        });
      }
    }

    overlayCtx.clearRect(0, 0, viewport.width, viewport.height);
    const worldBounds = sceneWorldBounds(scene, displayOptions.showShadows);
    if (displayOptions.showAnnotations) {
      const linkAnnotations = displayOptions.showShadows
        ? scene.linkAnnotations
        : scene.linkAnnotationsNoShadows;
      drawAnnotationBands(
        overlayCtx,
        linkAnnotations,
        false,
        camera,
        worldBounds,
        viewport,
        displayOptions.showAnnotationLabels,
        displayOptions.labelMinZoom,
      );
      drawAnnotationBands(
        overlayCtx,
        scene.nodeAnnotations,
        true,
        camera,
        worldBounds,
        viewport,
        displayOptions.showAnnotationLabels,
        displayOptions.labelMinZoom,
      );
    }

    drawSelectionOverlay(
      overlayCtx,
      scene,
      selection,
      displayOptions,
      camera,
      displayOptions.showShadows,
      alignmentView,
    );

    const selectedBounds = selectionBounds(scene, selection, displayOptions.showShadows);
    if (selectedBounds) {
      const topLeft = worldToScreen(camera, selectedBounds.minX, selectedBounds.minY);
      const bottomRight = worldToScreen(camera, selectedBounds.maxX, selectedBounds.maxY);
      overlayCtx.save();
      overlayCtx.strokeStyle = "rgba(250, 204, 21, 0.75)";
      overlayCtx.setLineDash([5, 5]);
      overlayCtx.lineWidth = 1.3;
      overlayCtx.strokeRect(
        Math.min(topLeft.x, bottomRight.x),
        Math.min(topLeft.y, bottomRight.y),
        Math.abs(bottomRight.x - topLeft.x),
        Math.abs(bottomRight.y - topLeft.y),
      );
      overlayCtx.restore();
    }

    if (displayOptions.showNodeLabels && camera.zoom >= displayOptions.labelMinZoom) {
      overlayCtx.save();
      overlayCtx.fillStyle = "rgba(221, 230, 246, 0.92)";
      overlayCtx.font = "12px Inter, sans-serif";
      let lastY = Number.NEGATIVE_INFINITY;
      for (const node of scene.nodes) {
        if (!nodeVisible(node, camera, displayOptions, displayOptions.showShadows)) {
          continue;
        }
        const x = (displayOptions.showShadows ? node.maxCol : node.maxColNoShadows) + 1.25;
        const y = node.row + 0.5;
        const screen = worldToScreen(camera, x, y);
        if (screen.y - lastY < 12) {
          continue;
        }
        if (screen.y < -20 || screen.y > viewport.height + 20) {
          continue;
        }
        overlayCtx.fillText(node.name, screen.x, screen.y + 4);
        lastY = screen.y;
      }
      overlayCtx.restore();
    }

    if (displayOptions.showLinkLabels && camera.zoom >= displayOptions.labelMinZoom) {
      overlayCtx.save();
      overlayCtx.fillStyle = "rgba(207, 219, 243, 0.9)";
      overlayCtx.font = "11px Inter, sans-serif";
      let lastX = Number.NEGATIVE_INFINITY;
      for (const link of scene.links) {
        if (!relationIncluded(link.relation, alignmentView)) {
          continue;
        }
        if (!linkVisible(link, camera, displayOptions, displayOptions.showShadows)) {
          continue;
        }
        const col = displayOptions.showShadows
          ? link.column + 0.5
          : link.columnNoShadows === null
            ? -1
            : link.columnNoShadows + 0.5;
        if (col < 0) {
          continue;
        }
        const screen = worldToScreen(camera, col + 0.2, link.topRow + 0.25);
        if (screen.x - lastX < 34) {
          continue;
        }
        if (screen.x < -20 || screen.x > viewport.width + 20) {
          continue;
        }
        overlayCtx.fillText(link.relation, screen.x, screen.y);
        lastX = screen.x;
      }
      overlayCtx.restore();
    }

    if (marquee) {
      const rect = normalizeRect(marquee);
      const p1 = worldToScreen(camera, rect.minX, rect.minY);
      const p2 = worldToScreen(camera, rect.maxX, rect.maxY);
      overlayCtx.save();
      overlayCtx.strokeStyle = "rgba(80, 188, 255, 0.95)";
      overlayCtx.lineWidth = 1.2;
      overlayCtx.setLineDash([6, 4]);
      overlayCtx.strokeRect(
        Math.min(p1.x, p2.x),
        Math.min(p1.y, p2.y),
        Math.abs(p2.x - p1.x),
        Math.abs(p2.y - p1.y),
      );
      overlayCtx.restore();
    }
  }, [
    alignmentView,
    backend,
    camera,
    displayOptions,
    marquee,
    preparedBuffers,
    scene,
    selection,
    viewport.height,
    viewport.width,
  ]);

  useEffect(() => {
    const canvas = minimapCanvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    if (!scene || !displayOptions.showOverview) {
      ctx.fillStyle = "rgba(35, 45, 70, 0.8)";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "rgba(177, 193, 224, 0.9)";
      ctx.font = "11px Inter, sans-serif";
      ctx.fillText("overview hidden", 8, 18);
      return;
    }

    const bounds = sceneWorldBounds(scene, displayOptions.showShadows);
    const spanX = Math.max(1, bounds.maxX - bounds.minX);
    const spanY = Math.max(1, bounds.maxY - bounds.minY);
    const sx = width / spanX;
    const sy = height / spanY;
    const toMiniX = (x: number) => (x - bounds.minX) * sx;
    const toMiniY = (y: number) => (y - bounds.minY) * sy;

    ctx.fillStyle = "rgba(20, 27, 43, 0.92)";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(61, 82, 128, 0.95)";
    ctx.lineWidth = 0.75;
    for (const node of scene.nodes) {
      const min = displayOptions.showShadows ? node.minCol : node.minColNoShadows;
      const max = displayOptions.showShadows ? node.maxCol : node.maxColNoShadows;
      const y = toMiniY(node.row + 0.5);
      ctx.beginPath();
      ctx.moveTo(toMiniX(min), y);
      ctx.lineTo(toMiniX(max + 1), y);
      ctx.stroke();
    }

    const viewportWorld = cameraViewportWorldRect(camera, viewport.width, viewport.height);
    ctx.strokeStyle = "rgba(255, 205, 70, 0.95)";
    ctx.lineWidth = 1.1;
    ctx.strokeRect(
      toMiniX(viewportWorld.minX),
      toMiniY(viewportWorld.minY),
      Math.max(1, toMiniX(viewportWorld.maxX) - toMiniX(viewportWorld.minX)),
      Math.max(1, toMiniY(viewportWorld.maxY) - toMiniY(viewportWorld.minY)),
    );
  }, [camera, displayOptions.showOverview, displayOptions.showShadows, scene, viewport.height, viewport.width]);

  const searchResults = useMemo(() => {
    if (!scene || searchQuery.trim().length === 0) {
      return [] as NodeLayout[];
    }
    const needle = searchQuery.trim().toLowerCase();
    return scene.nodes
      .filter((node) => node.id.toLowerCase().includes(needle) || node.name.toLowerCase().includes(needle))
      .slice(0, 30);
  }, [scene, searchQuery]);

  const relationSummary = useMemo(() => {
    if (!scene) {
      return [] as Array<{ relation: string; count: number }>;
    }
    const counts = new Map<string, number>();
    for (const link of scene.links) {
      counts.set(link.relation, (counts.get(link.relation) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([relation, count]) => ({ relation, count }))
      .sort((a, b) => b.count - a.count);
  }, [scene]);

  const applySelection = (updater: (next: SelectionState) => void) => {
    setSelection((previous) => {
      const next: SelectionState = {
        nodeIds: new Set(previous.nodeIds),
        linkIndices: new Set(previous.linkIndices),
      };
      updater(next);
      return next;
    });
  };

  const focusOnRect = (rect: WorldRect) => {
    setCamera(fitCameraToRect(rect, viewport.width, viewport.height, 56));
  };

  const locateNode = (nodeId: string) => {
    if (!scene) {
      return;
    }
    const node = scene.nodes.find((entry) => entry.id === nodeId);
    if (!node) {
      return;
    }
    setSelection({
      nodeIds: new Set([node.id]),
      linkIndices: new Set<number>(),
    });
    const rect: WorldRect = {
      minX: (displayOptions.showShadows ? node.minCol : node.minColNoShadows) - 2,
      maxX: (displayOptions.showShadows ? node.maxCol : node.maxColNoShadows) + 2,
      minY: node.row - 3,
      maxY: node.row + 3,
    };
    focusOnRect(rect);
  };

  const handleFileInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const content = await file.text();
      const nextPayload = parseBioFabricFile(file.name, content);
      const nextScene = buildSceneModel(nextPayload);
      setPayload(nextPayload);
      setScene(nextScene);
      setDisplayOptions({ ...nextPayload.displayOptions });
      setSelection(emptySelection());
      setWarnings(nextPayload.warnings);
      setStatusMessage(
        `Loaded ${file.name} (${formatSourceKind(nextPayload.sourceKind)}), ${nextScene.nodes.length} nodes, ${nextScene.links.length} links.`,
      );
      setFitRequest((prev) => prev + 1);
    } catch (error) {
      setStatusMessage(`Failed to load file: ${(error as Error).message}`);
    } finally {
      event.target.value = "";
    }
  };

  const exportPng = () => {
    const base = baseCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!base || !overlay) {
      return;
    }
    const out = document.createElement("canvas");
    out.width = base.width;
    out.height = base.height;
    const outCtx = out.getContext("2d");
    if (!outCtx) {
      return;
    }
    outCtx.drawImage(base, 0, 0);
    outCtx.drawImage(overlay, 0, 0);
    const link = document.createElement("a");
    link.href = out.toDataURL("image/png");
    link.download = "biofabric-view.png";
    link.click();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!scene) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const world = screenToWorld(camera, event.nativeEvent.offsetX, event.nativeEvent.offsetY);
    const mode = event.shiftKey ? "marquee" : "pan";
    dragStateRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startWorldX: world.x,
      startWorldY: world.y,
      moved: false,
    };
    if (mode === "marquee") {
      setMarquee({
        minX: world.x,
        maxX: world.x,
        minY: world.y,
        maxY: world.y,
      });
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!scene) {
      return;
    }
    const drag = dragStateRef.current;
    const offsetX = event.nativeEvent.offsetX;
    const offsetY = event.nativeEvent.offsetY;

    if (drag.mode === "pan" && (event.buttons & 1) === 1) {
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 2) {
        drag.moved = true;
      }
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      setCamera((previous) => ({
        ...previous,
        panX: previous.panX + dx,
        panY: previous.panY + dy,
      }));
      return;
    }

    if (drag.mode === "marquee" && (event.buttons & 1) === 1) {
      drag.moved = true;
      const world = screenToWorld(camera, offsetX, offsetY);
      setMarquee({
        minX: drag.startWorldX,
        maxX: world.x,
        minY: drag.startWorldY,
        maxY: world.y,
      });
      return;
    }

    const hit = hitTest(
      scene,
      camera,
      displayOptions,
      displayOptions.showShadows,
      alignmentView,
      offsetX,
      offsetY,
    );
    if (!hit) {
      setHover(null);
      return;
    }
    if (hit.nodeId) {
      const node = scene.nodes.find((entry) => entry.id === hit.nodeId);
      if (node) {
        setHover({
          title: `Node ${node.id}`,
          details: `row=${node.row}, span=${displayOptions.showShadows ? node.minCol : node.minColNoShadows}..${displayOptions.showShadows ? node.maxCol : node.maxColNoShadows}`,
        });
      }
      return;
    }
    if (hit.linkIndex !== undefined) {
      const link = scene.links[hit.linkIndex];
      if (link) {
        setHover({
          title: `Link ${link.sourceId} ${link.relation} ${link.targetId}`,
          details: `column=${displayOptions.showShadows ? link.column : link.columnNoShadows ?? "hidden"}, rows=${link.topRow}-${link.bottomRow}`,
        });
      }
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!scene) {
      return;
    }
    const drag = dragStateRef.current;
    const offsetX = event.nativeEvent.offsetX;
    const offsetY = event.nativeEvent.offsetY;

    if (drag.mode === "marquee") {
      if (marquee) {
        const chosen = selectInRect(scene, marquee, displayOptions.showShadows, alignmentView);
        if (event.shiftKey) {
          applySelection((next) => {
            chosen.nodeIds.forEach((id) => next.nodeIds.add(id));
            chosen.linkIndices.forEach((idx) => next.linkIndices.add(idx));
          });
        } else {
          setSelection(chosen);
        }
      }
      setMarquee(null);
      drag.mode = "none";
      return;
    }

    if (drag.mode === "pan" && !drag.moved) {
      const hit = hitTest(
        scene,
        camera,
        displayOptions,
        displayOptions.showShadows,
        alignmentView,
        offsetX,
        offsetY,
      );
      if (!hit) {
        if (!event.shiftKey) {
          setSelection(emptySelection());
        }
      } else if (hit.nodeId) {
        applySelection((next) => {
          if (!event.shiftKey) {
            next.nodeIds.clear();
            next.linkIndices.clear();
          }
          if (event.shiftKey && next.nodeIds.has(hit.nodeId!)) {
            next.nodeIds.delete(hit.nodeId!);
          } else {
            next.nodeIds.add(hit.nodeId!);
          }
        });
      } else if (hit.linkIndex !== undefined) {
        applySelection((next) => {
          if (!event.shiftKey) {
            next.nodeIds.clear();
            next.linkIndices.clear();
          }
          if (event.shiftKey && next.linkIndices.has(hit.linkIndex!)) {
            next.linkIndices.delete(hit.linkIndex!);
          } else {
            next.linkIndices.add(hit.linkIndex!);
          }
        });
      }
    }

    drag.mode = "none";
    drag.moved = false;
  };

  const handleWheel = (event: WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.1 : 0.9;
    setCamera((previous) => zoomAroundPoint(previous, factor, event.nativeEvent.offsetX, event.nativeEvent.offsetY));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && searchResults.length > 0) {
      locateNode(searchResults[0].id);
    }
  };

  const handleOverviewClick = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!scene) {
      return;
    }
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const bounds = sceneWorldBounds(scene, displayOptions.showShadows);
    const worldX = bounds.minX + (x / target.width) * (bounds.maxX - bounds.minX);
    const worldY = bounds.minY + (y / target.height) * (bounds.maxY - bounds.minY);
    setCamera((previous) => ({
      ...previous,
      panX: viewport.width / 2 - worldX * previous.zoom,
      panY: viewport.height / 2 - worldY * previous.zoom,
    }));
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>BioFabric Frontend</h1>
          <p>Interactive session/layout viewer with pan, zoom, selection, search, annotations, overview, and export.</p>
        </div>
        <div className="header-actions">
          <label className="file-btn">
            <input type="file" accept=".json,.sif,.bif,.xml" onChange={handleFileInput} />
            Load file
          </label>
          <button type="button" onClick={exportPng} disabled={!scene}>
            Export PNG
          </button>
          <button
            type="button"
            onClick={() => setBackend((prev) => (prev === "webgl2" ? "cpu-fallback" : "webgl2"))}
            disabled={!rendererInfo.webgl2Supported}
          >
            {backend === "webgl2" ? "Use CPU fallback" : "Use WebGL2"}
          </button>
        </div>
      </header>

      <section className="status-grid">
        <article className="status-card">
          <h2>Renderer backend</h2>
          <p>{backend}</p>
        </article>
        <article className="status-card">
          <h2>WebGL2 support</h2>
          <p>{rendererInfo.webgl2Supported ? "available" : "not available"}</p>
        </article>
        <article className="status-card">
          <h2>Source</h2>
          <p>{payload ? formatSourceKind(payload.sourceKind) : "none"}</p>
        </article>
        <article className="status-card">
          <h2>Scene stats</h2>
          <p>{scene ? `${scene.nodes.length} nodes / ${scene.links.length} links` : "no scene loaded"}</p>
        </article>
      </section>

      <section className="workspace-grid">
        <aside className="side-panel">
          <h2>Controls</h2>
          <div className="control-group">
            <label>
              Search node
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter node id/name"
                type="text"
              />
            </label>
            <div className="search-results">
              {searchResults.map((node) => (
                <button key={node.id} type="button" onClick={() => locateNode(node.id)}>
                  {node.name}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>
              Alignment view
              <select
                value={alignmentView}
                onChange={(event) => setAlignmentView(event.target.value as AlignmentViewMode)}
              >
                {ALIGNMENT_VIEWS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="control-group check-grid">
            <label>
              <input
                type="checkbox"
                checked={displayOptions.showShadows}
                onChange={(event) =>
                  setDisplayOptions((prev) => ({ ...prev, showShadows: event.target.checked }))
                }
              />
              Show shadows
            </label>
            <label>
              <input
                type="checkbox"
                checked={displayOptions.showAnnotations}
                onChange={(event) =>
                  setDisplayOptions((prev) => ({ ...prev, showAnnotations: event.target.checked }))
                }
              />
              Show annotations
            </label>
            <label>
              <input
                type="checkbox"
                checked={displayOptions.showAnnotationLabels}
                onChange={(event) =>
                  setDisplayOptions((prev) => ({ ...prev, showAnnotationLabels: event.target.checked }))
                }
              />
              Annotation labels
            </label>
            <label>
              <input
                type="checkbox"
                checked={displayOptions.showNodeLabels}
                onChange={(event) =>
                  setDisplayOptions((prev) => ({ ...prev, showNodeLabels: event.target.checked }))
                }
              />
              Node labels
            </label>
            <label>
              <input
                type="checkbox"
                checked={displayOptions.showLinkLabels}
                onChange={(event) =>
                  setDisplayOptions((prev) => ({ ...prev, showLinkLabels: event.target.checked }))
                }
              />
              Link labels
            </label>
            <label>
              <input
                type="checkbox"
                checked={displayOptions.showOverview}
                onChange={(event) =>
                  setDisplayOptions((prev) => ({ ...prev, showOverview: event.target.checked }))
                }
              />
              Overview panel
            </label>
          </div>

          <div className="control-group">
            <label>
              Label min zoom ({displayOptions.labelMinZoom.toFixed(1)})
              <input
                type="range"
                min={0}
                max={20}
                step={0.1}
                value={displayOptions.labelMinZoom}
                onChange={(event) =>
                  setDisplayOptions((prev) => ({
                    ...prev,
                    labelMinZoom: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label>
              Min node span px ({displayOptions.minNodeSpanPx.toFixed(1)})
              <input
                type="range"
                min={0}
                max={6}
                step={0.1}
                value={displayOptions.minNodeSpanPx}
                onChange={(event) =>
                  setDisplayOptions((prev) => ({
                    ...prev,
                    minNodeSpanPx: Number(event.target.value),
                  }))
                }
              />
            </label>
            <label>
              Min link span px ({displayOptions.minLinkSpanPx.toFixed(1)})
              <input
                type="range"
                min={0}
                max={6}
                step={0.1}
                value={displayOptions.minLinkSpanPx}
                onChange={(event) =>
                  setDisplayOptions((prev) => ({
                    ...prev,
                    minLinkSpanPx: Number(event.target.value),
                  }))
                }
              />
            </label>
          </div>

          <div className="control-row">
            <button type="button" onClick={() => setFitRequest((prev) => prev + 1)} disabled={!scene}>
              Fit scene
            </button>
            <button
              type="button"
              onClick={() => {
                const bounds = scene ? selectionBounds(scene, selection, displayOptions.showShadows) : null;
                if (bounds) {
                  focusOnRect(bounds);
                }
              }}
              disabled={!scene || selection.nodeIds.size + selection.linkIndices.size === 0}
            >
              Focus selection
            </button>
          </div>
          <div className="control-row">
            <button
              type="button"
              onClick={() =>
                setCamera((prev) =>
                  zoomAroundPoint(prev, 1.2, viewport.width / 2, viewport.height / 2),
                )
              }
              disabled={!scene}
            >
              Zoom in
            </button>
            <button
              type="button"
              onClick={() =>
                setCamera((prev) =>
                  zoomAroundPoint(prev, 0.85, viewport.width / 2, viewport.height / 2),
                )
              }
              disabled={!scene}
            >
              Zoom out
            </button>
            <button
              type="button"
              onClick={() => setSelection(emptySelection())}
              disabled={!scene || (selection.nodeIds.size === 0 && selection.linkIndices.size === 0)}
            >
              Clear selection
            </button>
          </div>
        </aside>

        <section className="canvas-panel">
          <div className="canvas-meta">
            <span>{statusMessage}</span>
            <span>
              zoom {clampZoom(camera.zoom).toFixed(2)} | pan {camera.panX.toFixed(1)}, {camera.panY.toFixed(1)}
            </span>
          </div>
          <div className="canvas-shell" ref={viewportRef}>
            <canvas ref={baseCanvasRef} className="render-canvas" />
            <canvas
              ref={overlayCanvasRef}
              className="overlay-canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onWheel={handleWheel}
            />
            {!scene && <div className="canvas-empty">Load a file to start rendering.</div>}
            {isPreparing && <div className="canvas-loading">Preparing buffers...</div>}
          </div>
          {hover && (
            <div className="hover-box">
              <strong>{hover.title}</strong>
              <span>{hover.details}</span>
            </div>
          )}
        </section>

        <aside className="side-panel">
          <h2>Overview + metrics</h2>
          <canvas
            ref={minimapCanvasRef}
            width={220}
            height={150}
            className="minimap"
            onPointerDown={handleOverviewClick}
          />

          <div className="metrics-list">
            <h3>Selection</h3>
            <p>{selection.nodeIds.size} nodes</p>
            <p>{selection.linkIndices.size} links</p>
            <h3>Alignment scores</h3>
            <p>EC: {payload?.alignmentScores ? payload.alignmentScores.ec.toFixed(4) : "n/a"}</p>
            <p>S3: {payload?.alignmentScores ? payload.alignmentScores.s3.toFixed(4) : "n/a"}</p>
            <p>ICS: {payload?.alignmentScores ? payload.alignmentScores.ics.toFixed(4) : "n/a"}</p>
            <p>NC: {payload?.alignmentScores?.nc?.toFixed(4) ?? "n/a"}</p>
            <p>NGS: {payload?.alignmentScores?.ngs?.toFixed(4) ?? "n/a"}</p>
            <p>LGS: {payload?.alignmentScores?.lgs?.toFixed(4) ?? "n/a"}</p>
            <p>JS: {payload?.alignmentScores?.js?.toFixed(4) ?? "n/a"}</p>
            <h3>Relations</h3>
            <ul>
              {relationSummary.slice(0, 10).map((entry) => (
                <li key={entry.relation}>
                  <code>{entry.relation}</code>: {entry.count}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>

      {(warnings.length > 0 || statusMessage.length > 0) && (
        <section className="message-strip">
          <p>{statusMessage}</p>
          {warnings.map((warning, index) => (
            <p key={`${warning}-${index}`} className="warning">
              {warning}
            </p>
          ))}
        </section>
      )}

      <footer className="app-footer">
        <small>
          Rendering pipeline: typed parsing to worker buffer preparation to {backend} draw pass, then overlay
          annotations, labels, and selection.
        </small>
        <small>Default line width target: {defaultRendererConfig.lineWidthPx}px</small>
      </footer>
    </main>
  );
}
