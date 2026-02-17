export type AlignmentViewMode = "all" | "group" | "orphan" | "cycle";

export interface DisplayOptions {
  showShadows: boolean;
  showAnnotations: boolean;
  showAnnotationLabels: boolean;
  showNodeLabels: boolean;
  showLinkLabels: boolean;
  labelMinZoom: number;
  minNodeSpanPx: number;
  minLinkSpanPx: number;
  backgroundColor: string;
  nodeZoneColoring: boolean;
  selectionColor: string;
  nodeLineWidth: number;
  linkLineWidth: number;
  selectionLineWidth: number;
  showOverview: boolean;
  nodeLighterLevel: number;
  linkDarkerLevel: number;
  minDrainZone: number;
  shadowsExplicit: boolean;
}

export interface NodeLayout {
  id: string;
  name: string;
  row: number;
  minCol: number;
  maxCol: number;
  minColNoShadows: number;
  maxColNoShadows: number;
  colorIndex: number;
}

export interface LinkLayout {
  index: number;
  sourceId: string;
  targetId: string;
  relation: string;
  column: number;
  columnNoShadows: number | null;
  sourceRow: number;
  targetRow: number;
  topRow: number;
  bottomRow: number;
  colorIndex: number;
  isShadow: boolean;
}

export interface AnnotationBand {
  label: string;
  start: number;
  end: number;
  layer: number;
  color: string;
}

export interface AlignmentScores {
  ec: number;
  s3: number;
  ics: number;
  nc: number | null;
  ngs: number | null;
  lgs: number | null;
  js: number | null;
}

export interface NetworkLayout {
  nodes: NodeLayout[];
  links: LinkLayout[];
  rowCount: number;
  columnCount: number;
  columnCountNoShadows: number;
  nodeAnnotations: AnnotationBand[];
  linkAnnotations: AnnotationBand[];
  linkAnnotationsNoShadows: AnnotationBand[];
  linkGroupOrder: string[];
}

export type SessionSourceKind = "layout-json" | "session-json" | "network-json" | "sif";

export interface SessionPayload {
  sourceKind: SessionSourceKind;
  schemaVersion: number;
  layout: NetworkLayout;
  displayOptions: DisplayOptions;
  alignmentScores: AlignmentScores | null;
  mouseOverImages: Record<string, string>;
  warnings: string[];
}

export interface SceneModel {
  nodes: NodeLayout[];
  links: LinkLayout[];
  rowCount: number;
  columnCount: number;
  columnCountNoShadows: number;
  nodeAnnotations: AnnotationBand[];
  linkAnnotations: AnnotationBand[];
  linkAnnotationsNoShadows: AnnotationBand[];
  linkGroupOrder: string[];

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
}

export interface SelectionState {
  nodeIds: Set<string>;
  linkIndices: Set<number>;
}
