import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";
import { PinTarget } from "../../types";
import { MapFrame, MapKey, mapFrameFor } from "../../services/mapProjection";
import type { MapPaths } from "../../assets/mapPaths";

/**
 * A picture you can drop a pin on: one of the built-in maps, or any image.
 *
 * Used twice. On a player's phone it is the answer — tap to drop the pin,
 * tap again to move it, pinch or use the buttons to zoom in on a small
 * country, drag to pan. On the big screen and in the answer key it is the
 * reveal — the target ring, and every pin the room dropped.
 *
 * Every position here is a fraction of the picture (0–1 across and down), so
 * a pin means the same spot on a phone, a projector and the host's laptop.
 */

/* ------------------------------------------------------------------ *
 * The built-in maps, loaded once and only when a question needs one
 * ------------------------------------------------------------------ */

let mapPathsCache: Record<MapKey, MapPaths> | null = null;
let mapPathsLoading: Promise<Record<MapKey, MapPaths>> | null = null;

const loadMapPaths = (): Promise<Record<MapKey, MapPaths>> => {
  if (mapPathsCache) return Promise.resolve(mapPathsCache);
  mapPathsLoading ??= import("../../assets/mapPaths").then((module) => {
    mapPathsCache = module.MAP_PATHS;
    return module.MAP_PATHS;
  });
  return mapPathsLoading;
};

const useMapPaths = (frame: MapFrame | null): MapPaths | null => {
  const [paths, setPaths] = useState<MapPaths | null>(
    frame && mapPathsCache ? mapPathsCache[frame.key] : null,
  );
  useEffect(() => {
    if (!frame) return;
    let live = true;
    loadMapPaths().then((all) => live && setPaths(all[frame.key]));
    return () => {
      live = false;
    };
  }, [frame]);
  return paths;
};

/* ------------------------------------------------------------------ *
 * The board
 * ------------------------------------------------------------------ */

export interface BoardPin {
  x: number;
  y: number;
  /** "mine" is the viewer's own pin, drawn as a map pin; "room" is anybody else's, a dot. */
  tone: "mine" | "room";
}

const MAX_ZOOM = 8;
const TAP_SLOP_PX = 8;

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));

export const PinBoard: React.FC<{
  image: string;
  /** Pins to draw. */
  pins?: BoardPin[];
  /** The answer's ring, drawn on a reveal. */
  target?: PinTarget | null;
  /** How far past the ring a near miss still scored, as a share of the width. */
  marginReach?: number;
  /** Set to make the board answerable: called with the spot tapped. */
  onPick?: (x: number, y: number, aspect: number) => void;
  /** Zoom controls and gestures. On by default when answerable. */
  zoomable?: boolean;
  /** Fill the width and cap the height at this many viewport-heights. */
  className?: string;
  label?: string;
}> = ({ image, pins = [], target = null, marginReach = 0, onPick, zoomable, className = "", label }) => {
  const frame = mapFrameFor(image);
  const paths = useMapPaths(frame);
  const [pictureAspect, setPictureAspect] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const aspect = frame ? frame.height / frame.width : (pictureAspect ?? 0.6);
  const canZoom = zoomable ?? Boolean(onPick);

  const boxRef = useRef<HTMLDivElement>(null);
  const gridId = `pin-grid-${useId().replace(/:/g, "")}`;
  const [boxWidth, setBoxWidth] = useState(360);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });

  // Markers are sized in screen pixels, so the board has to know how wide it
  // is actually drawn — a phone and a projector differ by a factor of four.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    setBoxWidth(box.clientWidth || 360);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setBoxWidth(box.clientWidth || 360));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  const viewRef = useRef(view);
  viewRef.current = view;

  /** Keep the picture covering the frame: no panning off into the void. */
  const settle = useCallback((zoom: number, x: number, y: number) => {
    const box = boxRef.current;
    const width = box?.clientWidth ?? 0;
    const height = box?.clientHeight ?? 0;
    const z = clamp(zoom, 1, MAX_ZOOM);
    return {
      zoom: z,
      x: clamp(x, width - width * z, 0),
      y: clamp(y, height - height * z, 0),
    };
  }, []);

  /** Zoom about a point in the frame, so what is under it stays under it. */
  const zoomAt = useCallback(
    (factor: number, px: number, py: number) => {
      const { zoom, x, y } = viewRef.current;
      const next = clamp(zoom * factor, 1, MAX_ZOOM);
      const ratio = next / zoom;
      setView(settle(next, px - (px - x) * ratio, py - (py - y) * ratio));
    },
    [settle],
  );

  const zoomCentre = (factor: number) => {
    const box = boxRef.current;
    if (!box) return;
    zoomAt(factor, box.clientWidth / 2, box.clientHeight / 2);
  };

  // A new picture starts zoomed out.
  useEffect(() => setView({ zoom: 1, x: 0, y: 0 }), [image]);

  /* --- gestures: tap to pin, drag to pan, pinch or wheel to zoom --- */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    startX: number;
    startY: number;
    moved: boolean;
    pinch: { distance: number; zoom: number } | null;
  } | null>(null);

  /** A pointer's position inside the frame's border, where the picture is. */
  const local = (event: React.PointerEvent | PointerEvent) => {
    const box = boxRef.current!;
    const rect = box.getBoundingClientRect();
    return {
      x: event.clientX - rect.left - box.clientLeft,
      y: event.clientY - rect.top - box.clientTop,
    };
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (!onPick && !canZoom) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, local(event));
    if (pointers.current.size === 1) {
      const at = local(event);
      gesture.current = { startX: at.x, startY: at.y, moved: false, pinch: null };
    } else if (pointers.current.size === 2 && canZoom && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: viewRef.current.zoom };
      gesture.current.moved = true;
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous || !gesture.current) return;
    const at = local(event);
    pointers.current.set(event.pointerId, at);

    if (pointers.current.size >= 2 && gesture.current.pinch) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const wanted = gesture.current.pinch.zoom * (distance / Math.max(1, gesture.current.pinch.distance));
      zoomAt(wanted / viewRef.current.zoom, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }

    if (Math.hypot(at.x - gesture.current.startX, at.y - gesture.current.startY) > TAP_SLOP_PX) {
      gesture.current.moved = true;
    }
    if (gesture.current.moved && canZoom && viewRef.current.zoom > 1) {
      const { zoom, x, y } = viewRef.current;
      setView(settle(zoom, x + at.x - previous.x, y + at.y - previous.y));
    }
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const was = gesture.current;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (!onPick || !was || was.moved) return;

    const at = local(event);
    const box = boxRef.current!;
    const { zoom, x, y } = viewRef.current;
    const fx = (at.x - x) / zoom / box.clientWidth;
    const fy = (at.y - y) / zoom / box.clientHeight;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;
    onPick(fx, fy, aspect);
  };

  // Wheel zoom has to cancel the page's scroll, which React's passive
  // listener cannot do.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !canZoom) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = box.getBoundingClientRect();
      zoomAt(
        event.deltaY < 0 ? 1.25 : 0.8,
        event.clientX - rect.left - box.clientLeft,
        event.clientY - rect.top - box.clientTop,
      );
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [canZoom, zoomAt]);

  /* --- drawing --- */
  const W = 1000;
  const H = W * aspect;
  // Markers stay the same size on screen however far in the board is zoomed.
  const k = 1 / view.zoom;
  const unitsPerPx = W / Math.max(1, boxWidth);
  const dot = (px: number) => px * unitsPerPx * k;

  return (
    <div className={`relative select-none ${className}`}>
      <div
        ref={boxRef}
        role={onPick ? "application" : "img"}
        aria-label={label ?? (frame ? frame.name : "Picture")}
        className={`relative w-full overflow-hidden rounded-2xl border-2 border-[#00e5ff]/50 bg-[#070817] shadow-[0_0_22px_rgba(0,229,255,0.2)] ${
          onPick ? "cursor-crosshair" : ""
        }`}
        style={{ aspectRatio: `${1 / aspect}`, touchAction: onPick || canZoom ? "none" : "auto" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="absolute inset-0 origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
        >
          {frame ? (
            <svg viewBox={`0 0 ${frame.width} ${frame.height}`} className="absolute inset-0 w-full h-full">
              <defs>
                <pattern id={gridId} width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M50 0H0V50" fill="none" stroke="rgba(0,229,255,0.07)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width={frame.width} height={frame.height} fill={`url(#${gridId})`} />
              {paths ? (
                <>
                  <path d={paths.land} fill="#121c3d" stroke="#00e5ff" strokeWidth={1.1 * k} strokeLinejoin="round" />
                  <path d={paths.borders} fill="none" stroke="#9d4dff" strokeOpacity={0.75} strokeWidth={0.7 * k} />
                </>
              ) : (
                <text x={frame.width / 2} y={frame.height / 2} textAnchor="middle" fill="#64748b" fontSize="28">
                  Loading map…
                </text>
              )}
            </svg>
          ) : failed ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500 p-4 text-center">
              The picture for this question did not load.
            </div>
          ) : (
            <img
              src={image}
              alt=""
              draggable={false}
              referrerPolicy="no-referrer"
              onLoad={(event) => {
                const img = event.currentTarget;
                if (img.naturalWidth > 0) setPictureAspect(img.naturalHeight / img.naturalWidth);
              }}
              onError={() => setFailed(true)}
              className="absolute inset-0 w-full h-full object-fill pointer-events-none"
            />
          )}

          {/* Rings and pins, in the same fractions the answer is graded in. */}
          <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full pointer-events-none">
            {target && (
              <g>
                {marginReach > 0 && (
                  <circle
                    cx={target.x * W}
                    cy={target.y * H}
                    r={(target.radius + marginReach) * W}
                    fill="rgba(245,255,59,0.06)"
                    stroke="#f5ff3b"
                    strokeOpacity={0.55}
                    strokeDasharray={`${dot(6)} ${dot(5)}`}
                    strokeWidth={dot(1.5)}
                  />
                )}
                <circle
                  cx={target.x * W}
                  cy={target.y * H}
                  r={Math.max(target.radius * W, dot(5))}
                  fill="rgba(57,255,136,0.22)"
                  stroke="#39ff88"
                  strokeWidth={dot(2.5)}
                />
                <circle cx={target.x * W} cy={target.y * H} r={dot(2.5)} fill="#39ff88" />
              </g>
            )}
            {pins
              .filter((pin) => pin.tone === "room")
              .map((pin, i) => (
                <circle
                  key={`room-${i}`}
                  cx={pin.x * W}
                  cy={pin.y * H}
                  r={dot(4.5)}
                  fill="#ff2bd6"
                  fillOpacity={0.85}
                  stroke="#05060f"
                  strokeWidth={dot(1)}
                />
              ))}
            {pins
              .filter((pin) => pin.tone !== "room")
              .map((pin, i) => (
                <g key={`mine-${i}`} transform={`translate(${pin.x * W} ${pin.y * H})`}>
                  {/* A map pin: a teardrop whose point is the spot. */}
                  <path
                    d={`M0 0 C ${dot(-3)} ${dot(-8)} ${dot(-9)} ${dot(-11)} ${dot(-9)} ${dot(-18)} A ${dot(9)} ${dot(9)} 0 1 1 ${dot(9)} ${dot(-18)} C ${dot(9)} ${dot(-11)} ${dot(3)} ${dot(-8)} 0 0 Z`}
                    fill="#00f0ff"
                    stroke="#05060f"
                    strokeWidth={dot(1.5)}
                    style={{ filter: "drop-shadow(0 0 6px rgba(0,240,255,0.9))" }}
                  />
                  <circle cy={dot(-18)} r={dot(3.2)} fill="#05060f" />
                </g>
              ))}
          </svg>
        </div>
      </div>

      {canZoom && (
        <div className="absolute right-2 top-2 flex flex-col gap-1.5">
          {[
            { icon: <Plus size={16} />, label: "Zoom in", act: () => zoomCentre(1.6) },
            { icon: <Minus size={16} />, label: "Zoom out", act: () => zoomCentre(1 / 1.6) },
            { icon: <Maximize2 size={14} />, label: "Zoom right out", act: () => setView({ zoom: 1, x: 0, y: 0 }) },
          ].map((button) => (
            <button
              key={button.label}
              type="button"
              onClick={button.act}
              aria-label={button.label}
              title={button.label}
              className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#070817]/85 border border-[#00e5ff]/60 text-[#00e5ff] shadow-[0_0_10px_rgba(0,229,255,0.35)] active:scale-95"
            >
              {button.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * The picture that goes with a question that is not a pin question — a logo
 * to name, a painting to date. Shown above the options, never interactive.
 */
export const QuestionImage: React.FC<{ image?: string; className?: string }> = ({
  image,
  className = "",
}) => {
  const [failed, setFailed] = useState(false);
  if (!image || failed) return null;
  if (mapFrameFor(image)) return <PinBoard image={image} zoomable={false} className={className} />;
  return (
    <div className={`flex justify-center ${className}`}>
      <img
        src={image}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="max-h-[32vh] w-auto max-w-full rounded-2xl border-2 border-[#00e5ff]/40 shadow-[0_0_18px_rgba(0,229,255,0.18)] object-contain"
      />
    </div>
  );
};

export default PinBoard;
