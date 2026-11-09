export type BarcodePoint = { x: number; y: number };

export type BandGeometry = {
  videoWidth: number;
  videoHeight: number;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  canvasWidth: number;
  canvasHeight: number;
  scale: number;
};

export type CoverLayout = {
  renderW: number;
  renderH: number;
  offsetX: number;
  offsetY: number;
};

/** Must match READER_RULES.cropWidth / cropHeight in barcodeReader. */
const CROP_WIDTH = 0.85;
const CROP_HEIGHT = 0.5;

/** Geometry of the centre band drawn into the decode canvas. */
export function bandGeometry(width: number, height: number, maxWidth: number): BandGeometry | null {
  if (!width || !height) return null;
  const cropW = Math.round(width * CROP_WIDTH);
  const cropH = Math.round(height * CROP_HEIGHT);
  const scale = Math.min(1, maxWidth / cropW);
  return {
    videoWidth: width,
    videoHeight: height,
    cropX: (width - cropW) / 2,
    cropY: (height - cropH) / 2,
    cropW,
    cropH,
    canvasWidth: Math.round(cropW * scale),
    canvasHeight: Math.round(cropH * scale),
    scale,
  };
}

export function mapBandToVideo(points: BarcodePoint[], band: BandGeometry): BarcodePoint[] {
  if (!band.scale) return [];
  return points.map((point) => ({
    x: band.cropX + point.x / band.scale,
    y: band.cropY + point.y / band.scale,
  }));
}

/** How a video with object-fit: cover is positioned inside a box. */
export function coverLayout(videoW: number, videoH: number, boxW: number, boxH: number): CoverLayout | null {
  if (!videoW || !videoH || !boxW || !boxH) return null;
  const videoRatio = videoW / videoH;
  const boxRatio = boxW / boxH;
  if (videoRatio > boxRatio) {
    const renderH = boxH;
    const renderW = boxH * videoRatio;
    return { renderW, renderH, offsetX: (boxW - renderW) / 2, offsetY: 0 };
  }
  const renderW = boxW;
  const renderH = boxW / videoRatio;
  return { renderW, renderH, offsetX: 0, offsetY: (boxH - renderH) / 2 };
}

export function mapVideoToCover(points: BarcodePoint[], videoW: number, videoH: number, layout: CoverLayout): BarcodePoint[] {
  return points.map((point) => ({
    x: layout.offsetX + (point.x / videoW) * layout.renderW,
    y: layout.offsetY + (point.y / videoH) * layout.renderH,
  }));
}

export function pointsFromBox(box: { x: number; y: number; width: number; height: number }): BarcodePoint[] {
  const { x, y, width, height } = box;
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

/** Two finder points → a thin parallelogram around the barcode axis. */
export function pointsFromSegment(a: BarcodePoint, b: BarcodePoint, halfWidth = 18): BarcodePoint[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * halfWidth;
  const ny = (dx / length) * halfWidth;
  return [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ];
}

/** Push each vertex outward from the centroid so the stroke clears the bars. */
export function padPolygon(points: BarcodePoint[], pad: number): BarcodePoint[] {
  if (points.length < 2 || pad <= 0) return points;
  const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  return points.map((point) => {
    const dx = point.x - cx;
    const dy = point.y - cy;
    const length = Math.hypot(dx, dy) || 1;
    return { x: point.x + (dx / length) * pad, y: point.y + (dy / length) * pad };
  });
}

export function polygonPath(points: BarcodePoint[]): string {
  if (!points.length) return "";
  return `${points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ")} Z`;
}

/** Decode-canvas points → video frame → cover layout inside the preview box. */
export function mapDecodeToOverlay(
  points: BarcodePoint[],
  band: BandGeometry,
  boxW: number,
  boxH: number,
  pad = 10,
): BarcodePoint[] | null {
  if (points.length < 2) return null;
  const layout = coverLayout(band.videoWidth, band.videoHeight, boxW, boxH);
  if (!layout) return null;
  const video = mapBandToVideo(points, band);
  const overlay = mapVideoToCover(video, band.videoWidth, band.videoHeight, layout);
  return padPolygon(overlay, pad);
}
