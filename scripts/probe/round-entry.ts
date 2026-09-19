/**
 * The round engine, driven the way a room drives it.
 *
 * This imports the app's own services rather than a copy of them, so what it
 * proves is what ships: two players in one matchup answering at completely
 * different speeds, neither ever waiting on the other, and a projector that
 * still refuses to show an answer while anybody could still be looking at the
 * question.
 *
 * Run it with `node scripts/check-round-pacing.mjs`.
 */
import "./dom-stub";
import {
  GamePhase,
  GameMode,
  GameState,
  LaneStatus,
  Player,
  Question,
  QuestionType,
} from "../../src/types";
import { REVEAL_DURATION, TIMER_DURATION } from "../../src/constants";
import {
  advancePlayerNow,
  buildRoundLanes,
  closeLaneQuestion,
  laneStatus,
  recordLaneAnswer,
  roundIsComplete,
  seatForPlayer,
  tickRound,
} from "../../src/services/lanes";
import { buildSnapshot } from "../../src/services/snapshot";
import { buildNextRound, byeCounts, resolveRound } from "../../src/services/bracket";
import {
  applyCategoryLike,
  applyCategoryVote,
  buildCategoryPoll,
} from "../../src/services/preferences";
import { readCategoryPool } from "../../src/services/categoryPool";
import {
  readCategoryInsights,
  recordBallot,
  recordCategoryLike,
  recordCategoryVote,
} from "../../src/services/insights";

let failures = 0;

const check = (label: string, passed: boolean, detail = ""): void => {
  console.log(`${passed ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
};

const player = (id: string, name: string): Player => ({
  id,
  name,
  avatar: "🐼",
  score: 0,
  roundScore: 0,
  isBot: false,
  streak: 0,
});

const question = (n: number): Question => ({
  id: `q${n}`,
  category: "Science",
  text: `Question ${n}?`,
  options: ["right", "wrong", "also wrong", "no"],
  correctIndex: 0,
  type: QuestionType.MULTIPLE_CHOICE,
});

const players = [
  player("p1", "Ada"),
  player("p2", "Bo"),
  player("p3", "Cy"),
  player("p4", "Di"),
];

const questions = [question(1), question(2), question(3)];

const baseState = (): GameState => {
  const state: GameState = {
    phase: GamePhase.PLAYING,
    mode: GameMode.STANDARD,
    players,
    currentPlayerId: "p1",
    isHost: true,
    gamePin: "1234",
    gameName: "Probe Night",
    clientPin: null,
    clientPlayerId: null,
    joining: false,
    joinError: null,
    totalRounds: 3,
    questionsPerRound: questions.length,
    roundsConfig: [
      {
        roundNumber: 1,
        category: {
          id: "science",
          name: "Science",
          icon: "🧬",
          color: "bg-green-500",
        },
        questions,
      },
    ],
    currentRound: 1,
    questionsQueue: questions,
    usedCategories: [],
    selectedCategory: "science",
    // A fixed draw rather than the shuffled one, so the two players this probe
    // reasons about are actually in the same matchup every run.
    bracket: [
      {
        roundNumber: 1,
        matchups: [
          {
            id: "r1-m1",
            roundNumber: 1,
            playerAId: "p1",
            playerBId: "p2",
            winnerId: null,
            scoreA: null,
            scoreB: null,
            tiebreak: null,
          },
          {
            id: "r1-m2",
            roundNumber: 1,
            playerAId: "p3",
            playerBId: "p4",
            winnerId: null,
            scoreA: null,
            scoreB: null,
            tiebreak: null,
          },
        ],
        resolved: false,
      },
    ],
    championId: null,
    lanes: [],
    broadcastQuestionIndex: 0,
    broadcastRevealing: false,
    broadcastRevealSecondsLeft: REVEAL_DURATION,
    autoAdvance: true,
    hostAnsweringEnabled: true,
    wheelSpinning: false,
    categoryRevealed: true,
    categoryLikes: [],
    categoryPoll: null,
    loading: false,
    error: null,
    contentWarning: null,
    initialPin: null,
    roomWarning: null,
  };

  return { ...state, lanes: buildRoundLanes(state) };
};

const seat = (state: GameState, playerId: string) =>
  seatForPlayer(state.lanes, playerId);

/* ------------------------------------------------------------------ *
 * 1. One player answering does not move, or hold up, anybody else
 * ------------------------------------------------------------------ */

let state = baseState();

check(
  "a round deals one seat per player",
  state.lanes.length === 2 &&
    state.lanes.every((lane) => lane.seats.length === 2),
  `${state.lanes.length} matches, ${state.lanes.flatMap((l) => l.seats).length} seats`,
);

// Ada answers question one immediately; Bo, at the same table, does nothing.
state = recordLaneAnswer(state, "p1", 0);

check(
  "answering closes that player's own question at once",
  seat(state, "p1")?.status === LaneStatus.REVEAL,
  `Ada is ${seat(state, "p1")?.status}`,
);
check(
  "the opponent at the same table is untouched",
  seat(state, "p2")?.status === LaneStatus.ANSWERING &&
    seat(state, "p2")?.questionIndex === 0 &&
    seat(state, "p2")?.timeLeft === TIMER_DURATION,
  `Bo is ${seat(state, "p2")?.status} on Q${(seat(state, "p2")?.questionIndex ?? 0) + 1} with ${seat(state, "p2")?.timeLeft}s`,
);
check(
  "points land as soon as the question closes",
  state.players.find((p) => p.id === "p1")?.roundScore ===
    100 + TIMER_DURATION * 10,
  `Ada has ${state.players.find((p) => p.id === "p1")?.roundScore}`,
);

// ...and she takes the next question without waiting out the reveal.
state = advancePlayerNow(state, "p1");

check(
  "a player can take the next question immediately",
  seat(state, "p1")?.status === LaneStatus.ANSWERING &&
    seat(state, "p1")?.questionIndex === 1,
  `Ada is on Q${(seat(state, "p1")?.questionIndex ?? 0) + 1}`,
);
check(
  "her opponent is still on question one",
  seat(state, "p2")?.questionIndex === 0,
);

/* ------------------------------------------------------------------ *
 * 2. The fast player runs away with it, and the projector does not follow
 * ------------------------------------------------------------------ */

state = advancePlayerNow(recordLaneAnswer(state, "p1", 0), "p1");
state = recordLaneAnswer(state, "p1", 0);

check(
  "one player can finish the round while the other is on question one",
  seat(state, "p1")?.status === LaneStatus.REVEAL &&
    seat(state, "p1")?.questionIndex === 2 &&
    seat(state, "p2")?.questionIndex === 0,
);
check(
  "the big screen is still holding question one",
  state.broadcastQuestionIndex === 0 && !state.broadcastRevealing,
);

const midRound = buildSnapshot(state, "host-probe");
check(
  "the snapshot never sends an answer to a player who has not closed it",
  midRound.lanes
    .flatMap((lane) => lane.seats)
    .filter((published) => published.status !== LaneStatus.REVEAL)
    .every((published) => published.reveal === null),
);
check(
  "the room's own reveal is withheld while anyone is still on the question",
  midRound.reveal === null,
);
check(
  "the faster player's seat carries a later question than the slower one's",
  (midRound.lanes[0].seats.find((s) => s.playerId === "p1")?.questionNumber ?? 0) >
    (midRound.lanes[0].seats.find((s) => s.playerId === "p2")?.questionNumber ?? 0),
);

/* ------------------------------------------------------------------ *
 * 3. Answering sooner is worth more
 * ------------------------------------------------------------------ */

let scoring = baseState();
scoring = tickRound(tickRound(tickRound(scoring))); // three seconds pass
scoring = recordLaneAnswer(scoring, "p3", 0); // Cy answers on 12s
scoring = tickRound(tickRound(tickRound(tickRound(tickRound(scoring)))));
scoring = recordLaneAnswer(scoring, "p4", 0); // Di answers later

const cy = scoring.players.find((p) => p.id === "p3")?.roundScore ?? 0;
const di = scoring.players.find((p) => p.id === "p4")?.roundScore ?? 0;
check("a quicker correct answer scores more", cy > di, `${cy} vs ${di}`);

/* ------------------------------------------------------------------ *
 * 4. A timed-out clock still closes one seat, and only that seat
 * ------------------------------------------------------------------ */

let timeout = baseState();
timeout = recordLaneAnswer(timeout, "p1", 0);
for (let i = 0; i < TIMER_DURATION; i++) timeout = tickRound(timeout);

check(
  "a clock running out closes that seat on its own",
  seat(timeout, "p2")?.status !== LaneStatus.ANSWERING,
  `Bo is ${seat(timeout, "p2")?.status}`,
);
check(
  "a missed question scores nothing",
  timeout.players.find((p) => p.id === "p2")?.roundScore === 0,
);

/* ------------------------------------------------------------------ *
 * 5. The round ends only once the room has seen the last answer
 * ------------------------------------------------------------------ */

let toEnd = baseState();
for (const id of ["p1", "p2", "p3", "p4"]) {
  for (let q = 0; q < questions.length; q++) {
    toEnd = recordLaneAnswer(toEnd, id, 0);
    toEnd = advancePlayerNow(toEnd, id);
  }
}

check(
  "every seat is done once everyone has answered everything",
  toEnd.lanes.every((lane) => laneStatus(lane) === LaneStatus.DONE),
);
check(
  "the round is not over while the projector is still catching up",
  !roundIsComplete(toEnd),
);

let guard = 0;
while (!roundIsComplete(toEnd) && guard < 200) {
  toEnd = tickRound(toEnd);
  guard += 1;
}
check("the round ends once the big screen has caught up", roundIsComplete(toEnd));

/* ------------------------------------------------------------------ *
 * 6. Host controls reach every seat at a table, and no others
 * ------------------------------------------------------------------ */

let desk = baseState();
desk = closeLaneQuestion(desk, "r1-m1", "host");

check(
  "revealing a table closes both of its seats",
  seat(desk, "p1")?.status === LaneStatus.REVEAL &&
    seat(desk, "p2")?.status === LaneStatus.REVEAL,
);
check(
  "the table beside it carries on",
  seat(desk, "p3")?.status === LaneStatus.ANSWERING &&
    seat(desk, "p4")?.status === LaneStatus.ANSWERING,
);

/* ------------------------------------------------------------------ *
 * 6b. The bracket: byes are spread, and nothing after round one is random
 *
 * The five-player game this is modelled on handed the same player a bye in
 * round one and again in round two, so they reached the final unopposed. The
 * cause was positional: a bye winner is always last in the advancing list, and
 * the last player is exactly who `pair` hands the next bye to.
 * ------------------------------------------------------------------ */

const roundOf = (roundNumber: number, ids: string[], byePlayer?: string) => ({
  roundNumber,
  matchups: ids.reduce<
    { id: string; roundNumber: number; playerAId: string; playerBId: string | null;
      winnerId: string | null; scoreA: number | null; scoreB: number | null;
      tiebreak: string | null }[]
  >((matchups, id, index) => {
    if (id === byePlayer) {
      matchups.push({
        id: `r${roundNumber}-m${matchups.length + 1}`,
        roundNumber,
        playerAId: id,
        playerBId: null,
        winnerId: id,
        scoreA: 0,
        scoreB: null,
        tiebreak: "Bye",
      });
      return matchups;
    }
    const last = matchups[matchups.length - 1];
    if (last && last.playerBId === null && last.tiebreak !== "Bye") {
      last.playerBId = id;
      return matchups;
    }
    matchups.push({
      id: `r${roundNumber}-m${matchups.length + 1}`,
      roundNumber,
      playerAId: id,
      playerBId: null,
      winnerId: null,
      scoreA: null,
      scoreB: null,
      tiebreak: null,
    });
    return matchups;
  }, []),
  resolved: true,
});

// Round one of the reported game: five players, and "e" draws the bye.
const firstRound = roundOf(1, ["a", "b", "c", "d", "e"], "e");
firstRound.matchups[0].winnerId = "a";
firstRound.matchups[1].winnerId = "c";

const secondRound = buildNextRound(2, ["a", "c", "e"], [firstRound]);
const secondByes = secondRound.matchups.filter((m) => m.playerBId === null);

check(
  "the bye moves to somebody who has not had one",
  secondByes.length === 1 && secondByes[0].playerAId !== "e",
  `round two's bye went to ${secondByes[0]?.playerAId}`,
);
check(
  "the player who sat out round one is now playing",
  secondRound.matchups.some(
    (m) => m.playerBId !== null && (m.playerAId === "e" || m.playerBId === "e"),
  ),
);
check(
  "an even field gets no bye at all",
  buildNextRound(2, ["a", "b", "c", "d"], [firstRound]).matchups.every(
    (m) => m.playerBId !== null,
  ),
);
check(
  "byes are counted off the bracket itself",
  byeCounts([firstRound]).get("e") === 1,
);

// Nothing after round one may be drawn from a hat: the same winners must
// always produce the same pairings.
const drawn = Array.from({ length: 8 }, () =>
  buildNextRound(2, ["a", "c", "e"], [firstRound])
    .matchups.map((m) => `${m.playerAId}v${m.playerBId ?? "bye"}`)
    .join("|"),
);
check(
  "the draw after round one is fixed, not random",
  new Set(drawn).size === 1,
  drawn[0],
);

// And the run the whole complaint came from: five players, three rounds,
// nobody should collect two byes while somebody else has none.
let history = [firstRound];
let standing = ["a", "c", "e"];
for (let roundNumber = 2; standing.length > 1; roundNumber++) {
  const next = buildNextRound(roundNumber, standing, history);
  const settled = resolveRound(
    next,
    standing.map((id) => ({
      id,
      name: id,
      avatar: "🐼",
      // A stable, made-up finish: the earlier a player advanced, the better
      // they do, so the run is deterministic rather than coin-flipped.
      score: 100 - standing.indexOf(id),
      roundScore: 100 - standing.indexOf(id),
      isBot: false,
      streak: 0,
    })),
  );
  history = [...history, settled.round];
  standing = settled.advancingIds;
}

const spread = byeCounts(history);
const most = Math.max(...[...spread.values()], 0);
const withNone = ["a", "b", "c", "d", "e"].filter((id) => !spread.has(id));
check(
  "no player takes a second bye while another has had none",
  most <= 1 || withNone.length === 0,
  `most byes ${most}, players with none: ${withNone.join(", ") || "nobody"}`,
);

/* ------------------------------------------------------------------ *
 * 7. Likes and votes: idempotent, and the same ballot for everyone
 * ------------------------------------------------------------------ */

let prefs = baseState();
prefs = applyCategoryLike(prefs, "p1", "science", true);
prefs = applyCategoryLike(prefs, "p1", "science", true); // a retried message
prefs = applyCategoryLike(prefs, "p2", "science", true);

check(
  "a like counts once per player however often it arrives",
  prefs.categoryLikes.find((row) => row.category.id === "science")?.playerIds
    .length === 2,
);

prefs = applyCategoryLike(prefs, "p1", "science", false);
check(
  "taking a like back removes exactly one",
  prefs.categoryLikes.find((row) => row.category.id === "science")?.playerIds
    .length === 1,
);

const poll = buildCategoryPoll(prefs, 1);
check("a ballot is drawn from the pool", Boolean(poll) && poll!.options.length > 0);
check(
  "the ballot leaves out a category this game has already played",
  !poll!.options.some((option) => option.id === "science") ||
    readCategoryPool().length <= poll!.options.length,
);

prefs = { ...prefs, categoryPoll: poll };
prefs = applyCategoryVote(prefs, "p1", poll!.id, poll!.options[0].id);
prefs = applyCategoryVote(prefs, "p2", poll!.id, poll!.options[0].id);
check(
  "votes land on the published options",
  Object.keys(prefs.categoryPoll!.votes).length === 2,
);

prefs = applyCategoryVote(prefs, "p1", "some-older-poll", poll!.options[1].id);
check(
  "a vote for a ballot that has closed is ignored",
  prefs.categoryPoll!.votes["p1"] === poll!.options[0].id,
);

const published = buildSnapshot(prefs, "host-probe");
check(
  "every screen is sent the same ballot",
  published.categoryPoll?.id === poll!.id &&
    published.categoryPoll?.options.length === poll!.options.length,
);
check(
  "the published tally counts the votes cast",
  published.categoryPoll?.tallies[poll!.options[0].id] === 2,
);

/* ------------------------------------------------------------------ *
 * 8. The durable record adds up
 * ------------------------------------------------------------------ */

const science = prefs.roundsConfig[0].category;
recordCategoryLike(science, true);
recordCategoryLike(science, true);
recordCategoryLike(science, false);
recordBallot(poll!.options);
recordCategoryVote(poll!.options[0], 1);

const stored = readCategoryInsights();
const scienceRow = stored.find((row) => row.categoryId === "science");
const votedRow = stored.find((row) => row.categoryId === poll!.options[0].id);

check("likes are banked across games", scienceRow?.likes === 1, `${scienceRow?.likes}`);
check("ballot appearances are banked", (votedRow?.ballots ?? 0) >= 1);
check("votes are banked", (votedRow?.votes ?? 0) === 1);

console.log(
  failures === 0
    ? "\nAll round-pacing checks passed."
    : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
