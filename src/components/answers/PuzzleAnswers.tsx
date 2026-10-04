import React, { useEffect, useMemo, useState } from "react";
import { Reorder } from "framer-motion";
import { ArrowDown, ArrowUp, Delete, GripVertical, RotateCcw } from "lucide-react";
import { accentStyle, OPTION_ACCENTS } from "../CyberQuestion";
import { AnswerProps, LockButton, isTypingTarget } from "./shared";

/**
 * The puzzles: put things in order, pair them up, sort them into groups, or
 * rebuild a word. Each one is a few taps against the clock, built for a thumb
 * on a phone first — every drag has a tap that does the same job, because a
 * drag inside a scrolling page is a coin flip on a touchscreen.
 */

/* ------------------------------------------------------------------ *
 * Order
 * ------------------------------------------------------------------ */

/**
 * Drag the tiles into order, or nudge them with the arrows. They arrive in
 * the order the room's screen shows them — already disguised, never the
 * answer (see `puzzleDisplayOrder`).
 */
export const OrderAnswer: React.FC<AnswerProps> = ({ question, onSubmit, isSubmitted, compact = false }) => {
  // The card is keyed by question, so a new puzzle starts from a fresh state.
  const [items, setItems] = useState<string[]>(question.options);

  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= items.length) return;
    setItems((current) => {
      const next = [...current];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="cyber-hud text-[10px] text-slate-400">First at the top · drag or use the arrows</div>
      <Reorder.Group axis="y" values={items} onReorder={setItems} className="w-full max-w-lg space-y-2">
        {items.map((item, index) => (
          <Reorder.Item
            key={item}
            value={item}
            style={accentStyle(index)}
            dragListener={!isSubmitted}
            className={`cyber-option gap-3 px-3 ${compact ? "py-2.5" : "py-3"} ${
              isSubmitted ? "is-picked" : "cursor-grab active:cursor-grabbing"
            }`}
            whileDrag={{ scale: 1.04 }}
          >
            <span className="cyber-option-key w-8 h-8 text-sm">{index + 1}</span>
            <span className={`flex-1 text-left ${compact ? "text-base" : "text-lg"} leading-snug`}>{item}</span>
            {!isSubmitted && (
              <span className="flex items-center gap-1 shrink-0">
                <TileButton label={`Move ${item} up`} onClick={() => move(index, -1)} disabled={index === 0}>
                  <ArrowUp size={16} />
                </TileButton>
                <TileButton label={`Move ${item} down`} onClick={() => move(index, 1)} disabled={index === items.length - 1}>
                  <ArrowDown size={16} />
                </TileButton>
                <GripVertical className="text-slate-500 hidden sm:block" size={18} />
              </span>
            )}
          </Reorder.Item>
        ))}
      </Reorder.Group>
      {!isSubmitted && <LockButton compact={compact} label="LOCK IN THIS ORDER" onClick={() => onSubmit(items)} />}
    </div>
  );
};

const TileButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, children }) => (
  <button
    type="button"
    aria-label={label}
    // Keep the press from starting a drag of the tile it sits on.
    onPointerDown={(event) => event.stopPropagation()}
    onClick={onClick}
    disabled={disabled}
    className="w-8 h-8 rounded-md flex items-center justify-center border border-current/60 bg-[#05060f]/70 disabled:opacity-25 active:scale-90"
  >
    {children}
  </button>
);

/* ------------------------------------------------------------------ *
 * Match
 * ------------------------------------------------------------------ */

/**
 * Tap an item, then its partner. A pair takes the item's colour on both
 * sides, so the board reads at a glance; tapping a paired item frees it, and
 * tapping a partner that is already taken hands it to the item you are on.
 */
export const MatchAnswer: React.FC<AnswerProps> = ({ question, onSubmit, isSubmitted, compact = false }) => {
  const items = question.options;
  const partners = question.choices ?? [];
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [armed, setArmed] = useState<{ side: "item" | "partner"; value: string } | null>(null);

  const ownerOf = (partner: string) => Object.keys(pairs).find((item) => pairs[item] === partner);
  const accentFor = (item: string) => accentStyle(items.indexOf(item));

  const join = (item: string, partner: string) => {
    setPairs((current) => {
      const next = { ...current };
      Object.keys(next).forEach((key) => next[key] === partner && delete next[key]);
      next[item] = partner;
      return next;
    });
    setArmed(null);
  };

  const tapItem = (item: string) => {
    if (isSubmitted) return;
    if (armed?.side === "partner") return join(item, armed.value);
    if (pairs[item] && armed?.value !== item) {
      // Tapping a paired item frees it and picks it up again.
      setPairs(({ [item]: _, ...rest }) => rest);
    }
    setArmed(armed?.value === item ? null : { side: "item", value: item });
  };

  const tapPartner = (partner: string) => {
    if (isSubmitted) return;
    if (armed?.side === "item") return join(armed.value, partner);
    const owner = ownerOf(partner);
    if (owner) setPairs(({ [owner]: _, ...rest }) => rest);
    setArmed(armed?.value === partner ? null : { side: "partner", value: partner });
  };

  const done = items.every((item) => pairs[item]);
  const cell = compact ? "min-h-[3.25rem] px-2.5 py-2 text-sm sm:text-base" : "min-h-[4.5rem] px-4 py-3 text-xl";

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="cyber-hud text-[10px] text-slate-400 text-center">
        Tap one on the left, then its partner · {Object.keys(pairs).length}/{items.length} paired
      </div>
      <div className="w-full grid grid-cols-2 gap-x-3 gap-y-2">
        <div className="space-y-2">
          {items.map((item) => {
            const paired = Boolean(pairs[item]);
            const isArmed = armed?.side === "item" && armed.value === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => tapItem(item)}
                disabled={isSubmitted}
                style={accentFor(item)}
                aria-pressed={isArmed}
                className={`cyber-option gap-2 ${cell} ${paired || isArmed ? "is-picked" : ""} ${
                  isArmed ? "ring-4 ring-white/70" : ""
                }`}
              >
                <span className="flex-1 leading-snug">{item}</span>
                {paired && <span aria-hidden className="cyber-option-key w-6 h-6 text-[10px]">↔</span>}
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          {partners.map((partner) => {
            const owner = ownerOf(partner);
            const isArmed = armed?.side === "partner" && armed.value === partner;
            return (
              <button
                key={partner}
                type="button"
                onClick={() => tapPartner(partner)}
                disabled={isSubmitted}
                style={owner ? accentFor(owner) : ({ "--accent": "#94a3b8", "--accent-rgb": "148, 163, 184" } as React.CSSProperties)}
                aria-pressed={isArmed}
                className={`cyber-option gap-2 ${cell} ${owner || isArmed ? "is-picked" : ""} ${
                  isArmed ? "ring-4 ring-white/70" : ""
                }`}
              >
                {owner && <span aria-hidden className="cyber-option-key w-6 h-6 text-[10px]">↔</span>}
                <span className="flex-1 leading-snug">{partner}</span>
              </button>
            );
          })}
        </div>
      </div>
      {!isSubmitted && (
        <LockButton
          compact={compact}
          disabled={!done}
          label={done ? "LOCK IN PAIRS" : `${items.length - Object.keys(pairs).length} LEFT TO PAIR`}
          onClick={() => onSubmit(pairs)}
        />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Sort
 * ------------------------------------------------------------------ */

/**
 * Every item, and a button for each group beside it: one tap per item,
 * which is what a thirty-second sort needs. Each group keeps its own colour
 * down the whole list.
 */
export const CategorizeAnswer: React.FC<AnswerProps> = ({ question, onSubmit, isSubmitted, compact = false }) => {
  const items = question.options;
  const groups = question.choices ?? [];
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const done = items.every((item) => placed[item]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-wrap justify-center gap-2">
        {groups.map((group, g) => (
          <span
            key={group}
            style={accentStyle(g)}
            className="cyber-hud rounded-full border-2 border-[var(--accent)] px-3 py-1 text-[10px] sm:text-xs text-[var(--accent)] tracking-[0.15em]"
          >
            {group} · {items.filter((item) => placed[item] === group).length}
          </span>
        ))}
      </div>
      <div className="w-full max-w-2xl space-y-2">
        {items.map((item) => (
          <div
            key={item}
            className={`flex items-center gap-2 rounded-xl border px-3 ${compact ? "py-2" : "py-3"} ${
              placed[item] ? "border-slate-600 bg-slate-900/70" : "border-[#00e5ff]/40 bg-[#070817]/80"
            }`}
          >
            <span className={`flex-1 font-cyber font-bold text-white leading-snug ${compact ? "text-base" : "text-xl"}`}>
              {item}
            </span>
            <div className="flex gap-1.5 shrink-0">
              {groups.map((group, g) => {
                const on = placed[item] === group;
                return (
                  <button
                    key={group}
                    type="button"
                    onClick={() => !isSubmitted && setPlaced((current) => ({ ...current, [item]: group }))}
                    disabled={isSubmitted}
                    aria-pressed={on}
                    style={accentStyle(g)}
                    className={`cyber-option justify-center px-2.5 ${compact ? "min-h-[2.5rem] text-xs" : "min-h-[3rem] text-sm"} ${
                      on ? "is-picked" : placed[item] ? "is-muted" : ""
                    }`}
                  >
                    {group}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {!isSubmitted && (
        <LockButton
          compact={compact}
          disabled={!done}
          label={done ? "LOCK IN SORT" : `${items.filter((item) => !placed[item]).length} LEFT TO SORT`}
          onClick={() => onSubmit(placed)}
        />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Unscramble
 * ------------------------------------------------------------------ */

/**
 * Letter tiles: tap one to put it in the next gap, tap a placed letter to
 * send it back. On a keyboard, typing works too. The gaps are grouped into
 * words when the answer is more than one ("3 · 4" for NEW YORK), which is
 * published with the tiles.
 */
export const ScrambleAnswer: React.FC<AnswerProps> = ({ question, onSubmit, isSubmitted, compact = false }) => {
  const tiles = question.options;
  const wordLengths = useMemo(() => {
    const lengths = (question.choices ?? []).map(Number).filter((n) => n > 0);
    return lengths.reduce((a, b) => a + b, 0) === tiles.length ? lengths : [tiles.length];
  }, [question.choices, tiles.length]);
  // Which tile (by its index in the pool) sits in each gap.
  const [used, setUsed] = useState<number[]>([]);

  const place = (index: number) => {
    if (isSubmitted || used.includes(index) || used.length >= tiles.length) return;
    setUsed((current) => [...current, index]);
  };
  const unplace = (slot: number) => {
    if (isSubmitted) return;
    setUsed((current) => current.filter((_, i) => i !== slot));
  };

  const spelled = used.map((index) => tiles[index]);
  const word = (() => {
    const parts: string[] = [];
    let at = 0;
    wordLengths.forEach((length) => {
      parts.push(spelled.slice(at, at + length).join(""));
      at += length;
    });
    return parts.join(" ");
  })();
  const done = used.length === tiles.length;

  // Typing a letter takes the first matching tile still in the pool.
  useEffect(() => {
    if (isSubmitted) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Backspace") {
        setUsed((current) => current.slice(0, -1));
        event.preventDefault();
        return;
      }
      if (event.key === "Enter" && done) {
        onSubmit(word);
        return;
      }
      if (event.key.length !== 1) return;
      const wanted = event.key.toUpperCase();
      const index = tiles.findIndex((tile, i) => tile === wanted && !used.includes(i));
      if (index !== -1) place(index);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Sized to the longest word, so a nine-letter word still fits across a
  // phone without the page scrolling sideways.
  const longest = Math.max(...wordLengths);
  const slotSize = compact
    ? longest <= 7 ? "w-10 h-12 text-xl" : longest <= 9 ? "w-8 h-10 text-lg" : longest <= 12 ? "w-6 h-9 text-base" : "w-5 h-8 text-sm"
    : longest <= 10 ? "w-14 h-16 text-3xl" : "w-10 h-12 text-2xl";
  const slotGap = longest > 9 ? "gap-1" : "gap-1.5";
  const tileSize = compact
    ? tiles.length > 10 ? "w-9 h-11 text-lg" : "w-10 h-12 text-xl"
    : tiles.length > 12 ? "w-11 h-14 text-2xl" : "w-14 h-16 text-3xl";

  let slot = 0;
  return (
    <div className="flex flex-col items-center gap-5">
      {/* The answer, gap by gap. */}
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-3">
        {wordLengths.map((length, w) => (
          <div key={w} className={`flex flex-wrap justify-center ${slotGap}`}>
            {Array.from({ length }).map(() => {
              const here = slot++;
              const letter = spelled[here];
              return (
                <button
                  key={here}
                  type="button"
                  onClick={() => letter && unplace(here)}
                  disabled={isSubmitted || !letter}
                  aria-label={letter ? `Remove ${letter}` : "Empty"}
                  className={`${slotSize} rounded-lg flex items-center justify-center font-hud font-black ${
                    letter
                      ? "bg-[#00f0ff] text-[#05060f] shadow-[0_0_14px_rgba(0,240,255,0.75)]"
                      : "border-2 border-dashed border-[#00e5ff]/50 text-transparent"
                  }`}
                >
                  {letter ?? "·"}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* The pool. */}
      <div className="flex flex-wrap justify-center gap-2 max-w-xl">
        {tiles.map((tile, index) => {
          const gone = used.includes(index);
          return (
            <button
              key={index}
              type="button"
              onClick={() => place(index)}
              disabled={isSubmitted || gone}
              style={{ "--accent": OPTION_ACCENTS[index % OPTION_ACCENTS.length].hex, "--accent-rgb": OPTION_ACCENTS[index % OPTION_ACCENTS.length].rgb } as React.CSSProperties}
              className={`cyber-option justify-center ${tileSize} font-hud font-black ${gone ? "opacity-15" : ""}`}
            >
              {tile}
            </button>
          );
        })}
      </div>

      {!isSubmitted && (
        <div className={`flex items-center gap-3 ${compact ? "w-full" : ""}`}>
          <button
            type="button"
            onClick={() => setUsed((current) => current.slice(0, -1))}
            disabled={used.length === 0}
            aria-label="Remove the last letter"
            className="h-14 w-14 shrink-0 rounded-xl flex items-center justify-center border-2 border-slate-600 text-slate-300 disabled:opacity-30"
          >
            <Delete size={20} />
          </button>
          <button
            type="button"
            onClick={() => setUsed([])}
            disabled={used.length === 0}
            aria-label="Start again"
            className="h-14 w-14 shrink-0 rounded-xl flex items-center justify-center border-2 border-slate-600 text-slate-300 disabled:opacity-30"
          >
            <RotateCcw size={20} />
          </button>
          <div className="flex-1">
            <LockButton compact={compact} disabled={!done} label={done ? "LOCK IN" : `${tiles.length - used.length} TO GO`} onClick={() => onSubmit(word)} />
          </div>
        </div>
      )}
    </div>
  );
};
