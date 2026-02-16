import { linkColorForRelation, nodeColorForId } from "./colors";
import type {
  AlignmentScores,
  AnnotationBand,
  DisplayOptions,
  LinkLayout,
  NetworkLayout,
  NodeLayout,
  SceneModel,
  SessionPayload,
  SessionSourceKind,
} from "../types/biofabric";

const DEFAULT_RELATION = "pp";
const DEFAULT_SCHEMA_VERSION = 1;

export const defaultDisplayOptions: DisplayOptions = {
  showShadows: true,
  showAnnotations: true,
  showAnnotationLabels: true,
  showNodeLabels: true,
  showLinkLabels: false,
  labelMinZoom: 4,
  minNodeSpanPx: 1,
  minLinkSpanPx: 0.5,
  backgroundColor: "#ffffff",
  nodeZoneColoring: false,
  selectionColor: "#ffff00",
  nodeLineWidth: 2,
  linkLineWidth: 1,
  selectionLineWidth: 3,
  showOverview: true,
  nodeLighterLevel: 0.43,
  linkDarkerLevel: 0.43,
  minDrainZone: 1,
  shadowsExplicit: false,
};

interface BareLink {
  source: string;
  target: string;
  relation: string;
  isShadow: boolean;
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseNumber(
  src: Record<string, unknown>,
  keys: string[],
  fallback: number,
  context: string,
): number {
  for (const key of keys) {
    const value = src[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return fallback;
}

function parseNullableNumber(
  src: Record<string, unknown>,
  keys: string[],
  fallback: number | null,
): number | null {
  for (const key of keys) {
    const value = src[key];
    if (value === null) {
      return null;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return fallback;
}

function parseBoolean(
  src: Record<string, unknown>,
  keys: string[],
  fallback: boolean,
): boolean {
  for (const key of keys) {
    const value = src[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value !== 0;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "yes" || normalized === "1") {
        return true;
      }
      if (normalized === "false" || normalized === "no" || normalized === "0") {
        return false;
      }
    }
  }
  return fallback;
}

function parseString(src: Record<string, unknown>, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = src[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return fallback;
}

function parseNodeId(value: unknown, context: string): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj["0"] === "string") {
      return obj["0"];
    }
  }
  throw new Error(`Missing node identifier in ${context}`);
}

function parseAnnotationSet(rawSet: unknown, context: string): AnnotationBand[] {
  if (!rawSet) {
    return [];
  }
  const record = asRecord(rawSet, context);
  const list = record.annotations;
  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((entry, idx) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const annotation = entry as Record<string, unknown>;
      const start = parseNumber(annotation, ["start", "min"], 0, `${context}[${idx}]`);
      const end = parseNumber(annotation, ["end", "max"], start, `${context}[${idx}]`);
      return {
        label: parseString(annotation, ["name", "label"], `annotation-${idx + 1}`),
        start: Math.max(0, Math.floor(start)),
        end: Math.max(Math.max(0, Math.floor(start)), Math.floor(end)),
        layer: Math.max(0, Math.floor(parseNumber(annotation, ["layer"], 0, `${context}[${idx}]`))),
        color: parseString(annotation, ["color"], "#6078a8"),
      } satisfies AnnotationBand;
    })
    .filter((annotation): annotation is AnnotationBand => annotation !== null);
}

function parseDisplayOptions(input: unknown): DisplayOptions {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ...defaultDisplayOptions };
  }

  const raw = input as Record<string, unknown>;
  return {
    showShadows: parseBoolean(raw, ["show_shadows", "showShadows"], defaultDisplayOptions.showShadows),
    showAnnotations: parseBoolean(
      raw,
      ["show_annotations", "showAnnotations"],
      defaultDisplayOptions.showAnnotations,
    ),
    showAnnotationLabels: parseBoolean(
      raw,
      ["show_annotation_labels", "showAnnotationLabels"],
      defaultDisplayOptions.showAnnotationLabels,
    ),
    showNodeLabels: parseBoolean(
      raw,
      ["show_node_labels", "showNodeLabels"],
      defaultDisplayOptions.showNodeLabels,
    ),
    showLinkLabels: parseBoolean(
      raw,
      ["show_link_labels", "showLinkLabels"],
      defaultDisplayOptions.showLinkLabels,
    ),
    labelMinZoom: parseNumber(raw, ["label_min_zoom", "labelMinZoom"], defaultDisplayOptions.labelMinZoom, "display options"),
    minNodeSpanPx: parseNumber(
      raw,
      ["min_node_span_px", "minNodeSpanPx"],
      defaultDisplayOptions.minNodeSpanPx,
      "display options",
    ),
    minLinkSpanPx: parseNumber(
      raw,
      ["min_link_span_px", "minLinkSpanPx"],
      defaultDisplayOptions.minLinkSpanPx,
      "display options",
    ),
    backgroundColor: parseString(
      raw,
      ["background_color", "backgroundColor"],
      defaultDisplayOptions.backgroundColor,
    ),
    nodeZoneColoring: parseBoolean(
      raw,
      ["node_zone_coloring", "nodeZoneColoring"],
      defaultDisplayOptions.nodeZoneColoring,
    ),
    selectionColor: parseString(raw, ["selection_color", "selectionColor"], defaultDisplayOptions.selectionColor),
    nodeLineWidth: parseNumber(raw, ["node_line_width", "nodeLineWidth"], defaultDisplayOptions.nodeLineWidth, "display options"),
    linkLineWidth: parseNumber(raw, ["link_line_width", "linkLineWidth"], defaultDisplayOptions.linkLineWidth, "display options"),
    selectionLineWidth: parseNumber(
      raw,
      ["selection_line_width", "selectionLineWidth"],
      defaultDisplayOptions.selectionLineWidth,
      "display options",
    ),
    showOverview: parseBoolean(raw, ["show_overview", "showOverview"], defaultDisplayOptions.showOverview),
    nodeLighterLevel: parseNumber(
      raw,
      ["node_lighter_level", "nodeLighterLevel"],
      defaultDisplayOptions.nodeLighterLevel,
      "display options",
    ),
    linkDarkerLevel: parseNumber(
      raw,
      ["link_darker_level", "linkDarkerLevel"],
      defaultDisplayOptions.linkDarkerLevel,
      "display options",
    ),
    minDrainZone: Math.floor(
      parseNumber(raw, ["min_drain_zone", "minDrainZone"], defaultDisplayOptions.minDrainZone, "display options"),
    ),
    shadowsExplicit: parseBoolean(
      raw,
      ["shadows_explicit", "shadowsExplicit"],
      defaultDisplayOptions.shadowsExplicit,
    ),
  };
}

function parseNodeEntries(nodesRaw: unknown): Array<[string, Record<string, unknown>]> {
  if (!nodesRaw) {
    return [];
  }
  if (Array.isArray(nodesRaw)) {
    return nodesRaw.flatMap((entry) => {
      if (!Array.isArray(entry) || entry.length < 2) {
        return [];
      }
      const [idRaw, nodeRaw] = entry;
      if (!nodeRaw || typeof nodeRaw !== "object" || Array.isArray(nodeRaw)) {
        return [];
      }
      return [[String(idRaw), nodeRaw as Record<string, unknown>]];
    });
  }
  const record = asRecord(nodesRaw, "layout.nodes");
  return Object.entries(record).flatMap(([id, nodeRaw]) => {
    if (!nodeRaw || typeof nodeRaw !== "object" || Array.isArray(nodeRaw)) {
      return [];
    }
    return [[id, nodeRaw as Record<string, unknown>]];
  });
}

function parseLayout(rawLayout: unknown): NetworkLayout {
  const layoutRecord = asRecord(rawLayout, "layout");
  const nodeEntries = parseNodeEntries(layoutRecord.nodes);

  const nodes: NodeLayout[] = nodeEntries.map(([id, rawNode], index) => {
    const row = Math.max(0, Math.floor(parseNumber(rawNode, ["row"], index, `node ${id}`)));
    const minCol = Math.max(0, Math.floor(parseNumber(rawNode, ["min_col", "minCol"], 0, `node ${id}`)));
    const maxCol = Math.max(minCol, Math.floor(parseNumber(rawNode, ["max_col", "maxCol"], minCol, `node ${id}`)));
    const minColNoShadows = Math.max(
      0,
      Math.floor(parseNumber(rawNode, ["min_col_no_shadows", "minColNoShadows"], minCol, `node ${id}`)),
    );
    const maxColNoShadows = Math.max(
      minColNoShadows,
      Math.floor(
        parseNumber(rawNode, ["max_col_no_shadows", "maxColNoShadows"], minColNoShadows, `node ${id}`),
      ),
    );

    return {
      id,
      name: parseString(rawNode, ["name"], id),
      row,
      minCol,
      maxCol,
      minColNoShadows,
      maxColNoShadows,
      colorIndex: Math.max(0, Math.floor(parseNumber(rawNode, ["color_index", "colorIndex"], row, `node ${id}`))),
    };
  });

  nodes.sort((a, b) => (a.row === b.row ? a.id.localeCompare(b.id) : a.row - b.row));

  const linksRaw = layoutRecord.links;
  if (!Array.isArray(linksRaw)) {
    throw new Error("layout.links must be an array");
  }

  const links: LinkLayout[] = linksRaw.map((rawLink, index) => {
    const linkRecord = asRecord(rawLink, `layout.links[${index}]`);
    const sourceRow = Math.max(
      0,
      Math.floor(parseNumber(linkRecord, ["source_row", "sourceRow"], 0, `link ${index}`)),
    );
    const targetRow = Math.max(
      0,
      Math.floor(parseNumber(linkRecord, ["target_row", "targetRow"], sourceRow, `link ${index}`)),
    );
    const column = Math.max(0, Math.floor(parseNumber(linkRecord, ["column", "col"], index, `link ${index}`)));
    const columnNoShadows = parseNullableNumber(
      linkRecord,
      ["column_no_shadows", "columnNoShadows"],
      null,
    );
    return {
      index,
      sourceId: parseNodeId(linkRecord.source, `link ${index} source`),
      targetId: parseNodeId(linkRecord.target, `link ${index} target`),
      relation: parseString(linkRecord, ["relation"], DEFAULT_RELATION),
      column,
      columnNoShadows: columnNoShadows === null ? null : Math.max(0, Math.floor(columnNoShadows)),
      sourceRow,
      targetRow,
      topRow: Math.min(sourceRow, targetRow),
      bottomRow: Math.max(sourceRow, targetRow),
      colorIndex: Math.max(
        0,
        Math.floor(parseNumber(linkRecord, ["color_index", "colorIndex"], index, `link ${index}`)),
      ),
      isShadow: parseBoolean(linkRecord, ["is_shadow", "isShadow"], false),
    };
  });

  const rowCountFromNodes = nodes.reduce((max, node) => Math.max(max, node.row + 1), 0);
  const rowCountField = Math.max(
    0,
    Math.floor(parseNumber(layoutRecord, ["row_count", "rowCount"], rowCountFromNodes, "layout")),
  );
  const rowCount = Math.max(rowCountFromNodes, rowCountField);

  const columnCountFromLinks = links.reduce((max, link) => Math.max(max, link.column + 1), 0);
  const columnCountField = Math.max(
    0,
    Math.floor(parseNumber(layoutRecord, ["column_count", "columnCount"], columnCountFromLinks, "layout")),
  );
  const columnCount = Math.max(columnCountFromLinks, columnCountField);

  const columnCountNoShadowsFromLinks = links.reduce((max, link) => {
    if (link.columnNoShadows === null) {
      return max;
    }
    return Math.max(max, link.columnNoShadows + 1);
  }, 0);
  const columnCountNoShadowsField = Math.max(
    0,
    Math.floor(
      parseNumber(
        layoutRecord,
        ["column_count_no_shadows", "columnCountNoShadows"],
        columnCountNoShadowsFromLinks,
        "layout",
      ),
    ),
  );

  const linkGroupOrder = Array.isArray(layoutRecord.link_group_order)
    ? layoutRecord.link_group_order.filter((entry): entry is string => typeof entry === "string")
    : [];

  return {
    nodes,
    links,
    rowCount,
    columnCount,
    columnCountNoShadows: Math.max(columnCountNoShadowsFromLinks, columnCountNoShadowsField),
    nodeAnnotations: parseAnnotationSet(layoutRecord.node_annotations, "layout.node_annotations"),
    linkAnnotations: parseAnnotationSet(layoutRecord.link_annotations, "layout.link_annotations"),
    linkAnnotationsNoShadows: parseAnnotationSet(
      layoutRecord.link_annotations_no_shadows,
      "layout.link_annotations_no_shadows",
    ),
    linkGroupOrder,
  };
}

function parseNetworkLinks(linksRaw: unknown): BareLink[] {
  if (!Array.isArray(linksRaw)) {
    return [];
  }
  return linksRaw.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }
    const link = entry as Record<string, unknown>;
    const source = parseNodeId(link.source, `network.links[${index}].source`);
    const target = parseNodeId(link.target, `network.links[${index}].target`);
    return [
      {
        source,
        target,
        relation: parseString(link, ["relation"], DEFAULT_RELATION),
        isShadow: parseBoolean(link, ["is_shadow", "isShadow"], false),
      } satisfies BareLink,
    ];
  });
}

function parseNetworkNodes(nodesRaw: unknown): string[] {
  if (!nodesRaw) {
    return [];
  }

  if (Array.isArray(nodesRaw)) {
    const ids: string[] = [];
    for (const entry of nodesRaw) {
      if (Array.isArray(entry) && entry.length >= 1) {
        ids.push(String(entry[0]));
        continue;
      }
      if (entry && typeof entry === "object") {
        const node = entry as Record<string, unknown>;
        if (node.id !== undefined) {
          try {
            ids.push(parseNodeId(node.id, "network.nodes[].id"));
            continue;
          } catch {
            // fall through
          }
        }
      }
      if (typeof entry === "string") {
        ids.push(entry);
      }
    }
    return ids;
  }

  const record = asRecord(nodesRaw, "network.nodes");
  return Object.keys(record);
}

function buildFallbackLayout(nodesInOrder: string[], linksInOrder: BareLink[]): NetworkLayout {
  const dedupNodes = new Set<string>();
  const nodeOrder: string[] = [];
  for (const node of nodesInOrder) {
    if (!dedupNodes.has(node)) {
      dedupNodes.add(node);
      nodeOrder.push(node);
    }
  }
  for (const link of linksInOrder) {
    if (!dedupNodes.has(link.source)) {
      dedupNodes.add(link.source);
      nodeOrder.push(link.source);
    }
    if (!dedupNodes.has(link.target)) {
      dedupNodes.add(link.target);
      nodeOrder.push(link.target);
    }
  }

  const rowByNode = new Map<string, number>();
  nodeOrder.forEach((nodeId, idx) => {
    rowByNode.set(nodeId, idx);
  });

  const regularLinks = linksInOrder.filter((link) => !link.isShadow);
  const shadowLinks = linksInOrder.filter((link) => link.isShadow);
  const generatedShadows: BareLink[] = [];
  if (shadowLinks.length === 0) {
    for (const link of regularLinks) {
      if (link.source === link.target) {
        continue;
      }
      generatedShadows.push({
        source: link.target,
        target: link.source,
        relation: link.relation,
        isShadow: true,
      });
    }
  }

  const links = shadowLinks.length === 0 ? [...regularLinks, ...generatedShadows] : linksInOrder;
  let noShadowColumn = 0;
  const normalizedLinks: LinkLayout[] = links.map((link, index) => {
    const srcRow = rowByNode.get(link.source) ?? 0;
    const trgRow = rowByNode.get(link.target) ?? 0;
    const isShadow = link.isShadow;
    const columnNoShadows = isShadow ? null : noShadowColumn++;
    return {
      index,
      sourceId: link.source,
      targetId: link.target,
      relation: link.relation,
      column: index,
      columnNoShadows,
      sourceRow: srcRow,
      targetRow: trgRow,
      topRow: Math.min(srcRow, trgRow),
      bottomRow: Math.max(srcRow, trgRow),
      colorIndex: index,
      isShadow,
    };
  });

  const minByNodeShadow = new Map<string, number>();
  const maxByNodeShadow = new Map<string, number>();
  const minByNodeNoShadow = new Map<string, number>();
  const maxByNodeNoShadow = new Map<string, number>();

  for (const nodeId of nodeOrder) {
    minByNodeShadow.set(nodeId, Number.POSITIVE_INFINITY);
    maxByNodeShadow.set(nodeId, -1);
    minByNodeNoShadow.set(nodeId, Number.POSITIVE_INFINITY);
    maxByNodeNoShadow.set(nodeId, -1);
  }

  for (const link of normalizedLinks) {
    const updateShadow = (nodeId: string, col: number) => {
      minByNodeShadow.set(nodeId, Math.min(minByNodeShadow.get(nodeId) ?? col, col));
      maxByNodeShadow.set(nodeId, Math.max(maxByNodeShadow.get(nodeId) ?? col, col));
    };
    updateShadow(link.sourceId, link.column);
    updateShadow(link.targetId, link.column);

    if (link.columnNoShadows !== null) {
      const updateNoShadow = (nodeId: string, col: number) => {
        minByNodeNoShadow.set(nodeId, Math.min(minByNodeNoShadow.get(nodeId) ?? col, col));
        maxByNodeNoShadow.set(nodeId, Math.max(maxByNodeNoShadow.get(nodeId) ?? col, col));
      };
      updateNoShadow(link.sourceId, link.columnNoShadows);
      updateNoShadow(link.targetId, link.columnNoShadows);
    }
  }

  const nodes: NodeLayout[] = nodeOrder.map((id, row) => {
    const minShadow = minByNodeShadow.get(id) ?? Number.POSITIVE_INFINITY;
    const maxShadow = maxByNodeShadow.get(id) ?? -1;
    const minNoShadow = minByNodeNoShadow.get(id) ?? Number.POSITIVE_INFINITY;
    const maxNoShadow = maxByNodeNoShadow.get(id) ?? -1;
    const fallbackShadow = normalizedLinks.length > 0 ? 0 : 0;
    const fallbackNoShadow = regularLinks.length > 0 ? 0 : 0;
    return {
      id,
      name: id,
      row,
      minCol: Number.isFinite(minShadow) ? minShadow : fallbackShadow,
      maxCol: maxShadow >= 0 ? maxShadow : fallbackShadow,
      minColNoShadows: Number.isFinite(minNoShadow) ? minNoShadow : fallbackNoShadow,
      maxColNoShadows: maxNoShadow >= 0 ? maxNoShadow : fallbackNoShadow,
      colorIndex: row,
    };
  });

  return {
    nodes,
    links: normalizedLinks,
    rowCount: nodes.length,
    columnCount: normalizedLinks.length,
    columnCountNoShadows: regularLinks.length,
    nodeAnnotations: [],
    linkAnnotations: [],
    linkAnnotationsNoShadows: [],
    linkGroupOrder: [],
  };
}

function parseAlignmentScores(raw: unknown): AlignmentScores | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  return {
    ec: parseNumber(record, ["ec"], 0, "alignment scores"),
    s3: parseNumber(record, ["s3"], 0, "alignment scores"),
    ics: parseNumber(record, ["ics"], 0, "alignment scores"),
    nc: parseNullableNumber(record, ["nc"], null),
    ngs: parseNullableNumber(record, ["ngs"], null),
    lgs: parseNullableNumber(record, ["lgs"], null),
    js: parseNullableNumber(record, ["js"], null),
  };
}

function parseSchemaVersion(root: Record<string, unknown>, warnings: string[]): number {
  const version = parseNumber(root, ["schema_version", "schemaVersion"], DEFAULT_SCHEMA_VERSION, "payload");
  const normalized = Math.max(1, Math.floor(version));
  if (normalized > DEFAULT_SCHEMA_VERSION) {
    warnings.push(
      `Schema version ${normalized} is newer than supported version ${DEFAULT_SCHEMA_VERSION}; parsing best effort.`,
    );
  }
  return normalized;
}

function parseJsonPayload(input: unknown, sourceName: string): SessionPayload {
  const root = asRecord(input, sourceName);
  const warnings: string[] = [];
  const schemaVersion = parseSchemaVersion(root, warnings);

  if ("layout" in root) {
    const layout = parseLayout(root.layout);
    return {
      sourceKind: "session-json",
      schemaVersion,
      layout,
      displayOptions: parseDisplayOptions(root.display_options ?? root.displayOptions),
      alignmentScores: parseAlignmentScores(root.alignment_scores ?? root.alignmentScores),
      warnings,
    };
  }

  if ("row_count" in root || "rowCount" in root) {
    return {
      sourceKind: "layout-json",
      schemaVersion,
      layout: parseLayout(root),
      displayOptions: { ...defaultDisplayOptions },
      alignmentScores: null,
      warnings,
    };
  }

  if ("network" in root) {
    const networkRecord = asRecord(root.network, "session.network");
    const nodes = parseNetworkNodes(networkRecord.nodes);
    const links = parseNetworkLinks(networkRecord.links);
    const layout = buildFallbackLayout(nodes, links);
    warnings.push(
      "Session payload did not include a computed layout; using a deterministic fallback ordering.",
    );
    return {
      sourceKind: "session-json",
      schemaVersion,
      layout,
      displayOptions: parseDisplayOptions(root.display_options ?? root.displayOptions),
      alignmentScores: parseAlignmentScores(root.alignment_scores ?? root.alignmentScores),
      warnings,
    };
  }

  if ("nodes" in root && "links" in root) {
    const links = parseNetworkLinks(root.links);
    const maybeLayout = Array.isArray(root.links)
      && (root.links as unknown[]).some((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return false;
        }
        const record = entry as Record<string, unknown>;
        return "column" in record || "column_no_shadows" in record;
      });

    if (maybeLayout) {
      return {
        sourceKind: "layout-json",
        schemaVersion,
        layout: parseLayout(root),
        displayOptions: { ...defaultDisplayOptions },
        alignmentScores: null,
        warnings,
      };
    }

    return {
      sourceKind: "network-json",
      schemaVersion,
      layout: buildFallbackLayout(parseNetworkNodes(root.nodes), links),
      displayOptions: { ...defaultDisplayOptions },
      alignmentScores: null,
      warnings: [
        ...warnings,
        "Loaded a network-only payload. Applied fallback row/column assignment for preview rendering.",
      ],
    };
  }

  throw new Error(
    "Unsupported payload shape. Expected a layout JSON, a session JSON, or a network JSON export.",
  );
}

function parseSifContent(source: string): NetworkLayout {
  const nodeOrder: string[] = [];
  const seenNodes = new Set<string>();
  const links: BareLink[] = [];

  const addNode = (nodeId: string) => {
    const normalized = nodeId.trim();
    if (!normalized || seenNodes.has(normalized)) {
      return;
    }
    seenNodes.add(normalized);
    nodeOrder.push(normalized);
  };

  source.split(/\r?\n/u).forEach((lineRaw) => {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) {
      return;
    }

    const cols = line.split(/\s+/u).filter((part) => part.length > 0);
    if (cols.length === 1) {
      addNode(cols[0]);
      return;
    }
    if (cols.length === 2) {
      addNode(cols[0]);
      addNode(cols[1]);
      links.push({
        source: cols[0],
        target: cols[1],
        relation: DEFAULT_RELATION,
        isShadow: false,
      });
      return;
    }

    const sourceId = cols[0];
    const relation = cols[1];
    addNode(sourceId);
    for (const targetId of cols.slice(2)) {
      addNode(targetId);
      links.push({
        source: sourceId,
        target: targetId,
        relation,
        isShadow: false,
      });
    }
  });

  return buildFallbackLayout(nodeOrder, links);
}

export function parseBioFabricJson(input: unknown, sourceName = "payload"): SessionPayload {
  return parseJsonPayload(input, sourceName);
}

export function parseBioFabricFile(fileName: string, content: string): SessionPayload {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".sif")) {
    return {
      sourceKind: "sif",
      schemaVersion: DEFAULT_SCHEMA_VERSION,
      layout: parseSifContent(content),
      displayOptions: { ...defaultDisplayOptions },
      alignmentScores: null,
      warnings: [
        "Loaded SIF directly in browser and applied fallback ordering. Use CLI layout output for parity-accurate ordering.",
      ],
    };
  }

  if (lower.endsWith(".bif") || lower.endsWith(".xml")) {
    throw new Error(
      "BIF/XML session loading is not implemented in-browser yet. Convert to JSON layout/session via the Rust CLI first.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${(error as Error).message}`);
  }
  return parseJsonPayload(parsed, fileName);
}

export function buildSceneModel(payload: SessionPayload): SceneModel {
  const layout = payload.layout;
  const nodeCount = layout.nodes.length;
  const linkCount = layout.links.length;

  const nodeRows = new Float32Array(nodeCount);
  const nodeMinCols = new Float32Array(nodeCount);
  const nodeMaxCols = new Float32Array(nodeCount);
  const nodeMinColsNoShadows = new Float32Array(nodeCount);
  const nodeMaxColsNoShadows = new Float32Array(nodeCount);
  const nodeColorsRgba = new Float32Array(nodeCount * 4);

  layout.nodes.forEach((node, index) => {
    nodeRows[index] = node.row + 0.5;
    nodeMinCols[index] = node.minCol;
    nodeMaxCols[index] = node.maxCol + 1;
    nodeMinColsNoShadows[index] = node.minColNoShadows;
    nodeMaxColsNoShadows[index] = node.maxColNoShadows + 1;

    const [r, g, b, a] = nodeColorForId(node.id, node.colorIndex);
    const offset = index * 4;
    nodeColorsRgba[offset] = r;
    nodeColorsRgba[offset + 1] = g;
    nodeColorsRgba[offset + 2] = b;
    nodeColorsRgba[offset + 3] = a;
  });

  const linkCols = new Float32Array(linkCount);
  const linkColsNoShadows = new Float32Array(linkCount);
  const linkTopRows = new Float32Array(linkCount);
  const linkBottomRows = new Float32Array(linkCount);
  const linkColorsRgba = new Float32Array(linkCount * 4);
  const linkRelations = new Array<string>(linkCount);

  layout.links.forEach((link, index) => {
    linkCols[index] = link.column + 0.5;
    linkColsNoShadows[index] = link.columnNoShadows === null ? -1 : link.columnNoShadows + 0.5;
    linkTopRows[index] = link.topRow;
    linkBottomRows[index] = link.bottomRow + 1;
    linkRelations[index] = link.relation;

    const [r, g, b, a] = linkColorForRelation(link.relation, link.colorIndex, link.isShadow);
    const offset = index * 4;
    linkColorsRgba[offset] = r;
    linkColorsRgba[offset + 1] = g;
    linkColorsRgba[offset + 2] = b;
    linkColorsRgba[offset + 3] = a;
  });

  return {
    nodes: layout.nodes,
    links: layout.links,
    rowCount: layout.rowCount,
    columnCount: layout.columnCount,
    columnCountNoShadows: layout.columnCountNoShadows,
    nodeAnnotations: layout.nodeAnnotations,
    linkAnnotations: layout.linkAnnotations,
    linkAnnotationsNoShadows: layout.linkAnnotationsNoShadows,
    linkGroupOrder: layout.linkGroupOrder,
    nodeRows,
    nodeMinCols,
    nodeMaxCols,
    nodeMinColsNoShadows,
    nodeMaxColsNoShadows,
    nodeColorsRgba,
    linkCols,
    linkColsNoShadows,
    linkTopRows,
    linkBottomRows,
    linkColorsRgba,
    linkRelations,
  };
}

export function updatePayloadDisplayOptions(
  payload: SessionPayload,
  displayOptions: DisplayOptions,
): SessionPayload {
  return {
    ...payload,
    displayOptions,
  };
}

export function formatSourceKind(kind: SessionSourceKind): string {
  switch (kind) {
    case "layout-json":
      return "Layout JSON";
    case "session-json":
      return "Session JSON";
    case "network-json":
      return "Network JSON";
    case "sif":
      return "SIF";
    default:
      return "Unknown";
  }
}
