import type { AlignmentViewMode } from "../types/biofabric";

export interface ScenePrepInput {
  nodeRows: Float32Array;
  nodeMinCols: Float32Array;
  nodeMaxCols: Float32Array;
  nodeMinColsNoShadows: Float32Array;
  nodeMaxColsNoShadows: Float32Array;
  nodeColorsRgba: Float32Array;
  linkCols: Float32Array;
  linkColsNoShadows: Float32Array;
  linkTopRows: Float32Array;
  linkBottomRows: Float32Array;
  linkColorsRgba: Float32Array;
  linkRelations: string[];
  alignmentView: AlignmentViewMode;
  zoomPxPerWorld: number;
  minNodeSpanPx: number;
  minLinkSpanPx: number;
}

export interface PreparedSceneBuffers {
  nodeVerticesShadow: Float32Array;
  nodeVerticesNoShadows: Float32Array;
  linkVerticesShadow: Float32Array;
  linkVerticesNoShadows: Float32Array;
}

const ORPHAN_RELATIONS = new Set(["pBb", "bBb", "pRr", "rRr"]);
const CYCLE_RELATIONS = new Set(["P", "pBp", "pRp"]);

export function relationIncluded(relation: string, view: AlignmentViewMode): boolean {
  if (view === "all" || view === "group") {
    return true;
  }
  if (view === "orphan") {
    return ORPHAN_RELATIONS.has(relation);
  }
  if (view === "cycle") {
    return CYCLE_RELATIONS.has(relation);
  }
  return true;
}

function lineCountForLinks(
  cols: Float32Array,
  topRows: Float32Array,
  bottomRows: Float32Array,
  minWorldSpan: number,
  relations: string[],
  view: AlignmentViewMode,
): number {
  let count = 0;
  for (let i = 0; i < cols.length; i += 1) {
    if (cols[i] < 0) {
      continue;
    }
    if (!relationIncluded(relations[i] ?? "", view)) {
      continue;
    }
    const span = bottomRows[i] - topRows[i];
    if (span < minWorldSpan) {
      continue;
    }
    count += 1;
  }
  return count;
}

function writeLine(
  out: Float32Array,
  writeOffset: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: number,
  g: number,
  b: number,
  a: number,
): number {
  out[writeOffset] = x1;
  out[writeOffset + 1] = y1;
  out[writeOffset + 2] = r;
  out[writeOffset + 3] = g;
  out[writeOffset + 4] = b;
  out[writeOffset + 5] = a;

  out[writeOffset + 6] = x2;
  out[writeOffset + 7] = y2;
  out[writeOffset + 8] = r;
  out[writeOffset + 9] = g;
  out[writeOffset + 10] = b;
  out[writeOffset + 11] = a;
  return writeOffset + 12;
}

export function buildPreparedSceneBuffers(input: ScenePrepInput): PreparedSceneBuffers {
  const zoom = Math.max(input.zoomPxPerWorld, 1e-6);
  const minNodeWorldSpan = Math.max(0, input.minNodeSpanPx) / zoom;
  const minLinkWorldSpan = Math.max(0, input.minLinkSpanPx) / zoom;

  const lineCountForNodesWithThreshold = (minCols: Float32Array, maxCols: Float32Array): number => {
    let count = 0;
    for (let i = 0; i < minCols.length; i += 1) {
      const span = maxCols[i] - minCols[i];
      if (span >= minNodeWorldSpan) {
        count += 1;
      }
    }
    return count;
  };

  const nodeLineCountShadow = lineCountForNodesWithThreshold(input.nodeMinCols, input.nodeMaxCols);
  const nodeLineCountNoShadows = lineCountForNodesWithThreshold(
    input.nodeMinColsNoShadows,
    input.nodeMaxColsNoShadows,
  );
  const linkLineCountShadow = lineCountForLinks(
    input.linkCols,
    input.linkTopRows,
    input.linkBottomRows,
    minLinkWorldSpan,
    input.linkRelations,
    input.alignmentView,
  );
  const linkLineCountNoShadows = lineCountForLinks(
    input.linkColsNoShadows,
    input.linkTopRows,
    input.linkBottomRows,
    minLinkWorldSpan,
    input.linkRelations,
    input.alignmentView,
  );

  const nodeVerticesShadow = new Float32Array(nodeLineCountShadow * 12);
  const nodeVerticesNoShadows = new Float32Array(nodeLineCountNoShadows * 12);
  const linkVerticesShadow = new Float32Array(linkLineCountShadow * 12);
  const linkVerticesNoShadows = new Float32Array(linkLineCountNoShadows * 12);

  let nodeShadowOffset = 0;
  let nodeNoShadowOffset = 0;
  for (let i = 0; i < input.nodeRows.length; i += 1) {
    const colorOffset = i * 4;
    const r = input.nodeColorsRgba[colorOffset];
    const g = input.nodeColorsRgba[colorOffset + 1];
    const b = input.nodeColorsRgba[colorOffset + 2];
    const a = input.nodeColorsRgba[colorOffset + 3];
    const y = input.nodeRows[i];

    if (input.nodeMaxCols[i] - input.nodeMinCols[i] >= minNodeWorldSpan) {
      nodeShadowOffset = writeLine(
        nodeVerticesShadow,
        nodeShadowOffset,
        input.nodeMinCols[i],
        y,
        input.nodeMaxCols[i],
        y,
        r,
        g,
        b,
        a,
      );
    }

    if (input.nodeMaxColsNoShadows[i] - input.nodeMinColsNoShadows[i] >= minNodeWorldSpan) {
      nodeNoShadowOffset = writeLine(
        nodeVerticesNoShadows,
        nodeNoShadowOffset,
        input.nodeMinColsNoShadows[i],
        y,
        input.nodeMaxColsNoShadows[i],
        y,
        r,
        g,
        b,
        a,
      );
    }
  }

  let linkShadowOffset = 0;
  let linkNoShadowOffset = 0;
  for (let i = 0; i < input.linkCols.length; i += 1) {
    if (!relationIncluded(input.linkRelations[i] ?? "", input.alignmentView)) {
      continue;
    }

    const colorOffset = i * 4;
    const r = input.linkColorsRgba[colorOffset];
    const g = input.linkColorsRgba[colorOffset + 1];
    const b = input.linkColorsRgba[colorOffset + 2];
    const a = input.linkColorsRgba[colorOffset + 3];
    const yTop = input.linkTopRows[i];
    const yBottom = input.linkBottomRows[i];
    if (yBottom - yTop < minLinkWorldSpan) {
      continue;
    }

    const shadowCol = input.linkCols[i];
    if (shadowCol >= 0) {
      linkShadowOffset = writeLine(
        linkVerticesShadow,
        linkShadowOffset,
        shadowCol,
        yTop,
        shadowCol,
        yBottom,
        r,
        g,
        b,
        a,
      );
    }

    const noShadowCol = input.linkColsNoShadows[i];
    if (noShadowCol >= 0) {
      linkNoShadowOffset = writeLine(
        linkVerticesNoShadows,
        linkNoShadowOffset,
        noShadowCol,
        yTop,
        noShadowCol,
        yBottom,
        r,
        g,
        b,
        a,
      );
    }
  }

  return {
    nodeVerticesShadow,
    nodeVerticesNoShadows,
    linkVerticesShadow,
    linkVerticesNoShadows,
  };
}
