import React, { useState } from "react";
import { MapPin } from "lucide-react";
import { mapFrameFor, pinToLatLng } from "../../services/mapProjection";
import { AnswerProps, LockButton, MarginChip } from "./shared";
import PinBoard from "./PinBoard";

/**
 * Drop a pin on the picture. Tap to place it, tap somewhere else to move it,
 * zoom in for a small target — then lock it in. Nothing is sent until then,
 * so a stray tap while panning costs nothing.
 *
 * The answer carries the picture's shape as a third number, because a pin's
 * distance from the target is measured in picture widths and only the screen
 * that drew the picture knows how tall it is (a built-in map's shape is known
 * to the grader already, and it ignores this).
 */
export const PinAnswer: React.FC<AnswerProps> = ({ question, onSubmit, isSubmitted, compact = false }) => {
  const [spot, setSpot] = useState<[number, number, number] | null>(null);
  const image = question.image ?? "";
  const frame = mapFrameFor(image);

  const where = (() => {
    if (!spot || !frame) return null;
    const [lat, lng] = pinToLatLng(frame, spot[0], spot[1]);
    const ns = `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}`;
    const ew = `${Math.abs(lng).toFixed(1)}°${lng >= 0 ? "E" : "W"}`;
    return `${ns} ${ew}`;
  })();

  return (
    <div className="flex flex-col items-center gap-3">
      <MarginChip margin={question.margin} type={question.type} />
      <PinBoard
        image={image}
        pins={spot ? [{ x: spot[0], y: spot[1], tone: "mine" }] : []}
        onPick={isSubmitted ? undefined : (x, y, aspect) => setSpot([x, y, aspect])}
        zoomable
        className={`w-full ${compact ? "" : "max-w-4xl"}`}
        label={`${frame ? frame.name : "Picture"} — tap to drop your pin`}
      />
      <div className="cyber-hud text-[10px] text-slate-400 flex items-center gap-1.5 tracking-[0.15em]">
        <MapPin size={12} className="text-[#00f0ff]" />
        {spot ? (where ? `Pin at ${where} — tap to move it` : "Pin dropped — tap to move it") : "Tap to drop your pin · pinch or + to zoom"}
      </div>
      {!isSubmitted && (
        <LockButton compact={compact} disabled={!spot} label={spot ? "LOCK IN PIN" : "DROP A PIN FIRST"} onClick={() => spot && onSubmit(spot)} />
      )}
    </div>
  );
};

export default PinAnswer;
