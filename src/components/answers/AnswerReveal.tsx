import React from "react";
import { Check } from "lucide-react";
import { Answer, PublicQuestion, QuestionType, RevealDetail } from "../../types";
import { CHOICE_KEYS, accentStyle } from "../CyberQuestion";
import { formatNumber } from "../../services/questionTypes";
import { MARGIN_REACH, readNumber } from "../../services/scoring";
import { mapFrameFor, pinToLatLng } from "../../services/mapProjection";
import PinBoard, { BoardPin } from "./PinBoard";
import { NumberStrip } from "./NumberAnswers";

/**
 * An answer, shown — for whichever type it is.
 *
 * The same view on the big screen's answer key, a phone's end-of-round
 * review, the host's desk and the setup review, so a pin question's answer
 * is a ring on the map everywhere and not a ring in one place and a pair of
 * coordinates in another. Where the room's answers are known it draws them
 * too: every pin dropped, every guess on the scale, the split on a pick.
 */

type RevealSize = "phone" | "desk" | "room";

const KM_PER_RADIAN = 6371;
const RAD = Math.PI / 180;

/** Great-circle distance, for saying how far off a pin on a map was. */
const haversineKm = (a: [number, number], b: [number, number]): number => {
  const dLat = (b[0] - a[0]) * RAD;
  const dLng = (b[1] - a[1]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * KM_PER_RADIAN * Math.asin(Math.min(1, Math.sqrt(h)));
};

const pinOf = (answer: Answer | null | undefined): [number, number] | null =>
  Array.isArray(answer) && answer.length >= 2 && typeof answer[0] === "number" && typeof answer[1] === "number"
    ? [answer[0] as number, answer[1] as number]
    : null;

/**
 * A player's answer, as words, for "you said". Every type has its own
 * shape, and "[object Object]" is not an answer anybody gave.
 */
export const describeAnswer = (
  answer: Answer | null,
  question: PublicQuestion,
  reveal?: RevealDetail,
): string => {
  if (answer === null || answer === undefined) return "No answer";

  switch (question.type) {
    case QuestionType.MULTIPLE_CHOICE:
    case QuestionType.TRUE_FALSE:
      return typeof answer === "number" ? (question.options[answer] ?? "No answer") : "No answer";
    case QuestionType.MULTI_SELECT:
      return Array.isArray(answer)
        ? (answer as number[]).map((i) => question.options[i]).filter(Boolean).join(", ") || "Nothing picked"
        : "No answer";
    case QuestionType.SLIDER:
    case QuestionType.NUMBER: {
      const value = readNumber(answer as unknown);
      return value === null ? "No answer" : formatNumber(value, question.unit);
    }
    case QuestionType.RANGE:
      return Array.isArray(answer) && answer.length === 2
        ? `${formatNumber(Math.min(...(answer as number[])))} – ${formatNumber(Math.max(...(answer as number[])), question.unit)}`
        : "No answer";
    case QuestionType.PIN: {
      const spot = pinOf(answer);
      const frame = mapFrameFor(question.image);
      if (!spot) return "No pin";
      if (frame && reveal?.pin) {
        const km = haversineKm(
          pinToLatLng(frame, spot[0], spot[1]),
          pinToLatLng(frame, reveal.pin.x, reveal.pin.y),
        );
        return `A pin ${formatNumber(Math.round(km), "km")} from the answer`;
      }
      return "A pin elsewhere on the picture";
    }
    case QuestionType.MATCH:
    case QuestionType.CATEGORIZE:
      return typeof answer === "object" && !Array.isArray(answer)
        ? Object.entries(answer)
            .map(([item, partner]) => `${item} → ${partner}`)
            .join(", ")
        : "No answer";
    default:
      return Array.isArray(answer) ? answer.join("  →  ") : String(answer);
  }
};

/** A bar's worth of a tally, with its count. */
const TallyBar: React.FC<{ count: number; total: number; size: RevealSize }> = ({ count, total, size }) => (
  <span className="flex items-center gap-2 shrink-0 w-24 sm:w-28">
    <span className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
      <span className="block h-full bg-[var(--accent)]" style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
    </span>
    <span className={`font-mono tabular-nums text-slate-300 ${size === "room" ? "text-sm" : "text-xs"}`}>{count}</span>
  </span>
);

export const AnswerReveal: React.FC<{
  question: PublicQuestion;
  reveal: RevealDetail;
  size?: RevealSize;
  /** Picks per option, for the choice types. */
  tallies?: number[] | null;
  /** Everyone's answers, for the types that draw them. */
  responses?: Answer[];
  /** The viewer's own answer, drawn on top. */
  mine?: Answer | null;
  showExplanation?: boolean;
}> = ({ question, reveal, size = "phone", tallies = null, responses = [], mine = null, showExplanation = true }) => {
  const big = size === "room";
  const text = big ? "text-xl" : size === "desk" ? "text-base" : "text-sm";
  const totalPicks = tallies ? tallies.reduce((a, b) => a + b, 0) : 0;

  const body = (() => {
    switch (question.type) {
      case QuestionType.MULTIPLE_CHOICE:
      case QuestionType.MULTI_SELECT: {
        const correct = new Set(reveal.correctIndices ?? (reveal.correctIndex === null ? [] : [reveal.correctIndex]));
        return (
          <div className="space-y-1.5">
            {question.options.map((option, index) => (
              <div
                key={index}
                style={accentStyle(index)}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 border ${
                  correct.has(index) ? "border-[#39ff88] bg-[#39ff88]/10" : "border-slate-800 opacity-60"
                }`}
              >
                <span className={`cyber-option-key ${big ? "w-8 h-8 text-sm" : "w-6 h-6 text-[10px]"}`}>
                  {CHOICE_KEYS[index] ?? index + 1}
                </span>
                <span className={`flex-1 font-cyber font-bold ${text} ${correct.has(index) ? "text-[#39ff88]" : "text-slate-300"}`}>
                  {option}
                </span>
                {correct.has(index) && <Check size={big ? 20 : 16} className="text-[#39ff88] shrink-0" />}
                {tallies && <TallyBar count={tallies[index] ?? 0} total={totalPicks} size={size} />}
              </div>
            ))}
          </div>
        );
      }

      case QuestionType.TRUE_FALSE:
        return (
          <div className="grid grid-cols-2 gap-2">
            {["True", "False"].map((label, index) => {
              const right = reveal.correctIndex === index;
              return (
                <div
                  key={label}
                  style={accentStyle(index)}
                  className={`rounded-xl border-2 px-3 py-2 text-center ${
                    right ? "border-[#39ff88] bg-[#39ff88]/10" : "border-slate-700 opacity-50"
                  }`}
                >
                  <div className={`cyber-hud font-black ${big ? "text-2xl" : "text-base"} ${right ? "text-[#39ff88]" : "text-slate-400"}`}>
                    {label}
                  </div>
                  {tallies && (
                    <div className="font-mono text-xs text-slate-400 mt-0.5">
                      {tallies[index] ?? 0} {(tallies[index] ?? 0) === 1 ? "pick" : "picks"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );

      case QuestionType.SLIDER:
      case QuestionType.RANGE:
      case QuestionType.NUMBER: {
        const [min, max] = question.options.map(Number);
        const band = reveal.correctRange ?? [0, 0];
        return (
          <>
            <div className={`cyber-question text-[#39ff88] ${big ? "text-3xl" : "text-xl"}`}>{reveal.label}</div>
            <NumberStrip
              band={band}
              scale={question.type === QuestionType.NUMBER || !(max > min) ? null : [min, max]}
              responses={responses}
              mine={mine}
              unit={question.unit}
              size={big ? "room" : "phone"}
            />
          </>
        );
      }

      case QuestionType.PIN: {
        const own = pinOf(mine);
        const pins: BoardPin[] = [
          ...responses.map(pinOf).filter((p): p is [number, number] => p !== null).map(([x, y]) => ({ x, y, tone: "room" as const })),
          ...(own ? [{ x: own[0], y: own[1], tone: "mine" as const }] : []),
        ];
        return (
          <>
            <div className={`cyber-question text-[#39ff88] ${big ? "text-3xl" : "text-xl"}`}>{reveal.label}</div>
            <PinBoard
              image={reveal.image ?? question.image ?? ""}
              target={reveal.pin}
              marginReach={MARGIN_REACH.PIN[question.margin ?? "none"]}
              pins={pins}
              zoomable={size !== "room"}
              className="mt-2"
            />
            {responses.length > 0 && (
              <div className="cyber-hud text-[10px] text-slate-500 mt-1.5 tracking-[0.12em]">
                Green ring scores in full · dashed ring scores some · pink dots are the room's pins
              </div>
            )}
          </>
        );
      }

      case QuestionType.PUZZLE:
        return (
          <ol className="space-y-1">
            {(reveal.correctOrder ?? []).map((item, index) => (
              <li key={item} className={`flex items-center gap-2 font-cyber font-bold text-[#39ff88] ${text}`}>
                <span className="cyber-hud text-xs text-slate-500 w-5">{index + 1}</span>
                {item}
              </li>
            ))}
          </ol>
        );

      case QuestionType.MATCH:
        return (
          <div className="grid grid-cols-[auto_auto_1fr] gap-x-2 gap-y-1 items-center">
            {(reveal.pairs ?? []).map(([item, partner], index) => (
              <React.Fragment key={item}>
                <span style={accentStyle(index)} className={`font-cyber font-bold text-[var(--accent)] ${text}`}>
                  {item}
                </span>
                <span className="text-slate-500">→</span>
                <span className={`font-cyber font-bold text-[#39ff88] ${text}`}>{partner}</span>
              </React.Fragment>
            ))}
          </div>
        );

      case QuestionType.CATEGORIZE: {
        const pairs = reveal.pairs ?? [];
        // Alphabetical, the same order the phones offered them in.
        const groups = [...new Set(pairs.map(([, group]) => group))].sort((a, b) => a.localeCompare(b));
        return (
          <div className={`grid gap-2 ${groups.length > 2 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}>
            {groups.map((group, g) => (
              <div
                key={group}
                style={{ ...accentStyle(g), borderColor: "rgba(var(--accent-rgb), 0.6)" }}
                className="rounded-xl border-2 px-3 py-2"
              >
                <div className={`cyber-hud text-[var(--accent)] ${big ? "text-sm" : "text-[10px]"} mb-1`}>{group}</div>
                <div className={`font-cyber font-bold text-white ${text} leading-snug`}>
                  {pairs.filter(([, home]) => home === group).map(([item]) => item).join(", ")}
                </div>
              </div>
            ))}
          </div>
        );
      }

      case QuestionType.SCRAMBLE:
        return (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {reveal.label.split(/\s+/).map((word, w) => (
              <div key={w} className="flex gap-1">
                {[...word.toUpperCase()].map((letter, i) => (
                  <span
                    key={i}
                    className={`rounded-md bg-[#39ff88] text-[#05060f] font-hud font-black flex items-center justify-center ${
                      big ? "w-11 h-12 text-2xl" : "w-7 h-8 text-base"
                    }`}
                  >
                    {letter}
                  </span>
                ))}
              </div>
            ))}
          </div>
        );

      default:
        return <div className={`cyber-question text-[#39ff88] ${big ? "text-2xl" : "text-lg"}`}>{reveal.label}</div>;
    }
  })();

  return (
    <div>
      {body}
      {showExplanation && reveal.explanation && (
        <p className={`text-slate-400 mt-2 ${big ? "text-base" : "text-xs"}`}>{reveal.explanation}</p>
      )}
    </div>
  );
};

export default AnswerReveal;
