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
