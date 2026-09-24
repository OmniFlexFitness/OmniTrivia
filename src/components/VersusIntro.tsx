import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PublicPlayer } from "../types";
import AvatarDisplay from "./AvatarDisplay";

/**
 * Who you are playing, before the category is spun for.
 *
 * A round is a duel, and the phone in a player's hand is the one screen that
 * is only about them — so between rounds it opens on the matchup itself: their
 * card slides in from one side, their opponent's from the other, and a VS
 * lands between them. The wheel takes over once the host spins; the pairing
 * stays on screen above it as a strip.
 *
 * It renders only what the snapshot already carries (the bracket and the
 * players), so it can never announce anything the host has not published.
 */

const CYAN = "#00f0ff";
const MAGENTA = "#ff2bd6";

interface FighterProps {
  player: PublicPlayer;
  label: string;
  accent: string;
  /** Which side it enters from. */
  from: "left" | "right";
  reduced: boolean;
}

const Fighter: React.FC<FighterProps> = ({ player, label, accent, from, reduced }) => (
  <motion.div
    initial={reduced ? { opacity: 0 } : { opacity: 0, x: from === "left" ? -160 : 160, skewX: from === "left" ? -12 : 12 }}
    animate={{ opacity: 1, x: 0, skewX: 0 }}
    transition={{ type: "spring", stiffness: 170, damping: 18, delay: from === "left" ? 0.05 : 0.2 }}
    className="relative flex items-center gap-4 sm:flex-col sm:gap-3 w-full sm:w-44 px-4 py-4 sm:py-6"
    style={{
      background: `linear-gradient(${from === "left" ? "90deg" : "270deg"}, ${accent}33, rgba(6,6,16,0.9) 75%)`,
      border: `1px solid ${accent}99`,
      boxShadow: `0 0 26px ${accent}44, inset 0 0 22px ${accent}22`,
      clipPath:
        from === "left"
          ? "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%)"
          : "polygon(0 0, 100% 0, 100% 100%, 16px 100%, 0 calc(100% - 16px))",
    }}
  >
    <div
      className="shrink-0 rounded-full p-1"
      style={{ boxShadow: `0 0 18px ${accent}`, border: `2px solid ${accent}` }}
    >
      <AvatarDisplay
        avatar={player.avatar}
        color={player.avatarColor}
        accessory={player.avatarAccessory}
        size="lg"
      />
    </div>
    <div className="min-w-0 sm:text-center">
      <div className="cyber-hud text-[10px]" style={{ color: accent }}>
        {label}
      </div>
      <div className="cyber-question text-2xl leading-tight truncate">{player.name}</div>
    </div>
  </motion.div>
);

/** The VS itself: slammed in, with a split-colour glow and a flash behind it. */
const VersusMark: React.FC<{ reduced: boolean; text?: string }> = ({ reduced, text = "VS" }) => (
  <div className="relative flex items-center justify-center w-24 h-20 sm:h-auto shrink-0">
    {!reduced && (
      <motion.div
        className="absolute w-28 h-28 rounded-full"
        style={{ background: `radial-gradient(circle, rgba(255,255,255,0.9), ${MAGENTA}55 40%, transparent 70%)` }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.6, 1.1], opacity: [0, 1, 0] }}
        transition={{ duration: 0.7, delay: 0.5, times: [0, 0.35, 1] }}
      />
    )}
    <motion.div
      className="relative font-hud font-black italic text-6xl leading-none select-none"
      style={{
        color: "#ffffff",
        textShadow: `-3px 0 0 ${CYAN}, 3px 0 0 ${MAGENTA}, 0 0 18px ${MAGENTA}, 0 0 36px ${CYAN}`,
      }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 3.2, rotate: -14 }}
      animate={{ opacity: 1, scale: 1, rotate: -8 }}
      transition={{ type: "spring", stiffness: 320, damping: 14, delay: reduced ? 0 : 0.5 }}
    >
      {text}
    </motion.div>
  </div>
);

export interface VersusIntroProps {
  me: PublicPlayer;
  /** Null for a bye. */
  opponent: PublicPlayer | null;
  roundNumber: number;
  totalRounds: number;
}

/** The full-screen matchup reveal, shown before the wheel is spun. */
const VersusIntro: React.FC<VersusIntroProps> = ({ me, opponent, roundNumber, totalRounds }) => {
  const reduced = useReducedMotion() ?? false;

  return (
    <div className="relative isolate flex flex-col items-center gap-5 py-4 overflow-hidden">
      {/* The arena: a cyan half and a magenta half, split on a diagonal. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-40"
        style={{
          background: `linear-gradient(115deg, ${CYAN}22 0 49.6%, transparent 49.6% 50.4%, ${MAGENTA}22 50.4% 100%)`,
        }}
      />

      <motion.div
        className="cyber-hud text-[11px] text-slate-400"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        Round {roundNumber} of {totalRounds} // head-to-head
      </motion.div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 w-full max-w-md sm:max-w-2xl">
        <Fighter player={me} label="You" accent={CYAN} from="left" reduced={reduced} />
        <VersusMark reduced={reduced} text={opponent ? "VS" : "BYE"} />
        {opponent ? (
          <Fighter player={opponent} label="Opponent" accent={MAGENTA} from="right" reduced={reduced} />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduced ? 0 : 0.8 }}
            className="cyber-panel w-full sm:w-44 px-4 py-5 text-center"
          >
            <div className="cyber-hud text-[10px] text-[#39ff88]">No opponent</div>
            <div className="cyber-question text-lg mt-1">You advance automatically this round</div>
          </motion.div>
        )}
      </div>

      <motion.p
        className="cyber-hud text-[10px] text-slate-500 text-center cyber-flicker"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduced ? 0 : 1.1 }}
      >
        Waiting on the host to spin for the category
      </motion.p>
    </div>
  );
};

/** The pairing, small, above the wheel once it is turning. */
export const VersusStrip: React.FC<{ me: PublicPlayer; opponent: PublicPlayer | null }> = ({
  me,
  opponent,
}) => (
  <div className="cyber-panel flex items-center justify-center gap-3 px-4 py-2.5 w-full max-w-sm">
    <AvatarDisplay avatar={me.avatar} color={me.avatarColor} accessory={me.avatarAccessory} size="sm" />
    <span className="cyber-question text-base truncate" style={{ color: CYAN }}>
      You
    </span>
    <span
      className="font-hud font-black italic text-xl"
      style={{ textShadow: `-2px 0 0 ${CYAN}, 2px 0 0 ${MAGENTA}` }}
    >
      {opponent ? "VS" : "BYE"}
    </span>
    {opponent && (
      <>
        <span className="cyber-question text-base truncate" style={{ color: MAGENTA }}>
          {opponent.name}
        </span>
        <AvatarDisplay
          avatar={opponent.avatar}
          color={opponent.avatarColor}
          accessory={opponent.avatarAccessory}
          size="sm"
        />
      </>
    )}
  </div>
);

export default VersusIntro;
