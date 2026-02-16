import type { NetworkLayout, SceneModel, SessionPayload } from "../types/biofabric";

function ensureLayout(layout: NetworkLayout | null): NetworkLayout {
  if (!layout) {
    throw new Error("Session does not include a computed layout");
  }
  return layout;
}

export function parseSessionPayload(input: unknown): SessionPayload {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid session payload");
  }

  const maybePayload = input as Partial<SessionPayload>;
  if (!("displayOptions" in maybePayload)) {
    throw new Error("Session payload missing display options");
  }

  return {
    layout: maybePayload.layout ?? null,
    displayOptions: maybePayload.displayOptions as SessionPayload["displayOptions"],
  };
}

export function buildSceneModel(payload: SessionPayload): SceneModel {
  const layout = ensureLayout(payload.layout);

  return {
    nodeRows: Float32Array.from(layout.nodes.map((node) => node.row)),
    nodeMinCols: Float32Array.from(layout.nodes.map((node) => node.minCol)),
    nodeMaxCols: Float32Array.from(layout.nodes.map((node) => node.maxCol)),
    linkCols: Float32Array.from(layout.links.map((link) => link.col)),
    linkSourceRows: Float32Array.from(layout.links.map((link) => link.sourceRow)),
    linkTargetRows: Float32Array.from(layout.links.map((link) => link.targetRow)),
  };
}
