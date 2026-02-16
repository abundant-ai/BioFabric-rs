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
}

export interface NodeLayout {
  nodeId: string;
  row: number;
  minCol: number;
  maxCol: number;
  colorIndex: number;
}

export interface LinkLayout {
  sourceId: string;
  targetId: string;
  relation: string;
  col: number;
  sourceRow: number;
  targetRow: number;
  colorIndex: number;
}

export interface AnnotationBand {
  label: string;
  min: number;
  max: number;
  color: string;
}

export interface NetworkLayout {
  nodes: NodeLayout[];
  links: LinkLayout[];
  nodeAnnotations: AnnotationBand[];
  linkAnnotations: AnnotationBand[];
}

export interface SessionPayload {
  layout: NetworkLayout | null;
  displayOptions: DisplayOptions;
}

export interface SceneModel {
  nodeRows: Float32Array;
  nodeMinCols: Float32Array;
  nodeMaxCols: Float32Array;
  linkCols: Float32Array;
  linkSourceRows: Float32Array;
  linkTargetRows: Float32Array;
}
