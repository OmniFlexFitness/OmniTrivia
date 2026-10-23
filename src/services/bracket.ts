import {
  BracketRound,
  BracketSide,
  FinalSeries,
  GameState,
  Matchup,
  Player,
} from "../types";
import { FINAL_BEST_OF, WIN_MULTIPLIER } from "../constants";

/**
 * The bracket for a room of players: single elimination, or double
 * elimination when the host opens the game with a loser's bracket.
 *
 * Every round pairs each surviving player against exactly one opponent. The
 * pairing is fixed for the whole round; the round's questions run against that
 * pairing, and whoever scores more of that round's points advances. The odd
 * player out gets a bye and advances without a matchup.
 *
 * With a loser's bracket both halves play in the same round — one spin of the
 * wheel, one set of questions, every matchup in the room at once. A player who
 * loses in the winners' bracket drops into the loser's bracket for the next
 * round; a player who loses there is out. When one player is left on each side
 * they meet in a grand final, and whoever wins that takes the night.
 *
 * A round-robin game has no bracket at all: every round pairs each player
 * with somebody they have not played yet, nobody goes out, and when the host
 * calls it the highest total takes the night.
 */

const shuffle = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/** Has this matchup no opponent in it — a bye rather than a duel? */
const isBye = (matchup: Matchup): boolean => matchup.playerBId === null;

/**
 * Was this matchup a bye that a wildcard filled? The player who was owed the
 * bye is always `playerAId`; the wildcard is always `playerBId`.
 */
const isWildcardMatchup = (matchup: Matchup): boolean =>
  Boolean(matchup.wildcardId);

/**
 * How many byes each player has already been handed this game.
 *
 * Read from the bracket itself rather than tracked alongside it: the bracket
 * is the record of what happened, and a second copy of that record is a second
 * thing to keep in step.
 *
 * A bye that a wildcard filled still counts against the player who was owed
 * it. Drawing the wildcard is the soft end of the bracket — somebody who has
 * already been knocked out once — so it has to rotate exactly the way a bye
 * does, or the same player meets the comeback every round.
 */
export const byeCounts = (rounds: BracketRound[]): Map<string, number> => {
  const counts = new Map<string, number>();

  rounds.forEach((round) =>
    round.matchups
      .filter((matchup) => isBye(matchup) || isWildcardMatchup(matchup))
      .forEach((matchup) => {
        counts.set(matchup.playerAId, (counts.get(matchup.playerAId) ?? 0) + 1);
      }),
  );

  return counts;
};

/**
 * Put the player who should sit this one out at the end of the list, where
 * `pair` hands out the bye.
 *
 * Without this the bye falls to whoever is last in the advancing list — and
 * the player who won a bye is *always* last, because their matchup is the last
 * one in the round. So one unlucky draw in round one became a free pass
 * through the entire bracket: in a five-player game the same person took a bye
 * in round one and round two and reached the final without facing anybody.
 *
 * The bye goes to whoever has had the fewest so far, and ties break on bracket
 * order rather than chance — after round one nothing about the draw should be
 * random.
 */
const withByeLast = (
  advancingIds: string[],
  playedRounds: BracketRound[],
): string[] => {
  if (advancingIds.length % 2 === 0) return advancingIds;

  const counts = byeCounts(playedRounds);
  const byesFor = (id: string) => counts.get(id) ?? 0;

  const sitsOut = advancingIds.reduce((fewest, id) =>
    byesFor(id) < byesFor(fewest) ? id : fewest,
  );

  return [...advancingIds.filter((id) => id !== sitsOut), sitsOut];
};

/**
 * Matchup ids, per side. The winners' side keeps the id every matchup had
 * before there was a loser's bracket, so a game saved by an older build still
 * lines up with the lanes it dealt.
 */
const ID_PREFIX: Record<BracketSide, string> = {
  qualifying: "q",
  winners: "m",
  losers: "l",
  final: "f",
  roundRobin: "rr",
};

/** Which side of the bracket a matchup is on. Older matchups are all winners. */
export const sideOf = (matchup: Matchup): BracketSide =>
  matchup.bracket ?? "winners";

/** What each side is called on screen. */
export const SIDE_LABELS: Record<BracketSide, string> = {
  qualifying: "Qualifying",
  winners: "Winners' bracket",
  losers: "Loser's bracket",
  final: "Grand final",
  roundRobin: "Round robin",
};

/**
 * A side nobody goes out of: qualifying, and every round of a round robin.
 * A bye on one of these still earns the win bonus — nobody advances anywhere,
 * so a bye that paid nothing would only be a penalty for the numbers being odd.
 */
const isOpenSide = (side: BracketSide): boolean =>
  side === "qualifying" || side === "roundRobin";

/** The matchup a lane plays out, so a screen can say which bracket it is in. */
export const matchupById = (
  rounds: BracketRound[],
  matchupId: string | null,
): Matchup | undefined =>
  matchupId
    ? rounds.flatMap((round) => round.matchups).find((m) => m.id === matchupId)
    : undefined;

/** Pair an ordered list of player ids into matchups, last one out gets a bye. */
const pair = (
  roundNumber: number,
  playerIds: string[],
  side: BracketSide = "winners",
): Matchup[] => {
  const matchups: Matchup[] = [];

  for (let i = 0; i < playerIds.length; i += 2) {
    const playerAId = playerIds[i];
    const playerBId = playerIds[i + 1] ?? null;
    matchups.push({
      id: `r${roundNumber}-${ID_PREFIX[side]}${matchups.length + 1}`,
      roundNumber,
      bracket: side,
      playerAId,
      playerBId,
      winnerId: null,
      scoreA: null,
      scoreB: null,
      tiebreak: null,
    });
  }

  return matchups;
};

/** Games a best-of series needs to win: more than half of them. */
export const winsNeeded = (bestOf: number): number => Math.floor(bestOf / 2) + 1;

/** One game of a best-of final, between two players. */
const finalGame = (
  roundNumber: number,
  playerAId: string,
  playerBId: string,
  series: FinalSeries,
): Matchup => ({
  ...pair(roundNumber, [playerAId, playerBId], "final")[0],
  // A series keeps the same id stem on every game, so a screen can tell
  // game two from a fresh final.
  id: `r${roundNumber}-f1`,
  series,
});

/**
 * The series score once a game of it has been played: the wins it was played
 * at, plus that game's result. Null for a matchup that is not part of one.
 */
export const seriesScore = (
  matchup: Matchup,
): { winsA: number; winsB: number; bestOf: number; game: number } | null => {
  const series = matchup.series;
  if (!series) return null;
  return {
    bestOf: series.bestOf,
    game: series.game,
    winsA: series.winsA + (matchup.winnerId === matchup.playerAId ? 1 : 0),
    winsB:
      series.winsB +
      (matchup.winnerId && matchup.winnerId === matchup.playerBId ? 1 : 0),
  };
};

/** How a game is shaped from its very first draw. */
export interface OpeningOptions {
  /** No bracket: everybody plays everybody, and nobody goes out. */
  roundRobin?: boolean;
  /** Round one is a qualifying round: nobody goes out. */
  qualifying?: boolean;
  losersBracket?: boolean;
  /** Games in the final. One is the old single-match final. */
  finalBestOf?: number;
}

/** The opening options a game's settings call for. */
export const openingOptions = (
  state: Pick<GameState, "qualifyingRounds" | "losersBracket" | "roundRobin">,
): OpeningOptions =>
  // A round robin has no bracket for qualifying to seed or a loser's bracket
  // to catch anybody, so it ignores both.
  state.roundRobin
    ? { roundRobin: true }
    : {
        qualifying: state.qualifyingRounds > 0,
        losersBracket: state.losersBracket,
        finalBestOf: FINAL_BEST_OF,
      };

/**
 * Draw round one. The draw is random — there is no ranking to seed from before
 * anyone has answered a question.
 *
 * With qualifying rounds it is a qualifying round, which nobody goes out of.
 * Without them it is the bracket's first round — or, for a room of two with a
 * best-of final, game one of that final. In a round robin it is the first
 * round of the schedule: neighbours in the shuffled order meet, and that
 * order is the roster every later round rotates (see `roundRobinOrder`).
 */
export const buildFirstRound = (
  players: Player[],
  options: OpeningOptions = {},
): BracketRound => {
  const ids = shuffle(players.map((p) => p.id));
  const bestOf = options.finalBestOf ?? 1;

  if (options.roundRobin) {
    return { roundNumber: 1, matchups: pair(1, ids, "roundRobin"), resolved: false };
  }

  if (!options.qualifying && !options.losersBracket && bestOf > 1 && ids.length === 2) {
    return {
      roundNumber: 1,
      matchups: [finalGame(1, ids[0], ids[1], { bestOf, game: 1, winsA: 0, winsB: 0 })],
      resolved: false,
    };
  }

  return {
    roundNumber: 1,
    matchups: pair(1, ids, options.qualifying ? "qualifying" : "winners"),
    resolved: false,
  };
};

/**
 * Re-pair the winners of the previous round, in bracket order.
 *
 * Nothing here is random: round one is drawn from a hat, and from then on the
 * bracket decides who plays whom — the winner of the first matchup meets the
 * winner of the second, and so on. `playedRounds` is only read to work out who
 * is owed a bye when the field is an odd size.
 */
export const buildNextRound = (
  roundNumber: number,
  advancingIds: string[],
  playedRounds: BracketRound[] = [],
): BracketRound => ({
  roundNumber,
  matchups: pair(roundNumber, withByeLast(advancingIds, playedRounds), "winners"),
  resolved: false,
});

/** Every player still competing this round, byes included. */
export const activePlayerIds = (round: BracketRound | undefined): string[] => {
  if (!round) return [];
  return round.matchups.flatMap((m) =>
    m.playerBId ? [m.playerAId, m.playerBId] : [m.playerAId],
  );
};

/**
 * Who is playing this round.
 *
 * A game with fewer than two players has no bracket at all — there is nobody
 * to be matched against — so everyone still in the game is playing.
 */
export const rosterForRound = (
  round: BracketRound | undefined,
  players: Player[],
): string[] =>
  round
    ? activePlayerIds(round)
    : players.filter((p) => !p.eliminated && !p.benched).map((p) => p.id);

/**
 * The Redemption Table: everybody out of the bracket, still playing.
 *
 * A player who is knocked out keeps answering every round — the same spin,
 * the same category, the same questions — on their own seat with nobody
 * drawn against them. What they bank there keeps building the redemption
 * score they have been building since round one, and the best of them each
 * round can be pulled back into the bracket as a wildcard.
 * Without it, losing round one meant watching the rest of the night from a
 * phone with nothing on it.
 *
 * Only a game with a bracket has one: a solo game has nobody to knock out.
 */
export const redemptionRoster = (
  round: BracketRound | undefined,
  players: Player[],
): string[] => {
  if (!round) return [];
  const inBracket = new Set(activePlayerIds(round));
  return players
    .filter((player) => player.eliminated && !player.benched && !inBracket.has(player.id))
    .map((player) => player.id);
};

/* ------------------------------------------------------------------ *
 * Dealing somebody into a round that was drawn without them
 * ------------------------------------------------------------------ */

/** A round before the bracket: every matchup in it is a qualifying one. */
export const isQualifyingRound = (round: BracketRound | undefined): boolean =>
  Boolean(round && round.matchups.length > 0 && round.matchups.every((m) => sideOf(m) === "qualifying"));

/** A round of a round-robin game: every matchup in it is a round-robin one. */
export const isRoundRobinRound = (round: BracketRound | undefined): boolean =>
  Boolean(round && round.matchups.length > 0 && round.matchups.every((m) => sideOf(m) === "roundRobin"));

/** A game played as a round robin, read off the rounds it has drawn. */
export const isRoundRobinGame = (rounds: BracketRound[]): boolean =>
  rounds.length > 0 && rounds.every(isRoundRobinRound);

/** A round that is a game of the final: nobody else can be dealt into it. */
export const isFinalRound = (round: BracketRound | undefined): boolean =>
  Boolean(round && round.matchups.length > 0 && round.matchups.every((m) => sideOf(m) === "final"));

/**
 * Which side of a drawn round a player entering it belongs on.
 *
 * Before the bracket everybody is in qualifying. In the bracket a player
 * the host sends back in goes where a wildcard goes: the loser's bracket when
 * the game has one — the winners' side is for people nobody has beaten — and
 * the bracket proper otherwise. A final is between the two who reached it,
 * so there is no side to enter: null.
 */
export const entrySide = (
  round: BracketRound,
  losersBracket: boolean,
): BracketSide | null => {
  if (isFinalRound(round)) return null;
  if (isRoundRobinRound(round)) return "roundRobin";
  if (isQualifyingRound(round)) return "qualifying";
  return losersBracket ? "losers" : "winners";
};

/**
 * Put a player into a round that was drawn without them.
 *
 * Somebody who arrived after START GAME, or somebody the host wants back in
 * the bracket, has to be dealt into a draw that is already made and already
 * on the projector. The least disruptive seat is the one nobody is in: a
 * bye on that side — the odd player out, who was going to play alone — gets
 * them as an opponent. Failing that they are given a matchup of their own,
 * which plays as a bye: they answer the round's questions alone and go
 * through, exactly as an odd player would. Nothing already drawn moves.
 *
 * A player already in the round is left where they are, and a final is left
 * alone — it is between the two who reached it.
 */
export const addToDraw = (
  round: BracketRound,
  playerId: string,
  side: BracketSide,
): BracketRound => {
  if (activePlayerIds(round).includes(playerId) || side === "final") return round;

  const matchups = [...round.matchups];
  const byeIndex = matchups.findIndex(
    (m) => sideOf(m) === side && isBye(m) && !m.series,
  );

  if (byeIndex >= 0) {
    const bye = matchups[byeIndex];
    matchups[byeIndex] = {
      ...bye,
      playerBId: playerId,
      // The seat was never ranked: whoever had the bye keeps their seed, the
      // newcomer shows none.
      ...(bye.seedA !== undefined ? { seedB: null } : {}),
    };
    return { ...round, matchups };
  }

  const taken = new Set(matchups.map((m) => m.id));
  let n = matchups.filter((m) => sideOf(m) === side).length + 1;
  while (taken.has(`r${round.roundNumber}-${ID_PREFIX[side]}${n}`)) n += 1;

  return {
    ...round,
    matchups: [
      ...matchups,
      {
        ...pair(round.roundNumber, [playerId], side)[0],
        id: `r${round.roundNumber}-${ID_PREFIX[side]}${n}`,
      },
    ],
  };
};

/**
 * Who this question is actually waiting on: the bracket's players and the
 * Redemption Table's.
 *
 * The host always holds a seat so they can test the game from their own
 * screen, but a host who has switched answering off is running the show, not
 * playing it. Every count of the room — the engine's auto-advance, the host's
 * tracker and the projector's tally — has to agree on that, so they all come
 * through here.
 */
export const answeringRoster = (
  round: BracketRound | undefined,
  players: Player[],
  hostAnswering: boolean,
): string[] => {
  const roster = [
    ...rosterForRound(round, players),
    ...redemptionRoster(round, players),
  ];
  if (hostAnswering) return roster;

  const hostPlayerId = players.find((p) => p.isHost)?.id;
  return roster.filter((id) => id !== hostPlayerId);
};

/** The matchup a given player is in this round, if any. */
export const matchupForPlayer = (
  round: BracketRound | undefined,
  playerId: string,
): Matchup | undefined =>
  round?.matchups.find(
    (m) => m.playerAId === playerId || m.playerBId === playerId,
  );

/**
 * What beating your opponent adds to your total: the round's points again,
 * times (WIN_MULTIPLIER - 1). Whole points, because a scoreboard reading
 * 1237.5 is a scoreboard nobody trusts.
 */
export const winBonusFor = (roundScore: number): number =>
  Math.round(Math.max(0, roundScore) * (WIN_MULTIPLIER - 1));

/** The win bonus each player earned in a resolved round. */
export const winBonuses = (round: BracketRound): Record<string, number> => {
  const bonuses: Record<string, number> = {};
  round.matchups.forEach((matchup) => {
    if (matchup.winnerId && matchup.winBonus) {
      bonuses[matchup.winnerId] = (bonuses[matchup.winnerId] ?? 0) + matchup.winBonus;
    }
  });
  return bonuses;
};

/**
 * Decide every matchup in a round on that round's points.
 *
 * Ties are broken on the running total and then on the draw order, rather than
 * at random: a coin flip in front of a room reads as the game being broken.
 */
export const resolveRound = (
  round: BracketRound,
  players: Player[],
): { round: BracketRound; advancingIds: string[] } => {
  const byId = new Map(players.map((p) => [p.id, p]));

  const matchups = round.matchups.map<Matchup>((matchup) => {
    const a = byId.get(matchup.playerAId);
    const b = matchup.playerBId ? byId.get(matchup.playerBId) : undefined;

    const scores = { scoreA: a?.roundScore ?? null, scoreB: b?.roundScore ?? null };

    // Bye, or an opponent who left the game: A walks through. In a
    // qualifying or round-robin round a bye still earns the win bonus (see
    // `isOpenSide`).
    if (!b) {
      const bonus =
        isOpenSide(sideOf(matchup)) && a ? winBonusFor(a.roundScore) : 0;
      return {
        ...matchup,
        ...scores,
        winnerId: a?.id ?? null,
        tiebreak: "Bye",
        ...(bonus > 0 ? { winBonus: bonus } : {}),
      };
    }
    if (!a) {
      return { ...matchup, ...scores, winnerId: b.id, tiebreak: "Bye" };
    }

    const decided = (winner: Player, tiebreak: string | null): Matchup => {
      const bonus = winBonusFor(winner.roundScore);
      return {
        ...matchup,
        ...scores,
        winnerId: winner.id,
        tiebreak,
        ...(bonus > 0 ? { winBonus: bonus } : {}),
      };
    };

    if (a.roundScore !== b.roundScore) {
      return decided(a.roundScore > b.roundScore ? a : b, null);
    }

    if (a.score !== b.score) {
      return decided(
        a.score > b.score ? a : b,
        "Tied on the round — decided on total score",
      );
    }

    return decided(a, "Dead heat — advanced on the draw");
  });

  return {
    round: { ...round, matchups, resolved: true },
    advancingIds: matchups
      .map((m) => m.winnerId)
      .filter((id): id is string => id !== null),
  };
};

/* ------------------------------------------------------------------ *
 * Settling a round, on either side of the bracket
 * ------------------------------------------------------------------ */

/** Everything a finished round decides, for the game to act on. */
export interface RoundOutcome {
  /** The round, with every matchup settled on its points. */
  round: BracketRound;
  /** Nobody has beaten these yet, in bracket order. */
  winnersIds: string[];
  /** Lost once and still alive, in the order the next draw should pair them. */
  losersIds: string[];
  /** Knocked out of the bracket by this round. */
  eliminatedIds: string[];
  /** Set once the bracket has one player left in it. */
  championId: string | null;
  /**
   * Knocked-out players the next round pulls back in as wildcards. They may
   * also be in `eliminatedIds` — a player can be knocked out and drawn back in
   * by the same round — and this list wins: they are back in the bracket.
   */
  wildcardIds: string[];
  /**
   * Win bonuses this round earned, by player — to be added to their totals.
   * The bracket's own seeding has already counted them.
   */
  bonuses: Record<string, number>;
  /** The next round's draw, or null when the bracket is decided or out of rounds. */
  nextRound: BracketRound | null;
}

/**
 * Line the loser's bracket up for its next draw: the players who survived it
 * this round against the players who have just dropped into it.
 *
 * That is how a loser's bracket is normally fed — somebody who has already
 * come through it meets somebody fresh from the winners' side — and pairing
 * the two lists alternately gets it without chance playing any part. Whoever
 * is left over when the lists are uneven lines up at the end, where the bye
 * is handed out.
 */
const interleave = (survivors: string[], dropped: string[]): string[] => {
  const order: string[] = [];
  const longest = Math.max(survivors.length, dropped.length);
  for (let i = 0; i < longest; i++) {
    if (survivors[i]) order.push(survivors[i]);
    if (dropped[i]) order.push(dropped[i]);
  }
  return order;
};

/**
 * Who comes back in as a wildcard, if anybody.
 *
 * A wildcard fills what would otherwise be a bye: an odd field of three or
 * more on one side of the bracket. The pool is everybody out of the bracket
 * once this round is settled — the Redemption Table and anybody this round
 * has just knocked out — because every one of them played this round's
 * questions, so this round's points compare them like for like. Best round
 * wins it; then the redemption score, then the total, then the draw.
 *
 * Nobody comes back on zero: a phone left on the table does not get dealt
 * back into the bracket. And nobody comes back twice in one game.
 */
const drawWildcard = (
  players: Player[],
  outIds: Set<string>,
  drawOrder: string[],
  canWildcard: (player: Player) => boolean,
): string | null => {
  const seed = new Map(drawOrder.map((id, index) => [id, index]));
  const seedOf = (id: string) => seed.get(id) ?? Number.MAX_SAFE_INTEGER;

  const pool = players
    .filter(
      (player) =>
        outIds.has(player.id) &&
        !player.wildcardUsed &&
        player.roundScore > 0 &&
        canWildcard(player),
    )
    .sort(
      (a, b) =>
        b.roundScore - a.roundScore ||
        (b.redemptionScore ?? 0) - (a.redemptionScore ?? 0) ||
        b.score - a.score ||
        seedOf(a.id) - seedOf(b.id),
    );

  return pool[0]?.id ?? null;
};

/**
 * Pair one side of the bracket, with the wildcard (if there is one) taking the
 * seat the bye would have had — against whoever was owed it.
 */
const pairSide = (
  roundNumber: number,
  order: string[],
  side: BracketSide,
  wildcardId: string | null,
  seeds?: Map<string, number>,
): Matchup[] => {
  const matchups = wildcardId
    ? pair(roundNumber, [...order, wildcardId], side).map((matchup) =>
        matchup.playerBId === wildcardId ? { ...matchup, wildcardId } : matchup,
      )
    : pair(roundNumber, order, side);

  return seeds ? withSeeds(matchups, seeds) : matchups;
};

/**
 * Deal one player into a drawn round, and say what they become.
 *
 * Two people arrive at this: a latecomer off the bench, and a knocked-out
 * player the host is sending back in.
 *
 * - **A latecomer** joins the field in qualifying, or in a round robin —
 *   there is no bracket to be unfair to. Once the bracket is drawn they take the Redemption
 *   Table instead: the same questions, their own seat, redemption points
 *   from their first answer, and a wildcard back into the bracket if they
 *   earn one. The host can send them straight into the bracket from there.
 * - **A player sent back in** takes the entry side: a bye seat if there is
 *   one, a matchup of their own otherwise. Their wildcard is not spent — this
 *   is the host's call, not the table's.
 *
 * Null when the round cannot take them: it is a final, and the player is not
 * a latecomer with a table to go to.
 */
export const enterRound = (
  round: BracketRound,
  player: Player,
  losersBracket: boolean,
): { round: BracketRound; player: Player } | null => {
  const side = entrySide(round, losersBracket);
  const settled = { ...player, benched: false, entering: false };

  if (player.benched) {
    if (side === "qualifying" || side === "roundRobin") {
      return {
        round: addToDraw(round, player.id, side),
        player: { ...settled, eliminated: false, losersBracket: false },
      };
    }
    return { round, player: { ...settled, eliminated: true, losersBracket: false } };
  }

  if (!side) return null;
  return {
    round: addToDraw(round, player.id, side),
    player: { ...settled, eliminated: false, losersBracket: side === "losers" },
  };
};

/* ------------------------------------------------------------------ *
 * Standings, seeding and the qualifying draw
 * ------------------------------------------------------------------ */

/**
 * A field in standing order: highest total first, ties on the draw.
 */
const standingOrder = (
  ids: string[],
  scoreOf: (id: string) => number,
  drawOrder: string[],
): string[] => {
  const seed = new Map(drawOrder.map((id, index) => [id, index]));
  const seedOf = (id: string) => seed.get(id) ?? Number.MAX_SAFE_INTEGER;
  return [...ids].sort((a, b) => scoreOf(b) - scoreOf(a) || seedOf(a) - seedOf(b));
};

/** Each player's place in a ranked list, 1-based. */
const seedMap = (ranked: string[]): Map<string, number> =>
  new Map(ranked.map((id, index) => [id, index + 1]));

/** Write each side's standing onto the matchups it was drawn from. */
const withSeeds = (matchups: Matchup[], seeds: Map<string, number>): Matchup[] =>
  matchups.map((matchup) => ({
    ...matchup,
    seedA: seeds.get(matchup.playerAId),
    seedB: matchup.playerBId ? (seeds.get(matchup.playerBId) ?? null) : null,
  }));

/**
 * Seeded order: the highest total meets the lowest, the second meets the
 * second-lowest, and so on. With an odd field the top seed is the one left
 * over — last in the list, where `pair` hands out the bye (or a wildcard
 * takes the seat opposite). Being the top seed is supposed to be worth
 * something.
 *
 * Done again every round rather than once, so a seed is always the player's
 * standing *now*: the totals keep moving through the bracket.
 */
export const seededOrder = (ranked: string[]): string[] => {
  const field = [...ranked];
  const top = field.length % 2 === 1 ? field.shift() : undefined;
  const order: string[] = [];
  for (let i = 0, j = field.length - 1; i < j; i++, j--) {
    order.push(field[i], field[j]);
  }
  if (top) order.push(top);
  return order;
};

/**
 * The qualifying draw after round one: neighbours in the standings meet —
 * first against second, third against fourth — so every round is a close
 * game and the totals sort the room out. Nobody is drawn against somebody
 * they have already played while there is anyone else to draw. With an odd
 * field the bye goes to the lowest-ranked player who has had the fewest.
 */
const qualifyingOrder = (
  ranked: string[],
  history: BracketRound[],
): string[] => {
  const pool = [...ranked];
  let bye: string | undefined;

  if (pool.length % 2 === 1) {
    const counts = byeCounts(history);
    bye = [...pool]
      .reverse()
      .reduce((best, id) =>
        (counts.get(id) ?? 0) < (counts.get(best) ?? 0) ? id : best,
      );
    pool.splice(pool.indexOf(bye), 1);
  }

  const met = new Set<string>();
  history.forEach((round) =>
    round.matchups.forEach((m) => {
      if (!m.playerBId) return;
      met.add(`${m.playerAId}|${m.playerBId}`);
      met.add(`${m.playerBId}|${m.playerAId}`);
    }),
  );

  const order: string[] = [];
  while (pool.length > 1) {
    const a = pool.shift() as string;
    const fresh = pool.findIndex((b) => !met.has(`${a}|${b}`));
    const [b] = pool.splice(fresh >= 0 ? fresh : 0, 1);
    order.push(a, b);
  }
  order.push(...pool);
  if (bye) order.push(bye);
  return order;
};

/* ------------------------------------------------------------------ *
 * The round-robin schedule
 * ------------------------------------------------------------------ */

/**
 * Rounds a round robin needs for everybody to have played everybody once:
 * one fewer than the field when it is even, and the field itself when it is
 * odd — each round somebody sits out, and each player sits out once.
 */
export const roundRobinRounds = (playerCount: number): number =>
  playerCount < 2 ? 0 : playerCount % 2 === 0 ? playerCount - 1 : playerCount;

/**
 * One round of the circle method, the standard round-robin schedule: one seat
 * stays put and the rest rotate one place a round, so over a full cycle every
 * pair meets exactly once and, in an odd field, everybody sits out exactly
 * once.
 *
 * Relabelled so that round 0 pairs neighbours in `roster` — first v second,
 * third v fourth, the odd one out on a bye — which is exactly how round one is
 * drawn. That is what lets the schedule be picked back up from round one's
 * draw alone, rather than carried around beside the bracket. Past the end of
 * a cycle it starts again from the top.
 *
 * Returns the order `pair` turns into matchups: two by two, bye last.
 */
export const circleRound = (roster: string[], index: number): string[] => {
  const slots: (string | null)[] = roster.length % 2 === 1 ? [...roster, null] : [...roster];
  const m = slots.length;
  if (m < 2) return [...roster];

  const cycle = m - 1;
  const r = ((index % cycle) + cycle) % cycle;
  // Position k on the circle holds this element of the textbook schedule…
  const at = (k: number) => (k === 0 ? 0 : 1 + ((k - 1 + r) % cycle));
  // …and the textbook's element s is this seat of the roster.
  const seat = (s: number) => (s < m / 2 ? 2 * s : 2 * (m - 1 - s) + 1);

  const order: string[] = [];
  let bye: string | null = null;
  for (let i = 0; i < m / 2; i++) {
    const a = slots[seat(at(i))];
    const b = slots[seat(at(m - 1 - i))];
    if (a && b) order.push(a, b);
    else bye = a ?? b;
  }
  if (bye) order.push(bye);
  return order;
};

/** How many times each pair has met, keyed both ways round. */
const meetings = (history: BracketRound[]): Map<string, number> => {
  const met = new Map<string, number>();
  history.forEach((round) =>
    round.matchups.forEach((m) => {
      if (!m.playerBId) return;
      for (const key of [`${m.playerAId}|${m.playerBId}`, `${m.playerBId}|${m.playerAId}`]) {
        met.set(key, (met.get(key) ?? 0) + 1);
      }
    }),
  );
  return met;
};

/**
 * A round-robin round for a field that is no longer the one round one drew —
 * somebody was dealt in late, or somebody left — so the circle no longer
 * lines up with it.
 *
 * The bye goes to whoever has had the fewest. Everybody else is paired to
 * keep rematches to a minimum: a search that tries the people each player
 * has met least first, keeps the best complete pairing it finds, and stops
 * at the first one with no rematch at all. Its first try is the greedy
 * pairing, so there is always an answer; the budget only stops it hunting
 * for a better one in a large room where no perfect one exists.
 */
const leastMetOrder = (field: string[], history: BracketRound[]): string[] => {
  const pool = [...field];
  let bye: string | undefined;

  if (pool.length % 2 === 1) {
    const counts = byeCounts(history);
    bye = [...pool]
      .reverse()
      .reduce((best, id) =>
        (counts.get(id) ?? 0) < (counts.get(best) ?? 0) ? id : best,
      );
    pool.splice(pool.indexOf(bye), 1);
  }

  const met = meetings(history);
  const times = (a: string, b: string) => met.get(`${a}|${b}`) ?? 0;

  let best: string[] = [];
  let bestCost = Number.POSITIVE_INFINITY;
  let budget = 20000;

  const search = (left: string[], chosen: string[], cost: number): void => {
    if (cost >= bestCost || budget-- <= 0) return;
    if (left.length === 0) {
      best = [...chosen];
      bestCost = cost;
      return;
    }
    const [a, ...rest] = left;
    const partners = [...rest].sort((x, y) => times(a, x) - times(a, y));
    for (const b of partners) {
      // Squared, so two players meeting a third time costs more than two
      // pairs each meeting a second time.
      const n = times(a, b);
      search(
        rest.filter((id) => id !== b),
        [...chosen, a, b],
        cost + n * n,
      );
      if (bestCost === 0) return;
    }
  };

  search(pool, [], 0);
  return bye ? [...best, bye] : best;
};

/**
 * The order the next round-robin round is paired in.
 *
 * The roster is round one's draw, which is the circle's starting order (see
 * `circleRound`). While the field is still that roster, the next round is
 * simply the next turn of the circle — so a full cycle meets everybody with
 * everybody exactly once, in the fewest rounds it can be done in. Anybody
 * dealt into round one itself is already part of that roster. Once the field
 * changes later than that, the circle no longer fits it and the rest of the
 * night is paired on who has met whom.
 */
export const roundRobinOrder = (
  field: string[],
  history: BracketRound[],
): string[] => {
  const roster = history[0] ? activePlayerIds(history[0]) : [];
  const sameField =
    roster.length === field.length && roster.every((id) => field.includes(id));
  return sameField ? circleRound(roster, history.length) : leastMetOrder(field, history);
};

/**
 * Wins and losses across a game's matchups, by player. A bye in a round nobody
 * goes out of counts as a win, the same as it earns the win bonus.
 */
export const matchRecords = (
  rounds: BracketRound[],
): Map<string, { wins: number; losses: number }> => {
  const records = new Map<string, { wins: number; losses: number }>();
  const of = (id: string) => {
    const record = records.get(id) ?? { wins: 0, losses: 0 };
    records.set(id, record);
    return record;
  };

  rounds
    .filter((round) => round.resolved)
    .forEach((round) =>
      round.matchups.forEach((m) => {
        if (!m.winnerId) return;
        if (m.playerBId === null) {
          if (isOpenSide(sideOf(m))) of(m.winnerId).wins += 1;
          return;
        }
        of(m.winnerId).wins += 1;
        of(m.winnerId === m.playerAId ? m.playerBId : m.playerAId).losses += 1;
      }),
    );

  return records;
};

/**
 * A round robin's standings: highest total first. Ties go to more matchups
 * won, then to more points answered (the redemption score, which leaves the
 * win bonus out), then to the draw — never to a coin flip.
 *
 * Players still on the bench never played, so they rank below everybody who
 * did, whatever the numbers say.
 */
export const roundRobinStandings = <T extends StandingLike>(
  players: T[],
  rounds: BracketRound[],
): T[] => {
  const records = matchRecords(rounds);
  const winsOf = (id: string) => records.get(id)?.wins ?? 0;
  const drawOrder = rounds[0] ? activePlayerIds(rounds[0]) : players.map((p) => p.id);
  const seed = new Map(drawOrder.map((id, index) => [id, index]));
  const seedOf = (id: string) => seed.get(id) ?? Number.MAX_SAFE_INTEGER;

  return [...players].sort(
    (a, b) =>
      Number(Boolean(a.benched)) - Number(Boolean(b.benched)) ||
      b.score - a.score ||
      winsOf(b.id) - winsOf(a.id) ||
      (b.redemptionScore ?? 0) - (a.redemptionScore ?? 0) ||
      seedOf(a.id) - seedOf(b.id),
  );
};

/** A side that would hand out a genuine bye: odd, and more than a lone player. */
const owesBye = (ids: string[]): boolean => ids.length >= 3 && ids.length % 2 === 1;

/**
 * Decide a round and draw the next one.
 *
 * Without a loser's bracket this is exactly the single-elimination game it
 * always was: the winners are paired in bracket order and everybody else is
 * out. With one, a first loss drops a player into the loser's bracket, a loss
 * there knocks them out, and the last player on each side meet in a grand
 * final. The final is one match — there is no reset if the loser's-bracket
 * player wins it, because every round is a spin of the wheel and the wheel
 * runs out.
 *
 * While one side still has a field and the other is down to a single player,
 * that player takes a bye each round: they keep answering and banking points,
 * they simply have nobody to be drawn against until the other side catches up.
 */
export const settleRound = (
  round: BracketRound,
  players: Player[],
  options: {
    losersBracket: boolean;
    /** Every round before this one, for handing out byes fairly. */
    playedRounds: BracketRound[];
    /** False when this was the last round the game has questions for. */
    hasMoreRounds: boolean;
    /**
     * Fill byes with a wildcard from the Redemption Table. Off, a bye is a bye,
     * exactly as it always was.
     *
     * Without a loser's bracket the wildcard comes back into the bracket
     * proper. With one it comes back into the loser's bracket only: the
     * winners' side is everybody nobody has beaten, and somebody who has been
     * knocked out does not belong in it. Either way the size of the field the
     * next round leaves is the same as with a bye — (n + 1) / 2 — so the
     * number of rounds the lobby promises does not move.
     */
    wildcards?: boolean;
    /** Who may be drawn as a wildcard — a host who is not answering may not. */
    canWildcard?: (player: Player) => boolean;
    /**
     * Rounds before the bracket. While `round` is one of them nobody goes
     * out; after the last, the bracket is drawn seeded on the totals.
     */
    qualifyingRounds?: number;
    /**
     * Pair every bracket round by standing — highest total against lowest —
     * rather than in bracket order. Off, the bracket pairs exactly as it
     * always did.
     */
    seeded?: boolean;
    /** Games in the final. One (the default) is the old single-match final. */
    finalBestOf?: number;
  },
): RoundOutcome => {
  const { round: resolved } = resolveRound(round, players);
  const present = new Set(players.map((p) => p.id));
  const bonuses = winBonuses(resolved);
  const bestOf = options.finalBestOf ?? 1;

  // Standings as they are once this round's win bonuses are counted — which
  // is what anything drawn from here on is seeded on.
  const totals = new Map(
    players.map((p) => [p.id, p.score + (bonuses[p.id] ?? 0)]),
  );
  const history = [...options.playedRounds, resolved];
  const drawOrder = history[0]
    ? activePlayerIds(history[0])
    : players.map((p) => p.id);
  const rank = (ids: string[]) =>
    standingOrder(ids, (id) => totals.get(id) ?? 0, drawOrder);
  const roundNumber = round.roundNumber + 1;
  const base = { round: resolved, wildcardIds: [] as string[], bonuses };

  /* --- a round-robin round: nobody goes out, and there is no bracket --- */
  if (isRoundRobinRound(resolved)) {
    const played = new Set(activePlayerIds(resolved));
    const field = [
      ...drawOrder.filter((id) => played.has(id)),
      ...activePlayerIds(resolved).filter((id) => !drawOrder.includes(id)),
    ].filter((id) => present.has(id));

    return {
      ...base,
      winnersIds: field,
      losersIds: [],
      eliminatedIds: [],
      // Nobody is ever left standing alone: the night ends when the rounds
      // run out or the host ends it, and the standings decide it then.
      championId: null,
      nextRound:
        options.hasMoreRounds && field.length >= 2
          ? {
              roundNumber,
              matchups: pair(roundNumber, roundRobinOrder(field, history), "roundRobin"),
              resolved: false,
            }
          : null,
    };
  }

  /* --- a qualifying round: nobody goes out --- */
  const qualifying =
    resolved.matchups.length > 0 &&
    resolved.matchups.every((m) => sideOf(m) === "qualifying");

  if (qualifying) {
    // Everybody who played this round and is still in the room — in draw
    // order, with anyone dealt in after round one after them.
    const played = new Set(activePlayerIds(resolved));
    const field = [
      ...drawOrder.filter((id) => played.has(id)),
      ...activePlayerIds(resolved).filter((id) => !drawOrder.includes(id)),
    ].filter((id) => present.has(id));
    let nextRound: BracketRound | null = null;

    if (options.hasMoreRounds && field.length >= 2) {
      const ranked = rank(field);
      const seeds = seedMap(ranked);

      if (round.roundNumber < (options.qualifyingRounds ?? 0)) {
        nextRound = {
          roundNumber,
          matchups: withSeeds(
            pair(roundNumber, qualifyingOrder(ranked, history), "qualifying"),
            seeds,
          ),
          resolved: false,
        };
      } else if (!options.losersBracket && bestOf > 1 && ranked.length === 2) {
        nextRound = {
          roundNumber,
          matchups: withSeeds(
            [finalGame(roundNumber, ranked[0], ranked[1], { bestOf, game: 1, winsA: 0, winsB: 0 })],
            seeds,
          ),
          resolved: false,
        };
      } else {
        // The bracket, seeded on what qualifying built.
        nextRound = {
          roundNumber,
          matchups: pairSide(roundNumber, seededOrder(ranked), "winners", null, seeds),
          resolved: false,
        };
      }
    }

    return {
      ...base,
      winnersIds: field,
      losersIds: [],
      eliminatedIds: [],
      championId: null,
      nextRound,
    };
  }

  /* --- the bracket --- */
  const winnersIds: string[] = [];
  const survivors: string[] = [];
  const dropped: string[] = [];
  const eliminatedIds: string[] = [];
  let championId: string | null = null;
  let seriesGoesOn: Matchup | null = null;

  for (const matchup of resolved.matchups) {
    const ids = [matchup.playerAId, matchup.playerBId].filter(
      (id): id is string => id !== null && present.has(id),
    );
    const winner = matchup.winnerId;
    const losers = ids.filter((id) => id !== winner);

    switch (sideOf(matchup)) {
      case "qualifying":
      case "winners":
        if (winner) winnersIds.push(winner);
        if (options.losersBracket) dropped.push(...losers);
        else eliminatedIds.push(...losers);
        break;
      case "losers":
        if (winner) survivors.push(winner);
        eliminatedIds.push(...losers);
        break;
      case "final": {
        const score = seriesScore(matchup);
        const need = score ? winsNeeded(score.bestOf) : 1;
        // A finalist who left the room forfeits the series.
        const decided =
          !score ||
          ids.length < 2 ||
          score.winsA >= need ||
          score.winsB >= need;
        if (decided) {
          championId = winner;
          eliminatedIds.push(...losers);
        } else {
          seriesGoesOn = matchup;
        }
        break;
      }
    }
  }

  // A best-of final that nobody has won yet: the same two play the next
  // game, and nothing else in the bracket moves.
  if (seriesGoesOn) {
    const score = seriesScore(seriesGoesOn)!;
    return {
      ...base,
      winnersIds: [],
      losersIds: [],
      eliminatedIds: [],
      championId: null,
      nextRound: options.hasMoreRounds
        ? {
            roundNumber,
            matchups: [
              {
                ...finalGame(
                  roundNumber,
                  seriesGoesOn.playerAId,
                  seriesGoesOn.playerBId as string,
                  {
                    bestOf: score.bestOf,
                    game: score.game + 1,
                    winsA: score.winsA,
                    winsB: score.winsB,
                  },
                ),
                seedA: seriesGoesOn.seedA,
                seedB: seriesGoesOn.seedB,
              },
            ],
            resolved: false,
          }
        : null,
    };
  }

  const losersIds = options.seeded
    ? rank([...survivors, ...dropped])
    : interleave(survivors, dropped);
  const alive = [...winnersIds, ...losersIds];

  // A final settles it, and so does a bracket with one player left in it —
  // which is how a game without a loser's bracket has always ended.
  if (!championId && alive.length <= 1) championId = alive[0] ?? null;

  let nextRound: BracketRound | null = null;
  const wildcardIds: string[] = [];

  // Everybody out of the bracket once this round is settled.
  const outIds = new Set([
    ...players.filter((player) => player.eliminated).map((player) => player.id),
    ...eliminatedIds,
  ]);
  const wildcardFor = (ids: string[]): string | null => {
    if (!options.wildcards || !owesBye(ids)) return null;
    const id = drawWildcard(
      players,
      outIds,
      drawOrder,
      options.canWildcard ?? (() => true),
    );
    if (id) wildcardIds.push(id);
    return id;
  };

  // Seeded: by standing, top seed owed the bye. Otherwise bracket order, bye
  // to whoever has had the fewest.
  const sideOrder = (ids: string[]) =>
    options.seeded ? seededOrder(rank(ids)) : withByeLast(ids, history);
  const sideSeeds = (ids: string[]) =>
    options.seeded ? seedMap(rank(ids)) : undefined;
  const finalOf = (a: string, b: string): BracketRound => {
    const [first, second] = options.seeded ? rank([a, b]) : [a, b];
    const matchup =
      bestOf > 1
        ? finalGame(roundNumber, first, second, { bestOf, game: 1, winsA: 0, winsB: 0 })
        : pair(roundNumber, [first, second], "final")[0];
    return {
      roundNumber,
      matchups: options.seeded ? withSeeds([matchup], seedMap(rank([a, b]))) : [matchup],
      resolved: false,
    };
  };

  if (!championId && options.hasMoreRounds) {
    if (!options.losersBracket) {
      nextRound =
        bestOf > 1 && winnersIds.length === 2
          ? finalOf(winnersIds[0], winnersIds[1])
          : {
              roundNumber,
              matchups: pairSide(
                roundNumber,
                sideOrder(winnersIds),
                "winners",
                wildcardFor(winnersIds),
                sideSeeds(winnersIds),
              ),
              resolved: false,
            };
    } else if (winnersIds.length === 1 && losersIds.length === 1) {
      nextRound = finalOf(winnersIds[0], losersIds[0]);
      if (!options.seeded && bestOf <= 1) {
        // The old final keeps its old shape: winners' player first.
        nextRound.matchups = pair(roundNumber, [winnersIds[0], losersIds[0]], "final");
      }
    } else {
      nextRound = {
        roundNumber,
        matchups: [
          ...pairSide(
            roundNumber,
            sideOrder(winnersIds),
            "winners",
            null,
            sideSeeds(winnersIds),
          ),
          ...pairSide(
            roundNumber,
            sideOrder(losersIds),
            "losers",
            wildcardFor(losersIds),
            sideSeeds(losersIds),
          ),
        ],
        resolved: false,
      };
    }
  }

  return {
    ...base,
    winnersIds,
    losersIds,
    eliminatedIds,
    championId,
    wildcardIds,
    nextRound,
  };
};

/**
 * How many rounds a bracket of this size needs, at most, to be decided.
 *
 * Single elimination halves the field every round. Double elimination runs
 * both sides at once: the winners' side halves, the loser's side halves and
 * takes in everyone the winners' side just dropped, and the two champions
 * need one more round to meet. Eight players is three rounds without a
 * loser's bracket and six with one — worth knowing before loading three.
 */
export const roundsToDecide = (
  playerCount: number,
  losersBracket: boolean,
  /** Rounds before the bracket, where nobody goes out. */
  qualifyingRounds = 0,
  /** Games in the final; a series can take all of them. */
  finalBestOf = 1,
): number => {
  if (playerCount < 2) return 0;
  return (
    qualifyingRounds +
    bracketRounds(playerCount, losersBracket) +
    Math.max(0, finalBestOf - 1)
  );
};

/** Rounds of the bracket itself, counting the final as one. */
const bracketRounds = (playerCount: number, losersBracket: boolean): number => {

  let winners = playerCount;
  let losers = 0;
  let rounds = 0;

  while (winners + losers > 1) {
    rounds += 1;
    if (losersBracket && winners === 1 && losers === 1) break; // the final
    const beaten = Math.floor(winners / 2);
    winners = Math.ceil(winners / 2);
    losers = losersBracket ? Math.ceil(losers / 2) + beaten : 0;
  }

  return rounds;
};

/**
 * Just enough of a player to rank them — a host-side `Player` and a published
 * `PublicPlayer` both fit, so every screen ranks the night the same way.
 */
export interface StandingLike {
  id: string;
  score: number;
  eliminated?: boolean;
  losersBracket?: boolean;
  redemptionScore?: number;
  /** On the bench: never in the field, so never standing. */
  benched?: boolean;
}

/** Still in the bracket: not knocked out, and not waiting on the bench. */
export const isStanding = (player: StandingLike): boolean =>
  !player.eliminated && !player.benched;

/**
 * Order the players still standing, for a night whose rounds ran out before
 * the bracket decided it.
 *
 * Somebody nobody has beaten outranks somebody who has already lost once,
 * whatever their totals — the bracket is the competition and the score is the
 * tiebreak. Then the score, then the draw.
 */
export const rankStanding = <T extends StandingLike>(
  players: T[],
  drawOrder: string[],
): T[] => {
  const seed = new Map(drawOrder.map((id, index) => [id, index]));
  const seedOf = (id: string) => seed.get(id) ?? Number.MAX_SAFE_INTEGER;

  return [...players].sort(
    (a, b) =>
      Number(Boolean(a.losersBracket)) - Number(Boolean(b.losersBracket)) ||
      b.score - a.score ||
      seedOf(a.id) - seedOf(b.id),
  );
};

/**
 * Who takes the night when it ends without the bracket having decided it —
 * the rounds ran out, or the host ended the game early.
 *
 * `rounds` is what was actually played: an unplayed draw sitting on the
 * screen decides nothing. `roundRobin` is the game's own format, for a game
 * ended before a round was played — with no rounds left to read it from.
 *
 * - **A round robin** goes to the top of its standings.
 * - **A bracket** goes to the leader among the players still standing:
 *   somebody nobody has beaten ahead of somebody in the loser's bracket, then
 *   on score, then the draw. A final series cut short goes to whoever is
 *   ahead in it.
 */
export const championAtEnd = <T extends StandingLike>(
  players: T[],
  rounds: BracketRound[],
  roundRobin: boolean = isRoundRobinGame(rounds),
): string | null => {
  if (roundRobin) {
    return roundRobinStandings(players, rounds)[0]?.id ?? null;
  }

  const standing = players.filter(isStanding);
  const pool = standing.length > 0 ? standing : players;

  const lastFinal = rounds[rounds.length - 1]?.matchups.find((m) => m.series);
  const series = lastFinal ? seriesScore(lastFinal) : null;
  const seriesLeader =
    lastFinal && series && series.winsA !== series.winsB
      ? series.winsA > series.winsB
        ? lastFinal.playerAId
        : lastFinal.playerBId
      : null;
  if (seriesLeader && pool.some((p) => p.id === seriesLeader)) return seriesLeader;

  const drawOrder = rounds[0] ? activePlayerIds(rounds[0]) : players.map((p) => p.id);
  return rankStanding(pool, drawOrder)[0]?.id ?? null;
};

/** Who takes each prize the app tracks. Null where nobody qualifies. */
export interface Podium {
  championId: string | null;
  runnerUpId: string | null;
  /**
   * Third place: most redemption points, among everybody who is not
   * champion or runner-up.
   */
  redemptionId: string | null;
}

/**
 * The night's prize places — 1st, 2nd and 3rd — worked out the same way on
 * every screen. With three or more players all three are always filled, so a
 * host who ends the night early still has three names to read out.
 *
 * A round robin is the top three of its standings, in order. `roundRobin`
 * says so for a game ended before any round was played, which has no rounds
 * to read its format from.
 *
 * In a bracket game:
 *
 * - **Runner-up**: when the bracket decided the night, whoever the champion
 *   beat last — the grand final's loser, or the last matchup of a single
 *   elimination bracket. When the rounds ran out first, the next player in
 *   the same order the champion was picked in.
 * - **Redemption** (third place): the most redemption points — every point
 *   answered in every round of the game, wherever it was played, before the
 *   win bonus. Everybody plays every round, so it compares the whole room
 *   like for like. The champion and runner-up are not eligible — they have
 *   already been paid — so it goes to the best of everybody else. If nobody
 *   else has answered a point, it goes to the next player in the standings,
 *   so third place is never left empty.
 */
export const podium = <T extends StandingLike>(
  players: T[],
  rounds: BracketRound[],
  championId: string | null,
  roundRobin: boolean = isRoundRobinGame(rounds),
): Podium => {
  if (roundRobin) {
    const ranked = roundRobinStandings(players, rounds);
    // The champion the game already called stays champion, even if a screen
    // is a beat behind on the scores.
    const order = championId
      ? [
          ...ranked.filter((p) => p.id === championId),
          ...ranked.filter((p) => p.id !== championId),
        ]
      : ranked;
    return {
      championId: order[0]?.id ?? null,
      runnerUpId: order[1]?.id ?? null,
      redemptionId: order[2]?.id ?? null,
    };
  }

  const present = new Set(players.map((p) => p.id));
  const drawOrder = rounds[0]
    ? activePlayerIds(rounds[0])
    : players.map((p) => p.id);
  const seed = new Map(drawOrder.map((id, index) => [id, index]));
  const seedOf = (id: string) => seed.get(id) ?? Number.MAX_SAFE_INTEGER;

  let runnerUpId: string | null = null;
  if (championId) {
    const others = players.filter((p) => p.id !== championId);
    const standing = others.filter(isStanding);

    if (standing.length > 0) {
      runnerUpId = rankStanding(standing, drawOrder)[0]?.id ?? null;
    } else {
      for (let i = rounds.length - 1; i >= 0 && !runnerUpId; i--) {
        const beaten = rounds[i].matchups.find(
          (m) => m.winnerId === championId && m.playerBId !== null,
        );
        if (!beaten) continue;
        const loser =
          beaten.playerAId === championId ? beaten.playerBId : beaten.playerAId;
        if (loser && present.has(loser)) runnerUpId = loser;
      }
    }

    // Whoever the champion beat has left the room: the best total left in it.
    if (!runnerUpId && others.length > 0) {
      runnerUpId = [...others].sort(
        (a, b) => b.score - a.score || seedOf(a.id) - seedOf(b.id),
      )[0].id;
    }
  }

  const redemption = players
    .filter(
      (p) =>
        p.id !== championId &&
        p.id !== runnerUpId &&
        (p.redemptionScore ?? 0) > 0,
    )
    .sort(
      (a, b) =>
        (b.redemptionScore ?? 0) - (a.redemptionScore ?? 0) ||
        b.score - a.score ||
        seedOf(a.id) - seedOf(b.id),
    );

  // Nobody else has answered a point: third place still goes to somebody —
  // the best of the rest, in the order the champion was picked in.
  const third =
    redemption[0] ??
    rankStanding(
      players.filter((p) => p.id !== championId && p.id !== runnerUpId && !p.benched),
      drawOrder,
    )[0];

  return {
    championId,
    runnerUpId,
    redemptionId: championId && runnerUpId ? (third?.id ?? null) : null,
  };
};
