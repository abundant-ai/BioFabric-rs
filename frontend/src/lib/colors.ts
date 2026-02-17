const DEFAULT_COLOR = "#8091b5";

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

export function rgbaFromHex(hex: string, fallback = DEFAULT_COLOR): [number, number, number, number] {
  const src = hex.trim().toLowerCase();
  const normalized = src.startsWith("#") ? src : `#${src}`;
  const value = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(normalized) ? normalized : fallback;

  if (value.length === 7) {
    const r = Number.parseInt(value.slice(1, 3), 16) / 255;
    const g = Number.parseInt(value.slice(3, 5), 16) / 255;
    const b = Number.parseInt(value.slice(5, 7), 16) / 255;
    return [r, g, b, 1];
  }

  const r = Number.parseInt(value.slice(1, 3), 16) / 255;
  const g = Number.parseInt(value.slice(3, 5), 16) / 255;
  const b = Number.parseInt(value.slice(5, 7), 16) / 255;
  const a = Number.parseInt(value.slice(7, 9), 16) / 255;
  return [r, g, b, a];
}

export function rgbaToCss(r: number, g: number, b: number, a = 1): string {
  const rr = Math.round(clamp01(r) * 255);
  const gg = Math.round(clamp01(g) * 255);
  const bb = Math.round(clamp01(b) * 255);
  return `rgba(${rr}, ${gg}, ${bb}, ${clamp01(a).toFixed(3)})`;
}

export function indexToColor(index: number): [number, number, number, number] {
  const hue = (index * 137.508) % 360;
  const sat = 62;
  const light = 54;
  const c = ((1 - Math.abs((2 * light) / 100 - 1)) * sat) / 100;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light / 100 - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hue < 60) {
    rPrime = c;
    gPrime = x;
  } else if (hue < 120) {
    rPrime = x;
    gPrime = c;
  } else if (hue < 180) {
    gPrime = c;
    bPrime = x;
  } else if (hue < 240) {
    gPrime = x;
    bPrime = c;
  } else if (hue < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  return [rPrime + m, gPrime + m, bPrime + m, 1];
}

export function nodeColorForId(nodeId: string, colorIndex: number): [number, number, number, number] {
  if (nodeId.includes("::")) {
    if (nodeId.startsWith("::")) {
      return [0.86, 0.28, 0.28, 1];
    }
    if (nodeId.endsWith("::")) {
      return [0.28, 0.49, 0.86, 1];
    }
    return [0.60, 0.34, 0.90, 1];
  }
  return indexToColor(colorIndex);
}

export function linkColorForRelation(
  relation: string,
  colorIndex: number,
  isShadow: boolean,
): [number, number, number, number] {
  const tag = relation.trim();
  let color: [number, number, number, number];

  if (tag === "P") {
    color = [0.66, 0.39, 0.90, 1];
  } else if (tag.includes("pB") || tag.includes("bB")) {
    color = [0.29, 0.60, 0.95, 1];
  } else if (tag.includes("pR") || tag.includes("rR")) {
    color = [0.95, 0.47, 0.30, 1];
  } else {
    color = indexToColor(colorIndex);
  }

  if (isShadow) {
    return [color[0], color[1], color[2], 0.42];
  }
  return color;
}
