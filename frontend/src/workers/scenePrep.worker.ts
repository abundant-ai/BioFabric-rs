export interface ScenePrepRequest {
  nodeRows: Float32Array;
  nodeMinCols: Float32Array;
  nodeMaxCols: Float32Array;
  linkCols: Float32Array;
  linkSourceRows: Float32Array;
  linkTargetRows: Float32Array;
}

export interface ScenePrepResponse {
  nodeCount: number;
  linkCount: number;
}

self.onmessage = (event: MessageEvent<ScenePrepRequest>) => {
  const payload = event.data;
  const response: ScenePrepResponse = {
    nodeCount: payload.nodeRows.length,
    linkCount: payload.linkCols.length,
  };

  self.postMessage(response);
};
