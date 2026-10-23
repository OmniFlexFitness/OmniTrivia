/**
 * The bracket and the remote, driven the way a night drives them.
 *
 * Imports the app's own services rather than copies, so what passes here is
 * what ships. Run it with `node scripts/check-hosting.mjs`.
 */
import "./dom-stub";
import { BracketRound, GamePhase, GameState, Player } from "../../src/types";
import { applyBotsSetting, botsSettingOpen } from "../../src/services/bots";
import {
  activePlayerIds,
  addToDraw,
  buildFirstRound,
  byeCounts,
  championAtEnd,
  circleRound,
  enterRound,
  entrySide,
  isRoundRobinGame,
  matchRecords,
  podium,
  roundRobinRounds,
  roundRobinStandings,
  redemptionRoster,
  seriesScore,
  winBonusFor,
  winsNeeded,
  rankStanding,
  roundsToDecide,
  settleRound,
  sideOf,
} from "../../src/services/bracket";
import {
  hmacSha256Hex,
  hostProof,
  playerProof,
  remoteSignature,
  suggestRejoinCode,
} from "../../src/services/proof";
import { verifiedRejoinCode } from "../../src/services/seats";
import {
  DEFAULT_BROADCAST_SUBTITLE,
  DEFAULT_BROADCAST_TITLE,
  formatBroadcastDate,
  renderBroadcastText,
} from "../../src/services/broadcastText";
import {
  LOCAL_UID,
  bindRemote,
  judgeRemoteHello,
  judgeRemoteMessage,
  liveRemotes,
  pairingKeyFromHash,
  passwordSpellings,
} from "../../src/services/remoteControl";

let failures = 0;

const check = (label: string, passed: boolean, detail = ""): void => {
  console.log(`${passed ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
};

const makePlayers = (count: number): Player[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    avatar: "🐼",
    score: 0,
    roundScore: 0,
    isBot: false,
    streak: 0,
  }));

/** A seeded coin, so a failure reproduces. */
const rng = (seed: number) => () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
};

interface Played {
  rounds: BracketRound[];
  players: Player[];
  championId: string | null;
  roundsPlayed: number;
}

/**
 * Play a whole night: random round scores, every round settled the way
 * `finishRound` settles it, until the bracket is decided or the rounds run out.
 */
const playNight = (
  count: number,
  losersBracket: boolean,
  maxRounds: number,
  seed: number,
): Played => {
  const random = rng(seed);
  let players = makePlayers(count);
  let rounds: BracketRound[] = [buildFirstRound(players)];
  let championId: string | null = null;
  let roundNumber = 1;

  while (roundNumber <= maxRounds) {
    const current = rounds[roundNumber - 1];
    if (!current) break;

    // Every player in the round scores something; a few tie on purpose.
    const inRound = new Set(activePlayerIds(current));
    players = players.map((p) => {
      if (!inRound.has(p.id)) return { ...p, roundScore: 0 };
      const points = Math.floor(random() * 4) * 100;
      return { ...p, roundScore: points, score: p.score + points };
    });

    const outcome = settleRound(current, players, {
      losersBracket,
      playedRounds: rounds.slice(0, roundNumber - 1),
      hasMoreRounds: roundNumber < maxRounds,
    });

    rounds = [...rounds.slice(0, roundNumber - 1), outcome.round];
    if (outcome.nextRound) rounds.push(outcome.nextRound);

    const out = new Set(outcome.eliminatedIds);
    const dropped = new Set(outcome.losersIds);
    players = players.map((p) =>
      out.has(p.id)
        ? { ...p, eliminated: true, losersBracket: false }
        : dropped.has(p.id)
          ? { ...p, losersBracket: true }
          : p,
    );

    championId = outcome.championId;
    if (championId || !outcome.nextRound) break;
    roundNumber += 1;
  }

  return { rounds, players, championId, roundsPlayed: roundNumber };
};

/** How many matchups each player has lost across the whole bracket. */
const lossesOf = (rounds: BracketRound[]): Map<string, number> => {
  const losses = new Map<string, number>();
  rounds.forEach((round) =>
    round.matchups.forEach((m) => {
      if (!m.winnerId || !m.playerBId) return;
      const loser = m.winnerId === m.playerAId ? m.playerBId : m.playerAId;
      losses.set(loser, (losses.get(loser) ?? 0) + 1);
    }),
  );
  return losses;
};

/* ------------------------------------------------------------------ *
 * 1. Single elimination is unchanged
 * ------------------------------------------------------------------ */

{
  const night = playNight(8, false, 10, 7);
  check(
    "without a loser's bracket, eight players are decided in three rounds",
    night.championId !== null && night.roundsPlayed === 3,
    `${night.roundsPlayed} rounds`,
  );
  check(
    "and every matchup is a winners' matchup with the id it always had",
    night.rounds.every((round) =>
      round.matchups.every(
        (m) => sideOf(m) === "winners" && /^r\d+-m\d+$/.test(m.id),
      ),
    ),
  );
  const losses = lossesOf(night.rounds);
  check(
    "one loss is the end of a player's night",
    night.players.every(
      (p) => p.id === night.championId || (p.eliminated && losses.get(p.id) === 1),
    ),
  );
}

/* ------------------------------------------------------------------ *
 * 2. Double elimination, across every field size a bar night sees
 * ------------------------------------------------------------------ */

let everySizeDecided = true;
let everyCountMatches = true;
let nobodyOutEarly = true;
let championLossesOk = true;
let everyoneOncePerRound = true;
let finalOnlyAtTheEnd = true;
let detail = "";

for (let count = 2; count <= 16; count++) {
  for (let seed = 1; seed <= 25; seed++) {
    const night = playNight(count, true, 99, seed * 97 + count);
    const expected = roundsToDecide(count, true);
    const losses = lossesOf(night.rounds);

    if (!night.championId) {
      everySizeDecided = false;
      detail ||= `${count} players, seed ${seed}: undecided`;
    }
    if (night.roundsPlayed !== expected) {
      everyCountMatches = false;
      detail ||= `${count} players: took ${night.roundsPlayed}, promised ${expected}`;
    }

    for (const player of night.players) {
      const lost = losses.get(player.id) ?? 0;
      if (player.id === night.championId) {
        if (lost > 1) championLossesOk = false;
        continue;
      }
      // Everybody but the champion ends the night out — and only after two
      // losses, or one loss in the grand final to somebody who had one too.
      if (!player.eliminated || lost < 1 || lost > 2) nobodyOutEarly = false;
      if (lost === 1) {
        const lostTheFinal = night.rounds.some((round) =>
          round.matchups.some(
            (m) =>
              sideOf(m) === "final" &&
              (m.playerAId === player.id || m.playerBId === player.id),
          ),
        );
        if (!lostTheFinal) {
          nobodyOutEarly = false;
          detail ||= `${count} players: ${player.id} out after one loss`;
        }
      }
    }

    night.rounds.forEach((round, index) => {
      const ids = activePlayerIds(round);
      if (new Set(ids).size !== ids.length) everyoneOncePerRound = false;
      const hasFinal = round.matchups.some((m) => sideOf(m) === "final");
      if (hasFinal && (round.matchups.length !== 1 || index !== night.rounds.length - 1)) {
        finalOnlyAtTheEnd = false;
      }
    });
  }
}

check("a loser's bracket always produces a champion, 2 to 16 players", everySizeDecided, detail);
check(
  "and takes exactly the rounds the lobby says it needs",
  everyCountMatches,
  `8 players: ${roundsToDecide(8, true)} rounds, 16: ${roundsToDecide(16, true)}`,
);
check("nobody is out after one loss, except the grand final's loser", nobodyOutEarly, detail);
check("the champion has lost at most once", championLossesOk);
check("nobody is drawn twice in one round", everyoneOncePerRound);
check("the grand final is one matchup, and the last one played", finalOnlyAtTheEnd);

/* ------------------------------------------------------------------ *
 * 3. The drop, the grand final, and running out of rounds
 * ------------------------------------------------------------------ */

{
  const players = makePlayers(4);
  const round1 = buildFirstRound(players);
  const [m1, m2] = round1.matchups;
  const scored = players.map((p) => ({
    ...p,
    roundScore: p.id === m1.playerAId || p.id === m2.playerAId ? 300 : 100,
  }));
  const outcome = settleRound(round1, scored, {
    losersBracket: true,
    playedRounds: [],
    hasMoreRounds: true,
  });

  check(
    "round one's losers drop into the loser's bracket instead of going out",
    outcome.eliminatedIds.length === 0 &&
      outcome.losersIds.length === 2 &&
      outcome.losersIds.includes(m1.playerBId!) &&
      outcome.losersIds.includes(m2.playerBId!),
  );
  check(
    "and round two plays both sides at once",
    outcome.nextRound?.matchups.filter((m) => sideOf(m) === "winners").length === 1 &&
      outcome.nextRound?.matchups.filter((m) => sideOf(m) === "losers").length === 1,
    outcome.nextRound?.matchups.map((m) => m.id).join(", "),
  );
}

{
  // One left on each side: the next round is the grand final, and the
  // loser's-bracket player can win it.
  const players = makePlayers(2).map((p, i) => ({ ...p, losersBracket: i === 1 }));
  const final: BracketRound = {
    roundNumber: 5,
    matchups: [
      {
        id: "r5-f1",
        roundNumber: 5,
        bracket: "final",
        playerAId: "p1",
        playerBId: "p2",
        winnerId: null,
        scoreA: null,
        scoreB: null,
        tiebreak: null,
      },
    ],
    resolved: false,
  };
  const outcome = settleRound(
    final,
    players.map((p) => ({ ...p, roundScore: p.id === "p2" ? 500 : 200 })),
    { losersBracket: true, playedRounds: [], hasMoreRounds: true },
  );
  check(
    "the grand final is won from the loser's bracket as well as the winners'",
    outcome.championId === "p2" &&
      outcome.eliminatedIds.includes("p1") &&
      outcome.nextRound === null,
  );
}

{
  const players: Player[] = makePlayers(3).map((p, i) => ({
    ...p,
    score: [100, 900, 500][i],
    losersBracket: i === 1,
  }));
  const ranked = rankStanding(players, ["p1", "p2", "p3"]);
  check(
    "when the rounds run out, nobody unbeaten loses the night to a bigger score from the loser's bracket",
    ranked[0].id === "p3" && ranked[2].id === "p2",
    ranked.map((p) => p.id).join(" > "),
  );
}

check(
  "the rounds-needed count matches single elimination without a loser's bracket",
  roundsToDecide(8, false) === 3 &&
    roundsToDecide(5, false) === 3 &&
    roundsToDecide(2, false) === 1 &&
    roundsToDecide(1, true) === 0,
);

/* ------------------------------------------------------------------ *
 * 3a. Wildcards: the Redemption Table fills the bracket's odd seat
 * ------------------------------------------------------------------ */

interface WildNight extends Played {
  /** Round number -> the wildcards that round's draw pulled back in. */
  wildcardsByRound: Map<number, string[]>;
  /** Draws that had an odd side of 3+ and an eligible pool, but no wildcard. */
  missedWildcards: number;
}

/**
 * Play a night the way the app now plays it: everybody scores every round —
 * the bracket in their matchups, everybody else on the Redemption Table — and
 * every draw is made with wildcards on. Some players blank a round on purpose,
 * so the "nobody comes back on zero" rule is exercised.
 */
const playWildNight = (
  count: number,
  losersBracket: boolean,
  maxRounds: number,
  seed: number,
): WildNight => {
  const random = rng(seed);
  let players = makePlayers(count).map((p) => ({ ...p, redemptionScore: 0 }));
  let rounds: BracketRound[] = [buildFirstRound(players)];
  let championId: string | null = null;
  let roundNumber = 1;
  const wildcardsByRound = new Map<number, string[]>();
  let missedWildcards = 0;

  while (roundNumber <= maxRounds) {
    const current = rounds[roundNumber - 1];
    if (!current) break;

    players = players.map((p) => {
      const points = Math.floor(random() * 4) * 100;
      return {
        ...p,
        roundScore: points,
        score: p.score + points,
        // Redemption counts every round, in the bracket or out of it.
        redemptionScore: (p.redemptionScore ?? 0) + points,
      };
    });

    const outcome = settleRound(current, players, {
      losersBracket,
      playedRounds: rounds.slice(0, roundNumber - 1),
      hasMoreRounds: roundNumber < maxRounds,
      wildcards: true,
    });

    rounds = [...rounds.slice(0, roundNumber - 1), outcome.round];
    if (outcome.nextRound) rounds.push(outcome.nextRound);
    if (outcome.wildcardIds.length) {
      wildcardsByRound.set(roundNumber + 1, outcome.wildcardIds);
    }

    // A draw that handed out a bye on a side where a wildcard was owed, with
    // somebody eligible to take it, is a wildcard the room was denied.
    const out = new Set([
      ...players.filter((p) => p.eliminated).map((p) => p.id),
      ...outcome.eliminatedIds,
    ]);
    const eligible = players.some(
      (p) => out.has(p.id) && !p.wildcardUsed && p.roundScore > 0,
    );
    const wildSide = losersBracket ? "losers" : "winners";
    const byeOnWildSide = outcome.nextRound?.matchups.some(
      (m) => m.playerBId === null && sideOf(m) === wildSide,
    );
    const sideSize = outcome.nextRound
      ? activePlayerIds({
          ...outcome.nextRound,
          matchups: outcome.nextRound.matchups.filter((m) => sideOf(m) === wildSide),
        }).length
      : 0;
    if (byeOnWildSide && eligible && sideSize >= 3) missedWildcards += 1;

    // The win bonus goes on the total, as the app pays it, and never on
    // redemption, so the night's two numbers come apart the way a real
    // night's do. (The draw is random, so whether this night alone catches a
    // podium ranked on the total depends on it; the `allGame` fixture below
    // is the check that always does.)
    players = players.map((p) =>
      outcome.bonuses[p.id] ? { ...p, score: p.score + outcome.bonuses[p.id] } : p,
    );

    const knocked = new Set(outcome.eliminatedIds);
    const dropped = new Set(outcome.losersIds);
    const wild = new Set(outcome.wildcardIds);
    players = players.map((p) =>
      wild.has(p.id)
        ? { ...p, eliminated: false, losersBracket, wildcardUsed: true }
        : knocked.has(p.id)
          ? { ...p, eliminated: true, losersBracket: false }
          : dropped.has(p.id)
            ? { ...p, losersBracket: true }
            : p,
    );

    championId = outcome.championId;
    if (championId || !outcome.nextRound) break;
    roundNumber += 1;
  }

  return {
    rounds,
    players,
    championId,
    roundsPlayed: roundNumber,
    wildcardsByRound,
    missedWildcards,
  };
};

{
  let decidedOnTime = true;
  let anyWildcard = false;
  let onceEach = true;
  let facesTheByeOwed = true;
  let rightSide = true;
  let neverDenied = true;
  let onceEachRound = true;
  let wildDetail = "";

  for (const losersBracket of [false, true]) {
    for (let count = 3; count <= 16; count++) {
      for (let seed = 1; seed <= 25; seed++) {
        const night = playWildNight(count, losersBracket, 99, seed * 131 + count);
        const expected = roundsToDecide(count, losersBracket);

        if (!night.championId || night.roundsPlayed !== expected) {
          decidedOnTime = false;
          wildDetail ||= `${count} players${losersBracket ? " (LB)" : ""}: ${night.roundsPlayed} rounds, promised ${expected}`;
        }
        if (night.missedWildcards > 0) {
          neverDenied = false;
          wildDetail ||= `${count} players${losersBracket ? " (LB)" : ""}, seed ${seed}: a bye went out with a wildcard owed`;
        }

        const seen = new Set<string>();
        night.wildcardsByRound.forEach((ids, round) => {
          anyWildcard = true;
          for (const id of ids) {
            if (seen.has(id)) onceEach = false;
            seen.add(id);
            const matchup = night.rounds[round - 1]?.matchups.find(
              (m) => m.wildcardId === id,
            );
            if (!matchup || matchup.playerBId !== id) facesTheByeOwed = false;
            if (matchup && sideOf(matchup) !== (losersBracket ? "losers" : "winners")) {
              rightSide = false;
            }
          }
        });
        night.rounds.forEach((round) => {
          const ids = activePlayerIds(round);
          if (new Set(ids).size !== ids.length) onceEachRound = false;
        });
      }
    }
  }

  check(
    "with wildcards on, every bracket still takes exactly the rounds the lobby promises",
    decidedOnTime,
    wildDetail,
  );
  check("wildcards actually get drawn", anyWildcard);
  check("an odd seat never goes to a bye while somebody on the table has earned it", neverDenied, wildDetail);
  check("nobody comes back as a wildcard twice in one game", onceEach);
  check("a wildcard takes the bye's seat, against the player who was owed it", facesTheByeOwed);
  check(
    "single elimination brings a wildcard back into the bracket; double elimination only into the loser's side",
    rightSide,
  );
  check("nobody is drawn twice in one round, wildcards included", onceEachRound);
}

{
  // Five players, single elimination: round one leaves three winners and
  // two knocked out. The better knocked-out round comes back in.
  const players = makePlayers(5);
  const round1: BracketRound = {
    roundNumber: 1,
    matchups: [
      { id: "r1-m1", roundNumber: 1, bracket: "winners", playerAId: "p1", playerBId: "p2", winnerId: null, scoreA: null, scoreB: null, tiebreak: null },
      { id: "r1-m2", roundNumber: 1, bracket: "winners", playerAId: "p3", playerBId: "p4", winnerId: null, scoreA: null, scoreB: null, tiebreak: null },
      { id: "r1-m3", roundNumber: 1, bracket: "winners", playerAId: "p5", playerBId: null, winnerId: null, scoreA: null, scoreB: null, tiebreak: null },
    ],
    resolved: false,
  };
  const scores: Record<string, number> = { p1: 500, p2: 300, p3: 600, p4: 450, p5: 200 };
  const scored = players.map((p) => ({ ...p, roundScore: scores[p.id], score: scores[p.id] }));
  const outcome = settleRound(round1, scored, {
    losersBracket: false,
    playedRounds: [],
    hasMoreRounds: true,
    wildcards: true,
  });
  const wildMatch = outcome.nextRound?.matchups.find((m) => m.wildcardId);

  check(
    "the best round among the knocked-out players takes the wildcard",
    outcome.wildcardIds.join() === "p4" && outcome.eliminatedIds.includes("p4"),
    `wildcards: ${outcome.wildcardIds.join() || "none"}`,
  );
  check(
    "and round two has no bye in it",
    outcome.nextRound?.matchups.every((m) => m.playerBId !== null) === true &&
      wildMatch?.playerBId === "p4",
    outcome.nextRound?.matchups.map((m) => `${m.playerAId}-${m.playerBId ?? "bye"}`).join(", "),
  );
  check(
    "a wildcard counts as a bye for whoever drew it, so the soft draw rotates",
    byeCounts([outcome.nextRound!]).get(wildMatch?.playerAId ?? "") === 1,
  );

  const blanked = settleRound(
    round1,
    scored.map((p) => (p.id === "p2" || p.id === "p4" ? { ...p, roundScore: 0 } : p)),
    { losersBracket: false, playedRounds: [], hasMoreRounds: true, wildcards: true },
  );
  check(
    "nobody comes back on a round of zero — the bye stands",
    blanked.wildcardIds.length === 0 &&
      blanked.nextRound?.matchups.some((m) => m.playerBId === null) === true,
  );

  const offByDefault = settleRound(round1, scored, {
    losersBracket: false,
    playedRounds: [],
    hasMoreRounds: true,
  });
  check(
    "without the option, a bye is a bye",
    offByDefault.wildcardIds.length === 0 &&
      offByDefault.nextRound?.matchups.some((m) => m.playerBId === null) === true,
  );

  const hostOut = settleRound(
    round1,
    scored.map((p) => (p.id === "p4" ? { ...p, isHost: true } : p)),
    {
      losersBracket: false,
      playedRounds: [],
      hasMoreRounds: true,
      wildcards: true,
      canWildcard: (p) => !p.isHost,
    },
  );
  check(
    "a player the host rules out is passed over for the next best",
    hostOut.wildcardIds.join() === "p2",
    `wildcards: ${hostOut.wildcardIds.join() || "none"}`,
  );
}

{
  // The podium: a decided bracket, a redemption leader, and one prize each.
  const night = playWildNight(8, false, 99, 4242);
  const places = podium(night.players, night.rounds, night.championId);
  const last = night.rounds[night.rounds.length - 1];
  const final = last.matchups.find((m) => m.winnerId === night.championId && m.playerBId);
  const finalLoser = final
    ? final.playerAId === night.championId
      ? final.playerBId
      : final.playerAId
    : null;

  check(
    "the runner-up is whoever the champion beat in the last round",
    places.championId === night.championId && places.runnerUpId === finalLoser,
    `champion ${places.championId}, runner-up ${places.runnerUpId}, final loser ${finalLoser}`,
  );
  const best = Math.max(
    ...night.players
      .filter((p) => p.id !== places.championId && p.id !== places.runnerUpId)
      .map((p) => p.redemptionScore ?? 0),
  );
  check(
    "the redemption prize goes to the most redemption points outside the top two",
    places.redemptionId !== null &&
      places.redemptionId !== places.championId &&
      places.redemptionId !== places.runnerUpId &&
      night.players.find((p) => p.id === places.redemptionId)?.redemptionScore === best,
    `${places.redemptionId} on ${best}`,
  );

  const ranOut = makePlayers(4).map((p, i) => ({
    ...p,
    score: [100, 400, 300, 200][i],
    eliminated: i === 0,
    redemptionScore: i === 0 ? 100 : 0,
  }));
  const ranOutPlaces = podium(ranOut, [buildFirstRound(ranOut)], "p2");
  check(
    "when the rounds run out, the runner-up is the next player still standing",
    ranOutPlaces.runnerUpId === "p3" && ranOutPlaces.redemptionId === "p1",
    `${ranOutPlaces.runnerUpId}, redemption ${ranOutPlaces.redemptionId}`,
  );

  // Third place is the most points answered all game, not the most banked
  // after going out, and not the biggest total: Di was never knocked out and
  // answered more than Ada, who was — though Ada's win bonuses give her the
  // bigger total, so a podium ranked on the total would pick her instead.
  const allGame = makePlayers(4).map((p, i) => ({
    ...p,
    score: [330, 600, 450, 300][i],
    eliminated: i === 0,
    redemptionScore: [220, 400, 300, 250][i],
  }));
  const allGamePlaces = podium(allGame, [buildFirstRound(allGame)], "p2");
  check(
    "third place goes to the most redemption points, knocked out or not",
    allGamePlaces.runnerUpId === "p3" && allGamePlaces.redemptionId === "p4",
    `runner-up ${allGamePlaces.runnerUpId}, third ${allGamePlaces.redemptionId}`,
  );
}

/* ------------------------------------------------------------------ *
 * 3c. Round robin, and three places however the night ends
 * ------------------------------------------------------------------ */

/** Play a round robin the way `finishRound` does: random scores, settle, repeat. */
const playRoundRobin = (
  count: number,
  rounds: number,
  seed: number,
): { rounds: BracketRound[]; players: Player[]; badBonuses: number; out: number } => {
  const random = rng(seed);
  let players = makePlayers(count);
  let played: BracketRound[] = [buildFirstRound(players, { roundRobin: true })];
  let badBonuses = 0;
  let out = 0;

  for (let roundNumber = 1; roundNumber <= rounds; roundNumber++) {
    const current = played[roundNumber - 1];
    if (!current) break;

    const inRound = new Set(activePlayerIds(current));
    players = players.map((p) => {
      if (!inRound.has(p.id)) return { ...p, roundScore: 0 };
      const points = Math.floor(random() * 4) * 100;
      return {
        ...p,
        roundScore: points,
        score: p.score + points,
        redemptionScore: (p.redemptionScore ?? 0) + points,
      };
    });

    const outcome = settleRound(current, players, {
      losersBracket: false,
      playedRounds: played.slice(0, roundNumber - 1),
      hasMoreRounds: roundNumber < rounds,
      wildcards: true,
      qualifyingRounds: 2,
      seeded: true,
      finalBestOf: 3,
    });
    if (outcome.championId) out += 1;
    out += outcome.eliminatedIds.length;

    // Every win, and every bye, pays half the round again — nothing else does.
    outcome.round.matchups.forEach((m) => {
      const winner = players.find((p) => p.id === m.winnerId);
      const expected = winner ? winBonusFor(winner.roundScore) : 0;
      if ((m.winBonus ?? 0) !== expected) badBonuses += 1;
    });

    players = players.map((p) =>
      outcome.bonuses[p.id] ? { ...p, score: p.score + outcome.bonuses[p.id] } : p,
    );
    played = [...played.slice(0, roundNumber - 1), outcome.round];
    if (outcome.nextRound) played.push(outcome.nextRound);
  }

  return { rounds: played, players, badBonuses, out };
};

const pairCounts = (rounds: BracketRound[]): Map<string, number> => {
  const counts = new Map<string, number>();
  rounds.forEach((round) =>
    round.matchups.forEach((m) => {
      if (!m.playerBId) return;
      const key = [m.playerAId, m.playerBId].sort().join("|");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }),
  );
  return counts;
};

{
  let everyoneOnce = true;
  let byeOnceEach = true;
  let onceEachRound = true;
  let roundCount = true;
  let allRoundRobin = true;
  let bonuses = 0;
  let nobodyOut = true;
  let detail = "";

  for (let count = 2; count <= 16; count++) {
    for (let seed = 1; seed <= 6; seed++) {
      const needed = roundRobinRounds(count);
      const night = playRoundRobin(count, needed, count * 97 + seed);
      const pairs = pairCounts(night.rounds);
      const expectedPairs = (count * (count - 1)) / 2;

      if (night.rounds.length !== needed) {
        roundCount = false;
        detail = `${count} players: ${night.rounds.length} rounds, expected ${needed}`;
      }
      if (pairs.size !== expectedPairs || [...pairs.values()].some((n) => n !== 1)) {
        everyoneOnce = false;
        detail = `${count} players: ${pairs.size}/${expectedPairs} pairs`;
      }
      const byes = byeCounts(night.rounds);
      if (count % 2 === 1 && night.players.some((p) => byes.get(p.id) !== 1)) {
        byeOnceEach = false;
        detail = `${count} players: byes ${[...byes.entries()].join(" ")}`;
      }
      if (count % 2 === 0 && byes.size > 0) byeOnceEach = false;
      night.rounds.forEach((round) => {
        const ids = activePlayerIds(round);
        if (new Set(ids).size !== ids.length || ids.length !== count) onceEachRound = false;
      });
      if (!isRoundRobinGame(night.rounds)) allRoundRobin = false;
      bonuses += night.badBonuses;
      if (night.out > 0) nobodyOut = false;
    }
  }

  check("a round robin of 2 to 16 players needs n − 1 rounds when n is even, n when odd", roundCount, detail);
  check("in that many rounds every pair of players meets exactly once", everyoneOnce, detail);
  check("with an odd field everybody sits out exactly once, and with an even one nobody does", byeOnceEach, detail);
  check("every round has everybody in it, once", onceEachRound);
  check("every round of the game is a round-robin round — qualifying, loser's bracket and the final never apply", allRoundRobin);
  check("a win or a bye pays the ×1.5 bonus, exactly", bonuses === 0, `${bonuses} wrong`);
  check("nobody is knocked out and nobody is crowned before the rounds run out", nobodyOut);

  const twice = playRoundRobin(7, roundRobinRounds(7) * 2, 31);
  const twicePairs = pairCounts(twice.rounds);
  check(
    "rounds past a full cycle are rematches: every pair has met twice after two cycles",
    twicePairs.size === 21 && [...twicePairs.values()].every((n) => n === 2),
  );

  const short = playRoundRobin(8, 3, 77);
  check(
    "fewer rounds than a full cycle: nobody meets anybody twice",
    [...pairCounts(short.rounds).values()].every((n) => n === 1),
  );

  // The circle's first turn is neighbours in the roster, which is how round
  // one is drawn — so the schedule picks up from round one's draw alone.
  check(
    "round one of the schedule pairs neighbours in the draw, odd one out on the bye",
    circleRound(["a", "b", "c", "d", "e"], 0).join() === "a,b,c,d,e" &&
      circleRound(["a", "b", "c", "d"], 0).join() === "a,b,c,d",
  );

  // A latecomer dealt in after the circle has started: the rest of the
  // night is paired on who has met whom, and nobody is drawn twice.
  {
    const random = rng(5150);
    let players = makePlayers(6);
    let rounds: BracketRound[] = [buildFirstRound(players, { roundRobin: true })];
    players = [...players, { ...makePlayers(7)[6], benched: true }];
    let latecomerIn = false;
    let clean = true;

    for (let roundNumber = 1; roundNumber <= 7; roundNumber++) {
      const current = rounds[roundNumber - 1];
      const inRound = new Set(activePlayerIds(current));
      players = players.map((p) => {
        const points = inRound.has(p.id) ? Math.floor(random() * 4) * 100 : 0;
        return { ...p, roundScore: points, score: p.score + points };
      });
      const outcome = settleRound(current, players, {
        losersBracket: false,
        playedRounds: rounds.slice(0, roundNumber - 1),
        hasMoreRounds: roundNumber < 7,
      });
      rounds = [...rounds.slice(0, roundNumber - 1), outcome.round];
      let next = outcome.nextRound;

      if (roundNumber === 2 && next) {
        const latecomer = players.find((p) => p.id === "p7")!;
        const entered = enterRound(next, latecomer, false);
        if (entered) {
          next = entered.round;
          players = players.map((p) => (p.id === "p7" ? entered.player : p));
          latecomerIn = !entered.player.benched && !entered.player.eliminated;
        }
      }
      if (next) {
        const ids = activePlayerIds(next);
        if (new Set(ids).size !== ids.length) clean = false;
        rounds.push(next);
      }
    }

    const latePairs = [...pairCounts(rounds).keys()].filter((key) => key.includes("p7"));
    check(
      "a latecomer in a round robin joins the field, not a Redemption Table",
      latecomerIn && entrySide(rounds[2], false) === "roundRobin",
    );
    check(
      "and the rounds after are paired on who has met whom: nobody drawn twice, the latecomer meets new people",
      clean && latePairs.length >= 4,
      `latecomer met ${latePairs.length} different players`,
    );
  }

  // Standings and the podium: highest total, then matchups won, then points
  // answered, then the draw.
  const night = playRoundRobin(9, roundRobinRounds(9), 4040);
  const standings = roundRobinStandings(night.players, night.rounds);
  const places = podium(night.players, night.rounds, championAtEnd(night.players, night.rounds));
  check(
    "a round robin's 1st, 2nd and 3rd are its three highest totals, in order",
    places.championId === standings[0].id &&
      places.runnerUpId === standings[1].id &&
      places.redemptionId === standings[2].id &&
      standings[0].score >= standings[1].score &&
      standings[1].score >= standings[2].score,
    `${standings.slice(0, 3).map((p) => `${p.id} ${p.score}`).join(", ")}`,
  );

  const tied = makePlayers(3).map((p) => ({ ...p, score: 500 }));
  const tiedRounds: BracketRound[] = [
    {
      roundNumber: 1,
      resolved: true,
      matchups: [
        { id: "r1-rr1", roundNumber: 1, bracket: "roundRobin", playerAId: "p1", playerBId: "p2", winnerId: "p2", scoreA: 0, scoreB: 100, tiebreak: null },
        { id: "r1-rr2", roundNumber: 1, bracket: "roundRobin", playerAId: "p3", playerBId: null, winnerId: "p3", scoreA: 0, scoreB: null, tiebreak: "Bye" },
      ],
    },
    {
      roundNumber: 2,
      resolved: true,
      matchups: [
        { id: "r2-rr1", roundNumber: 2, bracket: "roundRobin", playerAId: "p2", playerBId: "p3", winnerId: "p2", scoreA: 100, scoreB: 0, tiebreak: null },
        { id: "r2-rr2", roundNumber: 2, bracket: "roundRobin", playerAId: "p1", playerBId: null, winnerId: "p1", scoreA: 0, scoreB: null, tiebreak: "Bye" },
      ],
    },
  ];
  const record = matchRecords(tiedRounds);
  check(
    "a tie on total goes to more matchups won, and a bye counts as a win",
    roundRobinStandings(tied, tiedRounds).map((p) => p.id).join() === "p2,p1,p3" &&
      record.get("p2")?.wins === 2 &&
      record.get("p3")?.wins === 1 &&
      record.get("p3")?.losses === 1,
    roundRobinStandings(tied, tiedRounds).map((p) => p.id).join(),
  );
}

{
  // Ending a bracket night early: the places still come out, all three.
  const night = playWildNight(8, false, 2, 909);
  const playedRounds = night.rounds.filter((round) => round.resolved);
  const champion = championAtEnd(night.players, playedRounds);
  const places = podium(night.players, playedRounds, champion);
  const standing = night.players.filter((p) => !p.eliminated);
  check(
    "a bracket ended early goes to the best total still standing",
    champion !== null &&
      standing.some((p) => p.id === champion) &&
      standing.every((p) => p.score <= (night.players.find((q) => q.id === champion)?.score ?? 0)),
    `${champion}`,
  );
  check(
    "and 1st, 2nd and 3rd are three different players",
    places.championId !== null &&
      places.runnerUpId !== null &&
      places.redemptionId !== null &&
      new Set([places.championId, places.runnerUpId, places.redemptionId]).size === 3,
    `${places.championId}, ${places.runnerUpId}, ${places.redemptionId}`,
  );

  // Ended on round one's wheel, before anybody has answered anything: nothing
  // has been played, nobody has a point, and there are still three places.
  const fresh = makePlayers(5);
  const nothing = podium(fresh, [], championAtEnd(fresh, []));
  check(
    "ended before a question is answered, three places are still called",
    nothing.championId !== null &&
      nothing.runnerUpId !== null &&
      nothing.redemptionId !== null &&
      new Set([nothing.championId, nothing.runnerUpId, nothing.redemptionId]).size === 3,
  );

  // Third place falls back to the standings when nobody else has a
  // redemption point.
  const quiet = makePlayers(4).map((p, i) => ({ ...p, score: [300, 200, 0, 0][i] }));
  const quietPlaces = podium(quiet, [buildFirstRound(quiet)], "p1");
  check(
    "third place is never left empty: with no redemption points it goes down the standings",
    quietPlaces.runnerUpId === "p2" && quietPlaces.redemptionId !== null &&
      !["p1", "p2"].includes(quietPlaces.redemptionId),
    `${quietPlaces.redemptionId}`,
  );

  // A final series cut short still goes to whoever leads it.
  const series: BracketRound = {
    roundNumber: 5,
    resolved: true,
    matchups: [
      {
        id: "r5-f1",
        roundNumber: 5,
        bracket: "final",
        playerAId: "p1",
        playerBId: "p2",
        winnerId: "p2",
        scoreA: 100,
        scoreB: 300,
        tiebreak: null,
        series: { bestOf: 3, game: 1, winsA: 0, winsB: 0 },
      },
    ],
  };
  const finalists = makePlayers(4).map((p, i) => ({
    ...p,
    score: [900, 400, 200, 100][i],
    eliminated: i >= 2,
  }));
  check(
    "a final series cut short goes to whoever is ahead in it, not the bigger total",
    championAtEnd(finalists, [series]) === "p2",
  );
}

/* ------------------------------------------------------------------ *
 * 3b. Qualifying rounds, the win bonus, seeding and a best-of-3 final
 * ------------------------------------------------------------------ */

interface SeededNight extends Played {
  qualifying: number;
  /** Players knocked out (eliminated) during qualifying — should be none. */
  outDuringQualifying: number;
  /** Bonus bookkeeping that did not add up. */
  badBonuses: number;
  /** First bracket rounds that were not drawn highest-total-against-lowest. */
  badSeeding: number;
}

/** A night as the app now plays it: qualifying, then a seeded bracket. */
const playSeededNight = (
  count: number,
  losersBracket: boolean,
  qualifying: number,
  maxRounds: number,
  seed: number,
): SeededNight => {
  const random = rng(seed);
  let players = makePlayers(count).map((p) => ({ ...p, redemptionScore: 0 }));
  let rounds: BracketRound[] = [
    buildFirstRound(players, { qualifying: qualifying > 0, losersBracket, finalBestOf: 3 }),
  ];
  let championId: string | null = null;
  let roundNumber = 1;
  let outDuringQualifying = 0;
  let badBonuses = 0;
  let badSeeding = 0;

  while (roundNumber <= maxRounds) {
    const current = rounds[roundNumber - 1];
    if (!current) break;

    players = players.map((p) => {
      const points = Math.floor(random() * 6) * 100;
      return {
        ...p,
        roundScore: points,
        score: p.score + points,
        // Redemption counts every round, in the bracket or out of it.
        redemptionScore: (p.redemptionScore ?? 0) + points,
      };
    });

    const outcome = settleRound(current, players, {
      losersBracket,
      playedRounds: rounds.slice(0, roundNumber - 1),
      hasMoreRounds: roundNumber < maxRounds,
      wildcards: true,
      qualifyingRounds: qualifying,
      seeded: true,
      finalBestOf: 3,
    });

    // Every decided matchup with an opponent pays its winner half their
    // round again; nothing else pays anything.
    outcome.round.matchups.forEach((m) => {
      const winner = players.find((p) => p.id === m.winnerId);
      const expected =
        winner && (m.playerBId || sideOf(m) === "qualifying")
          ? winBonusFor(winner.roundScore)
          : 0;
      if ((m.winBonus ?? 0) !== expected) badBonuses += 1;
    });

    if (roundNumber <= qualifying && outcome.eliminatedIds.length > 0) {
      outDuringQualifying += outcome.eliminatedIds.length;
    }

    players = players.map((p) =>
      outcome.bonuses[p.id] ? { ...p, score: p.score + outcome.bonuses[p.id] } : p,
    );

    // The first bracket round: highest total meets lowest.
    if (roundNumber === qualifying && outcome.nextRound) {
      const ranked = [...players].sort(
        (a, b) =>
          b.score - a.score ||
          activePlayerIds(rounds[0]).indexOf(a.id) - activePlayerIds(rounds[0]).indexOf(b.id),
      );
      const seedOf = (id: string | null) =>
        id ? ranked.findIndex((p) => p.id === id) + 1 : 0;
      const n = ranked.length;
      outcome.nextRound.matchups.forEach((m) => {
        if (!m.playerBId) {
          if (seedOf(m.playerAId) !== 1) badSeeding += 1;
          return;
        }
        if (sideOf(m) === "final") return;
        const top = n % 2 === 1 ? 1 : 0;
        if (seedOf(m.playerAId) + seedOf(m.playerBId) !== n + 1 + top) badSeeding += 1;
        if (m.seedA !== seedOf(m.playerAId)) badSeeding += 1;
      });
    }

    rounds = [...rounds.slice(0, roundNumber - 1), outcome.round];
    if (outcome.nextRound) rounds.push(outcome.nextRound);

    const knocked = new Set(outcome.eliminatedIds);
    const dropped = new Set(outcome.losersIds);
    const wild = new Set(outcome.wildcardIds);
    players = players.map((p) =>
      wild.has(p.id)
        ? { ...p, eliminated: false, losersBracket, wildcardUsed: true }
        : knocked.has(p.id)
          ? { ...p, eliminated: true, losersBracket: false }
          : dropped.has(p.id)
            ? { ...p, losersBracket: true }
            : p,
    );

    championId = outcome.championId;
    if (championId || !outcome.nextRound) break;
    roundNumber += 1;
  }

  return {
    rounds,
    players,
    championId,
    roundsPlayed: roundNumber,
    qualifying,
    outDuringQualifying,
    badBonuses,
    badSeeding,
  };
};

{
  let decided = true;
  let withinPromise = true;
  let nobodyOutInQualifying = true;
  let qualifyingFirst = true;
  let bonusesRight = true;
  let seededRight = true;
  let seriesRight = true;
  let finalLast = true;
  let qDetail = "";

  for (const losersBracket of [false, true]) {
    for (const qualifying of [0, 1, 2, 3]) {
      for (let count = 2; count <= 16; count++) {
        for (let seed = 1; seed <= 8; seed++) {
          const night = playSeededNight(count, losersBracket, qualifying, 99, seed * 977 + count * 13 + qualifying);
          const max = roundsToDecide(count, losersBracket, qualifying, 3);
          const tag = `${count} players, ${qualifying}Q${losersBracket ? ", LB" : ""}, seed ${seed}`;

          if (!night.championId) {
            decided = false;
            qDetail ||= `${tag}: undecided`;
          }
          // A best-of-3 can finish a game early, never late.
          if (night.roundsPlayed > max || night.roundsPlayed < max - 1) {
            withinPromise = false;
            qDetail ||= `${tag}: ${night.roundsPlayed} rounds, promised up to ${max}`;
          }
          if (night.outDuringQualifying > 0) nobodyOutInQualifying = false;
          if (night.badBonuses > 0) {
            bonusesRight = false;
            qDetail ||= `${tag}: ${night.badBonuses} bonuses off`;
          }
          if (night.badSeeding > 0) {
            seededRight = false;
            qDetail ||= `${tag}: first bracket round not seeded`;
          }
          night.rounds.forEach((round, index) => {
            const isQ = round.matchups.every((m) => sideOf(m) === "qualifying");
            if ((index < qualifying) !== isQ) qualifyingFirst = false;
          });

          const finals = night.rounds.filter((round) =>
            round.matchups.some((m) => sideOf(m) === "final"),
          );
          const lastFinal = finals[finals.length - 1]?.matchups[0];
          const score = lastFinal ? seriesScore(lastFinal) : null;
          if (
            !lastFinal ||
            !score ||
            finals.length > 3 ||
            finals.some((round) => round.matchups.length !== 1) ||
            Math.max(score.winsA, score.winsB) !== winsNeeded(3) ||
            lastFinal.winnerId !== night.championId
          ) {
            seriesRight = false;
            qDetail ||= `${tag}: final series ${score ? `${score.winsA}-${score.winsB}` : "missing"} over ${finals.length} games`;
          }
          const firstFinal = night.rounds.indexOf(finals[0]);
          if (firstFinal >= 0 && firstFinal !== night.rounds.length - finals.length) {
            finalLast = false;
          }
        }
      }
    }
  }

  check("with qualifying, seeding and a best-of-3 final, every night produces a champion", decided, qDetail);
  check(
    "and takes no more rounds than the lobby promises — one fewer when the final goes 2–0",
    withinPromise,
    `12 players, 2 qualifying: up to ${roundsToDecide(12, false, 2, 3)} rounds; with a loser's bracket ${roundsToDecide(12, true, 2, 3)}`,
  );
  check("nobody is knocked out of a qualifying round", nobodyOutInQualifying);
  check("the qualifying rounds come first, and only as many as the host set", qualifyingFirst);
  check("beating your opponent adds half your round again to your total, and nothing else does", bonusesRight, qDetail);
  check("the bracket after qualifying is drawn highest total against lowest, top seed owed the bye", seededRight, qDetail);
  check("the final is a best of 3: one matchup a round, won by the first to two", seriesRight, qDetail);
  check("the final's games are the last rounds played", finalLast);
}

{
  // A final that goes 1–1 plays a third game; one that goes 2–0 does not.
  const finalists = makePlayers(2).map((p) => ({ ...p, score: 1000 }));
  const opening = buildFirstRound(finalists, { finalBestOf: 3 });
  const game1 = settleRound(
    opening,
    finalists.map((p) => ({ ...p, roundScore: p.id === "p1" ? 500 : 100 })),
    { losersBracket: false, playedRounds: [], hasMoreRounds: true, finalBestOf: 3, seeded: true },
  );
  const game2 = settleRound(
    game1.nextRound!,
    finalists.map((p) => ({ ...p, roundScore: p.id === "p2" ? 500 : 100 })),
    { losersBracket: false, playedRounds: [game1.round], hasMoreRounds: true, finalBestOf: 3, seeded: true },
  );
  const game3 = settleRound(
    game2.nextRound!,
    finalists.map((p) => ({ ...p, roundScore: p.id === "p2" ? 600 : 300 })),
    { losersBracket: false, playedRounds: [game1.round, game2.round], hasMoreRounds: true, finalBestOf: 3, seeded: true },
  );

  check(
    "two players with a best-of-3 final go straight to game one of it",
    opening.matchups.length === 1 && sideOf(opening.matchups[0]) === "final" && opening.matchups[0].series?.game === 1,
  );
  check(
    "winning game one wins nothing yet — game two is drawn between the same two",
    game1.championId === null &&
      game1.eliminatedIds.length === 0 &&
      game1.nextRound?.matchups[0].series?.game === 2 &&
      game1.nextRound?.matchups[0].series?.winsA + game1.nextRound!.matchups[0].series!.winsB === 1,
  );
  check(
    "1–1 goes to a deciding game three, and its winner takes the night",
    game2.championId === null &&
      game2.nextRound?.matchups[0].series?.game === 3 &&
      game3.championId === "p2" &&
      game3.eliminatedIds.join() === "p1" &&
      game3.nextRound === null,
    `champion ${game3.championId}`,
  );

  const sweep = settleRound(
    game1.nextRound!,
    finalists.map((p) => ({ ...p, roundScore: p.id === "p1" ? 500 : 100 })),
    { losersBracket: false, playedRounds: [game1.round], hasMoreRounds: true, finalBestOf: 3, seeded: true },
  );
  check("2–0 ends it — no third game", sweep.championId === "p1" && sweep.nextRound === null);

  const places = podium(
    finalists.map((p) => ({ ...p, eliminated: p.id === "p1" })),
    [game1.round, game2.round, game3.round],
    "p2",
  );
  check("the runner-up of a series is the finalist who lost it", places.runnerUpId === "p1");
}

{
  // Qualifying: nobody out, the winner's round counts ×1.5 on their total.
  const field = makePlayers(4);
  const q1 = buildFirstRound(field, { qualifying: true });
  const [m1, m2] = q1.matchups;
  const scores: Record<string, number> = {
    [m1.playerAId]: 400,
    [m1.playerBId!]: 300,
    [m2.playerAId]: 200,
    [m2.playerBId!]: 100,
  };
  const outcome = settleRound(
    q1,
    field.map((p) => ({ ...p, roundScore: scores[p.id], score: scores[p.id] })),
    { losersBracket: false, playedRounds: [], hasMoreRounds: true, qualifyingRounds: 2, seeded: true, finalBestOf: 3 },
  );
  check(
    "a qualifying round knocks nobody out",
    outcome.eliminatedIds.length === 0 && outcome.championId === null,
  );
  check(
    "and pays each winner half their round again",
    outcome.bonuses[m1.playerAId] === 200 &&
      outcome.bonuses[m2.playerAId] === 100 &&
      outcome.bonuses[m1.playerBId!] === undefined,
    JSON.stringify(outcome.bonuses),
  );
  // Totals after bonuses: 600, 300, 300, 100 — neighbours meet, and the two
  // who just played are kept apart while there is anyone else to draw.
  const next = outcome.nextRound!;
  check(
    "the next qualifying round pairs neighbours in the standings, without a rematch",
    next.matchups.every((m) => sideOf(m) === "qualifying") &&
      next.matchups[0].playerAId === m1.playerAId &&
      next.matchups[0].playerBId !== m1.playerBId,
    next.matchups.map((m) => `${m.playerAId}(#${m.seedA})-${m.playerBId}(#${m.seedB})`).join(", "),
  );
}

/* ------------------------------------------------------------------ *
 * 3b. Latecomers, and players sent back in
 * ------------------------------------------------------------------ */

{
  const five = makePlayers(5);
  const late: Player = { ...makePlayers(6)[5], benched: true };
  const qualifying = buildFirstRound(five, { qualifying: true });
  const bye = qualifying.matchups.find((m) => m.playerBId === null);

  const filled = addToDraw(qualifying, late.id, "qualifying");
  check(
    "a latecomer dealt into an odd qualifying draw takes the bye seat",
    Boolean(bye) &&
      filled.matchups.length === qualifying.matchups.length &&
      filled.matchups.find((m) => m.id === bye?.id)?.playerBId === late.id,
    filled.matchups.map((m) => `${m.playerAId}-${m.playerBId}`).join(", "),
  );
  check(
    "dealing them in again changes nothing",
    addToDraw(filled, late.id, "qualifying") === filled,
  );

  const even = buildFirstRound(makePlayers(4), { qualifying: true });
  const added = addToDraw(even, late.id, "qualifying");
  const own = added.matchups[added.matchups.length - 1];
  check(
    "into an even draw they get a matchup of their own, with a fresh id",
    added.matchups.length === even.matchups.length + 1 &&
      own.playerAId === late.id &&
      own.playerBId === null &&
      sideOf(own) === "qualifying" &&
      new Set(added.matchups.map((m) => m.id)).size === added.matchups.length,
    own.id,
  );
  check(
    "nothing already drawn moves",
    even.matchups.every((m, i) => added.matchups[i] === m),
  );

  const asLate = enterRound(even, late, false);
  check(
    "a latecomer entering qualifying joins the field, off the bench",
    asLate !== null &&
      activePlayerIds(asLate.round).includes(late.id) &&
      asLate.player.benched === false &&
      asLate.player.eliminated === false,
  );

  // The bracket: four players, single elimination.
  const bracket = buildFirstRound(makePlayers(4));
  const ontoTable = enterRound(bracket, late, false);
  check(
    "a latecomer entering a bracket round takes the Redemption Table instead",
    ontoTable !== null &&
      ontoTable.round === bracket &&
      ontoTable.player.eliminated === true &&
      ontoTable.player.benched === false,
  );
  check(
    "and is dealt a table seat from there, while a benched player is not",
    redemptionRoster(bracket, [...makePlayers(4), ontoTable!.player]).includes(late.id) &&
      !redemptionRoster(bracket, [...makePlayers(4), { ...late, eliminated: true }]).includes(late.id),
  );

  const out: Player = { ...makePlayers(4)[3], eliminated: true, wildcardUsed: true };
  const three = buildFirstRound(makePlayers(3));
  const back = enterRound(three, out, false);
  check(
    "a knocked-out player sent back in takes the bye seat and keeps their wildcard spent",
    back !== null &&
      activePlayerIds(back.round).includes(out.id) &&
      back.player.eliminated === false &&
      back.player.wildcardUsed === true &&
      back.round.matchups.every((m) => m.playerBId !== null),
  );
  check(
    "in a loser's-bracket game they come back into the loser's bracket",
    entrySide(three, true) === "losers" &&
      enterRound(three, out, true)?.player.losersBracket === true &&
      sideOf(enterRound(three, out, true)!.round.matchups.find((m) => m.playerAId === out.id)!) === "losers",
  );

  const final: BracketRound = {
    roundNumber: 3,
    resolved: false,
    matchups: [{ ...three.matchups[0], bracket: "final", series: { bestOf: 3, game: 1, winsA: 0, winsB: 0 } }],
  };
  check(
    "nobody is dealt into a final",
    entrySide(final, false) === null &&
      enterRound(final, out, false) === null &&
      addToDraw(final, out.id, "final") === final,
  );
  check(
    "a latecomer at the final still gets the Redemption Table",
    enterRound(final, late, false)?.player.eliminated === true,
  );

  // A player dealt into qualifying after round one stays in the field.
  const second = settleRound(
    { ...filled, matchups: filled.matchups },
    [...five, late].map((p) => ({ ...p, benched: false, roundScore: 10 })),
    { losersBracket: false, playedRounds: [], hasMoreRounds: true, qualifyingRounds: 2, seeded: true },
  );
  check(
    "a latecomer who played a qualifying round is drawn into the next one",
    second.nextRound !== null && activePlayerIds(second.nextRound).includes(late.id),
    second.nextRound ? activePlayerIds(second.nextRound).join(", ") : "no next round",
  );
}

/* ------------------------------------------------------------------ *
 * 4. The host's remote: who gets the controls
 * ------------------------------------------------------------------ */

check(
  "HMAC-SHA256 matches the published test vector (RFC 4231, case 2)",
  hmacSha256Hex("Jefe", "what do ya want for nothing?") ===
    "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
);

{
  const pin = "4321";
  const proof = hostProof(pin, "TRIVIA9");
  const hello = (uid: string, password = "TRIVIA9", controllerId = "remote-a") => ({
    type: "remote-hello" as const,
    pin,
    controllerId,
    label: "iPad",
    signature: remoteSignature(hostProof(pin, password), pin, uid, controllerId),
  });
  const ipad = { uid: "uid-ipad" };
  const stranger = { uid: "uid-stranger" };

  check(
    "a remote with the host password is let in",
    judgeRemoteHello(proof, pin, hello(ipad.uid), ipad) === "accept",
  );
  check(
    "a remote with the wrong password is told so",
    judgeRemoteHello(proof, pin, hello(ipad.uid, "WRONG1"), ipad) === "reject",
  );
  check(
    "a hello copied off the bus and sent from another device is refused",
    judgeRemoteHello(proof, pin, hello(ipad.uid), stranger) === "reject",
  );
  check(
    "a window that is no longer hosting answers for nobody",
    judgeRemoteHello(null, pin, hello(ipad.uid), ipad) === "ignore",
  );
  check(
    "the local copy of a network hello is not mistaken for a wrong password",
    judgeRemoteHello(proof, pin, hello(ipad.uid)) === "ignore" &&
      judgeRemoteHello(proof, pin, hello(LOCAL_UID)) === "accept",
  );

  const wire = JSON.stringify(hello(ipad.uid));
  check(
    "neither the password nor its proof ever goes on the bus",
    !wire.includes("TRIVIA9") && !wire.includes(proof),
  );

  const bound = bindRemote(new Map(), hello(ipad.uid), ipad, Date.now());
  check(
    "commands are taken from the device that proved the password",
    judgeRemoteMessage(bound, "remote-a", ipad) === "accept",
  );
  check(
    "and not from anyone else using its remote id",
    judgeRemoteMessage(bound, "remote-a", stranger) === "unbound",
  );
  check(
    "a remote the host window has forgotten is asked to say hello again",
    judgeRemoteMessage(new Map(), "remote-a", ipad) === "unbound",
  );
  check(
    "an unknown remote over the local bus is ignored, a known one is heard",
    judgeRemoteMessage(new Map(), "remote-a") === "ignore" &&
      judgeRemoteMessage(bound, "remote-a") === "accept",
  );
  check(
    "a remote that stops checking in drops off the host's desk",
    liveRemotes(bound, Date.now()).length === 1 &&
      liveRemotes(bound, Date.now() + 60_000).length === 0,
  );
}


{
  // Typed on a tablet, a suggested password arrives in lower case.
  const pin = "7070";
  const ipad = { uid: "uid-ipad" };
  const proof = hostProof(pin, "L9YB4S");
  const spellings = passwordSpellings("l9yb4s");
  const [first, ...rest] = spellings.map((spelling) =>
    remoteSignature(hostProof(pin, spelling), pin, ipad.uid, "remote-b"),
  );
  const hello = {
    type: "remote-hello" as const,
    pin,
    controllerId: "remote-b",
    label: "iPad",
    signature: first,
    alternates: rest,
  };
  check(
    "a password typed in the wrong case still gets the remote in",
    spellings.includes("L9YB4S") && judgeRemoteHello(proof, pin, hello, ipad) === "accept",
  );
  check(
    "but a hello stuffed with guesses is not read past the first two alternates",
    judgeRemoteHello(
      proof,
      pin,
      {
        ...hello,
        signature: "0".repeat(64),
        alternates: ["1".repeat(64), "2".repeat(64), first],
      },
      ipad,
    ) === "reject",
  );

  const key = hostProof(pin, "L9YB4S");
  check(
    "a pairing QR's key is read from after the #, and nothing else is taken for one",
    pairingKeyFromHash(`#key=${key}`) === key &&
      pairingKeyFromHash("#key=not-a-key") === null &&
      pairingKeyFromHash("") === null,
  );
  check(
    "and a remote holding that key is let straight in",
    judgeRemoteHello(
      key,
      pin,
      {
        type: "remote-hello",
        pin,
        controllerId: "remote-c",
        label: "iPad",
        signature: remoteSignature(key, pin, ipad.uid, "remote-c"),
      },
      ipad,
    ) === "accept",
  );
}

/* ------------------------------------------------------------------ *
 * 5. Rejoin codes the host can read back, and the big screen's words
 * ------------------------------------------------------------------ */

{
  const dealt = Array.from({ length: 400 }, () => suggestRejoinCode());
  check(
    "a dealt rejoin code is always four digits",
    dealt.every((code) => /^\d{4}$/.test(code)),
  );
  check(
    "and they are not all the same four digits",
    new Set(dealt).size > 300,
    `${new Set(dealt).size} different codes in 400`,
  );

  const pin = "5030";
  check(
    "the host keeps a code that matches its proof",
    verifiedRejoinCode(pin, "4821", playerProof(pin, "4821")) === "4821",
  );
  check(
    "and not one that does not — it would read the wrong code back",
    verifiedRejoinCode(pin, "4821", playerProof(pin, "1111")) === undefined &&
      verifiedRejoinCode(pin, "4821", undefined) === undefined,
  );

  const day = new Date(2026, 8, 24);
  const today = formatBroadcastDate(day);
  check(
    "the big screen says Trivia, and Elevate with today's date, by default",
    renderBroadcastText(undefined, DEFAULT_BROADCAST_TITLE, day) === "Trivia" &&
      renderBroadcastText("", DEFAULT_BROADCAST_SUBTITLE, day) === `Elevate · ${today}` &&
      /2026/.test(today),
    `"${renderBroadcastText("", DEFAULT_BROADCAST_SUBTITLE, day)}"`,
  );
  check(
    "and says whatever the host sets instead, date filled in",
    renderBroadcastText("Kava Night {date}", DEFAULT_BROADCAST_SUBTITLE, day) ===
      `Kava Night ${today}`,
  );
}

/* ------------------------------------------------------------------ *
 * 6. Bots, on and off, up to the first round
 * ------------------------------------------------------------------ */

{
  const humans = makePlayers(3);
  const bots: Player[] = makePlayers(2).map((p, i) => ({
    ...p,
    id: `bot-${i}`,
    name: `Bot ${i}`,
    isBot: true,
  }));
  const game = (phase: GamePhase, currentRound = 0): GameState =>
    ({
      phase,
      currentRound,
      players: [...humans, ...bots],
      bracket: currentRound ? [buildFirstRound([...humans, ...bots])] : [],
      botsEnabled: true,
    }) as unknown as GameState;

  const setup = applyBotsSetting(game(GamePhase.HOST_CONFIG), false);
  check(
    "bots can be switched off while the game is still being set up",
    setup.botsEnabled === false,
  );

  const lobby = applyBotsSetting(game(GamePhase.LOBBY), false);
  check(
    "switching them off in the lobby takes every bot out and keeps every person",
    lobby.botsEnabled === false &&
      lobby.players.length === 3 &&
      lobby.players.every((p) => !p.isBot),
  );
  check(
    "switching them back on seats nobody by itself",
    applyBotsSetting(lobby, true).botsEnabled === true &&
      applyBotsSetting(lobby, true).players.length === 3,
  );

  const wheel = applyBotsSetting(game(GamePhase.CATEGORY_SELECT, 1), false);
  const drawn = activePlayerIds(wheel.bracket[0]);
  check(
    "on round one's wheel, switching them off redraws the round without them",
    wheel.bracket.length === 1 &&
      drawn.length === 3 &&
      humans.every((p) => drawn.includes(p.id)) &&
      !drawn.some((id) => id.startsWith("bot-")),
    drawn.join(", "),
  );

  const alone = applyBotsSetting(
    { ...game(GamePhase.CATEGORY_SELECT, 1), players: [humans[0], ...bots] } as GameState,
    false,
  );
  check(
    "a lone player left once the bots go has no bracket to be drawn into",
    alone.bracket.length === 0 && alone.players.length === 1,
  );

  const playing = game(GamePhase.PLAYING, 1);
  const secondWheel = game(GamePhase.CATEGORY_SELECT, 2);
  check(
    "once round one is dealt, the setting is fixed",
    !botsSettingOpen(playing) &&
      applyBotsSetting(playing, false) === playing &&
      applyBotsSetting(secondWheel, false) === secondWheel,
  );
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nevery check passed");
