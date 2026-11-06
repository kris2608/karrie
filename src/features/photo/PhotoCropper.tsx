import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ASPECTS, clampView, coverScale, cropRect, PHOTO_RULES, type AspectId, type CropRect, type CropView, type Size } from "./imageProcessing";

type PhotoCropperProps = {
  image: HTMLImageElement;
  aspect: AspectId;
  onAspect: (aspect: AspectId) => void;
  onCrop: (rect: CropRect) => void;
};

type Pointer = { x: number; y: number };

export function PhotoCropper({ image, aspect, onAspect, onCrop }: PhotoCropperProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<Size | null>(null);
  const [view, setView] = useState<CropView>({ zoom: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, Pointer>());
  const gesture = useRef<{ view: CropView; distance: number; center: Pointer } | null>(null);
  const source: Size = { width: image.naturalWidth, height: image.naturalHeight };

  useLayoutEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setFrame({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [aspect]);

  const clamped = frame ? clampView(view, source, frame) : view;

  const { zoom, x, y } = clamped;
  useEffect(() => {
    if (frame) onCrop(cropRect({ zoom, x, y }, { width: image.naturalWidth, height: image.naturalHeight }, frame));
  }, [frame, zoom, x, y, image, onCrop]);

  function snapshot() {
    const points = [...pointers.current.values()];
    const center = points.length === 2 ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 } : points[0];
    const distance = points.length === 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
    gesture.current = { view: clamped, distance, center };
  }

  function down(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    snapshot();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pan still works without capture while the finger stays on the frame.
    }
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId) || !gesture.current || !frame) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    const start = gesture.current;
    const center = points.length === 2 ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 } : points[0];
    const ratio = points.length === 2 && start.distance > 0 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) / start.distance : 1;
    const zoom = start.view.zoom * ratio;
    const applied = Math.min(PHOTO_RULES.maxZoom, Math.max(1, zoom)) / start.view.zoom;
    setView(
      clampView(
        { zoom, x: start.view.x * applied + (center.x - start.center.x), y: start.view.y * applied + (center.y - start.center.y) },
        source,
        frame,
      ),
    );
  }

  function up(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size) snapshot();
    else gesture.current = null;
  }

  const scale = frame ? coverScale(source, frame) * clamped.zoom : 0;

  return (
    <div className="cropper">
      <div
        ref={frameRef}
        className={`cropper-frame cropper-${aspect}`}
        style={{ aspectRatio: String(ASPECTS[aspect]) }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        data-testid="cropper"
      >
        {frame && (
          <img
            src={image.src}
            alt=""
            draggable={false}
            style={{
              width: source.width * scale,
              height: source.height * scale,
              transform: `translate(-50%, -50%) translate(${clamped.x}px, ${clamped.y}px)`,
            }}
          />
        )}
      </div>
      <div className="cropper-controls">
        <label className="cropper-zoom">
          <span className="sr-only">Inzoomen</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
            <path d="M15.5 15.5L20 20M8 10.5h5M10.5 8v5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <input
            type="range"
            min={1}
            max={PHOTO_RULES.maxZoom}
            step={0.01}
            value={clamped.zoom}
            onChange={(event) => frame && setView(clampView({ ...clamped, zoom: Number(event.target.value) }, source, frame))}
          />
        </label>
        <div className="chips" role="group" aria-label="Vorm">
          {(["square", "portrait"] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={id === aspect ? "chip is-active" : "chip"}
              aria-pressed={id === aspect}
              onClick={() => {
                onAspect(id);
                setView({ zoom: 1, x: 0, y: 0 });
              }}
            >
              {id === "square" ? "Vierkant" : "Staand"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
