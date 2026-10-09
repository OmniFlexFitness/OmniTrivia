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
};

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
  /** Round one is a qualifying round: nobody goes out. */
  qualifying?: boolean;
  losersBracket?: boolean;
  /** Games in the final. One is the old single-match final. */
  finalBestOf?: number;
}

/** The opening options a game's settings call for. */
export const openingOptions = (
  state: Pick<GameState, "qualifyingRounds" | "losersBracket">,
): OpeningOptions => ({
  qualifying: state.qualifyingRounds > 0,
  losersBracket: state.losersBracket,
  finalBestOf: FINAL_BEST_OF,
});

/**
 * Draw round one. The draw is random — there is no ranking to seed from before
 * anyone has answered a question.
 *
 * With qualifying rounds it is a qualifying round, which nobody goes out of.
 * Without them it is the bracket's first round — or, for a room of two with a
 * best-of final, game one of that final.
 */
export const buildFirstRound = (
  players: Player[],
  options: OpeningOptions = {},
): BracketRound => {
  const ids = shuffle(players.map((p) => p.id));
  const bestOf = options.finalBestOf ?? 1;

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
    : players.filter((p) => !p.eliminated).map((p) => p.id);

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
    .filter((player) => player.eliminated && !inBracket.has(player.id))
    .map((player) => player.id);
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
    // qualifying round a bye still earns the win bonus — nobody advances
    // anywhere in qualifying, so a bye that paid nothing would only be a
    // penalty for the numbers being odd.
    if (!b) {
      const bonus =
        sideOf(matchup) === "qualifying" && a ? winBonusFor(a.roundScore) : 0;
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

  /* --- a qualifying round: nobody goes out --- */
  const qualifying =
    resolved.matchups.length > 0 &&
    resolved.matchups.every((m) => sideOf(m) === "qualifying");

  if (qualifying) {
    const field = drawOrder.filter((id) => present.has(id));
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
}

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

/** Who takes each prize the app tracks. Null where nobody qualifies. */
export interface Podium {
  championId: string | null;
  runnerUpId: string | null;
  /**
   * Third place: most redemption points, among players not already on the
   * podium.
   */
  redemptionId: string | null;
}

/**
 * The night's prize places, worked out the same way on every screen.
 *
 * - **Runner-up**: when the bracket decided the night, whoever the champion
 *   beat last — the grand final's loser, or the last matchup of a single
 *   elimination bracket. When the rounds ran out first, the next player in
 *   the same order the champion was picked in.
 * - **Redemption** (third place): the most redemption points — every point
 *   answered in every round of the game, wherever it was played, before the
 *   win bonus. Everybody plays every round, so it compares the whole room
 *   like for like. The champion and runner-up are not eligible — they have
 *   already been paid — so it goes to the best of everybody else.
 */
export const podium = <T extends StandingLike>(
  players: T[],
  rounds: BracketRound[],
  championId: string | null,
): Podium => {
  const present = new Set(players.map((p) => p.id));
  const drawOrder = rounds[0]
    ? activePlayerIds(rounds[0])
    : players.map((p) => p.id);
  const seed = new Map(drawOrder.map((id, index) => [id, index]));
  const seedOf = (id: string) => seed.get(id) ?? Number.MAX_SAFE_INTEGER;

  let runnerUpId: string | null = null;
  if (championId) {
    const others = players.filter((p) => p.id !== championId);
    const standing = others.filter((p) => !p.eliminated);

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

  return {
    championId,
    runnerUpId,
    redemptionId: redemption[0]?.id ?? null,
  };
};
