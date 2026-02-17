import { buildPreparedSceneBuffers, type ScenePrepInput } from "../lib/scenePrep";

interface PrepareRequest {
  type: "prepare";
  requestId: number;
  payload: ScenePrepInput;
}

interface PreparedResponse {
  type: "prepared";
  requestId: number;
  payload: ReturnType<typeof buildPreparedSceneBuffers>;
}

type SceneWorkerRequest = PrepareRequest;
type SceneWorkerResponse = PreparedResponse;

self.onmessage = (event: MessageEvent<SceneWorkerRequest>) => {
  if (event.data.type !== "prepare") {
    return;
  }

  const prepared = buildPreparedSceneBuffers(event.data.payload);
  const response: SceneWorkerResponse = {
    type: "prepared",
    requestId: event.data.requestId,
    payload: prepared,
  };

  const transfer: Transferable[] = [
    prepared.nodeVerticesShadow.buffer,
    prepared.nodeVerticesNoShadows.buffer,
    prepared.linkVerticesShadow.buffer,
    prepared.linkVerticesNoShadows.buffer,
  ];

  self.postMessage(response, { transfer });
};
