export interface CameraState {
  zoom: number;
  panX: number;
  panY: number;
}

export const defaultCameraState: CameraState = {
  zoom: 1,
  panX: 0,
  panY: 0,
};

export interface WorldPoint {
  x: number;
  y: number;
}

export interface WorldRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 120;

export function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

export function worldToScreen(camera: CameraState, worldX: number, worldY: number): WorldPoint {
  return {
    x: worldX * camera.zoom + camera.panX,
    y: worldY * camera.zoom + camera.panY,
  };
}

export function screenToWorld(camera: CameraState, screenX: number, screenY: number): WorldPoint {
  return {
    x: (screenX - camera.panX) / camera.zoom,
    y: (screenY - camera.panY) / camera.zoom,
  };
}

export function cameraViewportWorldRect(
  camera: CameraState,
  viewportWidth: number,
  viewportHeight: number,
): WorldRect {
  const topLeft = screenToWorld(camera, 0, 0);
  const bottomRight = screenToWorld(camera, viewportWidth, viewportHeight);
  return normalizeRect({
    minX: topLeft.x,
    minY: topLeft.y,
    maxX: bottomRight.x,
    maxY: bottomRight.y,
  });
}

export function normalizeRect(rect: WorldRect): WorldRect {
  return {
    minX: Math.min(rect.minX, rect.maxX),
    minY: Math.min(rect.minY, rect.maxY),
    maxX: Math.max(rect.minX, rect.maxX),
    maxY: Math.max(rect.minY, rect.maxY),
  };
}

export function fitCameraToRect(
  target: WorldRect,
  viewportWidth: number,
  viewportHeight: number,
  paddingPx = 24,
): CameraState {
  const rect = normalizeRect(target);
  const width = Math.max(1e-6, rect.maxX - rect.minX);
  const height = Math.max(1e-6, rect.maxY - rect.minY);
  const usableWidth = Math.max(1, viewportWidth - paddingPx * 2);
  const usableHeight = Math.max(1, viewportHeight - paddingPx * 2);
  const zoom = clampZoom(Math.min(usableWidth / width, usableHeight / height));

  const centerX = rect.minX + width / 2;
  const centerY = rect.minY + height / 2;
  return {
    zoom,
    panX: viewportWidth / 2 - centerX * zoom,
    panY: viewportHeight / 2 - centerY * zoom,
  };
}

export function zoomAroundPoint(
  camera: CameraState,
  factor: number,
  anchorScreenX: number,
  anchorScreenY: number,
): CameraState {
  const anchorWorld = screenToWorld(camera, anchorScreenX, anchorScreenY);
  const nextZoom = clampZoom(camera.zoom * factor);
  return {
    zoom: nextZoom,
    panX: anchorScreenX - anchorWorld.x * nextZoom,
    panY: anchorScreenY - anchorWorld.y * nextZoom,
  };
}

export function rectIntersects(a: WorldRect, b: WorldRect): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}
