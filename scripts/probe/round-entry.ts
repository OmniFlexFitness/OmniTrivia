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
  stopRoundInPlace,
  tickRound,
} from "../../src/services/lanes";
import { buildSnapshot } from "../../src/services/snapshot";
import { parseImportDataWithReport } from "../../src/services/importService";
import {
  playableRounds,
  unplayableReason,
} from "../../src/services/questionQuality";
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
  "no seat is told how any answer went while its match is still being played",
  midRound.lanes
    .flatMap((lane) => lane.seats)
    .every((published) => published.results === null && published.roundPoints === null),
);
check(
  "a live score is not published mid-match either — it would be a verdict",
  state.players.find((p) => p.id === "p1")!.roundScore > 0 &&
    midRound.players.find((p) => p.id === "p1")?.roundScore === 0 &&
    midRound.players.find((p) => p.id === "p1")?.score === 0,
  `host has ${state.players.find((p) => p.id === "p1")?.roundScore}, room sees ${midRound.players.find((p) => p.id === "p1")?.roundScore}`,
);
check(
  "the room is not handed an answer key mid-round",
  midRound.roundReview === null && !midRound.roomLockedIn,
);
check(
  "nothing in the published round carries an answer",
  !JSON.stringify(midRound).includes('"correctIndex"') &&
    !JSON.stringify(midRound).includes('"reveal"'),
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
 * 5a. The verdicts arrive at the end of the match, all at once
 * ------------------------------------------------------------------ */

// One table finishes; the other has not started.
let oneDone = baseState();
for (const id of ["p1", "p2"]) {
  for (let q = 0; q < questions.length; q++) {
    oneDone = recordLaneAnswer(oneDone, id, q === 1 ? 1 : 0); // Q2 wrong
    oneDone = advancePlayerNow(oneDone, id);
  }
}
const oneDoneSnapshot = buildSnapshot(oneDone, "host-probe");
const finishedSeat = oneDoneSnapshot.lanes
  .find((lane) => lane.id === "r1-m1")
  ?.seats.find((published) => published.playerId === "p1");
const liveSeat = oneDoneSnapshot.lanes
  .find((lane) => lane.id === "r1-m2")
  ?.seats.find((published) => published.playerId === "p3");

check(
  "a finished match publishes every verdict in it",
  finishedSeat?.results?.length === questions.length &&
    finishedSeat.results.map((r) => r.correct).join(",") === "true,false,true",
  finishedSeat?.results?.map((r) => (r.correct ? "✓" : "✕")).join(" ") ?? "nothing",
);
check(
  "and its points",
  (finishedSeat?.roundPoints ?? 0) > 0 &&
    finishedSeat?.roundPoints ===
      oneDoneSnapshot.players.find((p) => p.id === "p1")?.roundScore,
);
check(
  "while the match beside it, still playing, is told nothing",
  liveSeat?.results === null,
);
check(
  "and the answer key still waits for the whole round",
  oneDoneSnapshot.roundReview === null,
);

const endSnapshot = buildSnapshot(
  { ...toEnd, phase: GamePhase.ROUND_END },
  "host-probe",
);
check(
  "the answer key goes up once the round is over",
  endSnapshot.roundReview?.length === questions.length &&
    endSnapshot.roundReview.every(
      (item) => item.reveal.label === "right" && item.correctCount === 4,
    ),
);

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
 * 6a. Ending the round where it stands
 *
 * The host can stop a round with matches still running — a table that has gone
 * quiet, a player who has walked off, a room that has to move on. What that
 * must not do is invent a result. A round is scored continuously, so the
 * scoreboard at the moment it is stopped already is the result; the questions
 * nobody reached are simply not played, and an unanswered one is not a miss.
 * ------------------------------------------------------------------ */

let cut = baseState();
// One table plays a question through; the other has not answered anything.
cut = recordLaneAnswer(cut, "p1", 0);
cut = recordLaneAnswer(cut, "p2", 1);

const scoresBeforeCut = cut.players.map((player) => player.roundScore);
const streakBeforeCut = cut.players.find((p) => p.id === "p1")?.streak ?? 0;

cut = stopRoundInPlace(cut);

check(
  "ending the round early leaves every seat done",
  cut.lanes.every((lane) => laneStatus(lane) === LaneStatus.DONE),
);
check(
  "the projector is not left holding a question open",
  !cut.broadcastRevealing && cut.broadcastRevealSecondsLeft === 0,
);
check(
  "stopping a round changes nobody's score",
  cut.players.every(
    (player, index) => player.roundScore === scoresBeforeCut[index],
  ),
  cut.players.map((p) => `${p.id}:${p.roundScore}`).join(" "),
);
check(
  "a question nobody was given time to answer is not counted as a miss",
  // p3 and p4 never answered anything and are still on nothing; p1 answered
  // correctly and keeps the streak that earned.
  cut.players.find((p) => p.id === "p3")?.roundScore === 0 &&
    cut.players.find((p) => p.id === "p3")?.lastAnswerCorrect === undefined &&
    (cut.players.find((p) => p.id === "p1")?.streak ?? 0) === streakBeforeCut,
);
check(
  "a seat stopped part-way still reads as through the round",
  cut.lanes
    .flatMap((lane) => lane.seats)
    .every((seatAt) => seatAt.questionIndex === questions.length),
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

/* ------------------------------------------------------------------ *
 * 9. Placeholders and option-less questions never reach a room
 * ------------------------------------------------------------------ */

const mc = (text: string, options: string[], correctIndex = 0): Question => ({
  id: text,
  category: "Probe",
  text,
  options,
  correctIndex,
  type: QuestionType.MULTIPLE_CHOICE,
});

check(
  "the bank's 'Placeholder 1/2/3' wrong answers are eliminated",
  unplayableReason(
    mc("What is the boundary around a black hole?", [
      "Event horizon",
      "Placeholder 1",
      "Placeholder 2",
      "Placeholder 3",
    ]),
  ) === "placeholder options",
);
check(
  "generation's own fallback question is eliminated",
  unplayableReason(
    mc("Placeholder question #1 about Science — question generation failed.", [
      "Option A",
      "Option B",
      "Option C",
      "Option D",
    ]),
  ) !== null,
);
check(
  "a multiple choice with one option, or none, is eliminated",
  unplayableReason(mc("Only one?", ["Yes"])) === "no options" &&
    unplayableReason(mc("None?", [])) === "no options",
);
check(
  "a real question survives, including single-letter and odd answers",
  unplayableReason(
    mc("Which letter appears in no US state name?", ["X", "Z", "Q", "J"], 2),
  ) === null &&
    unplayableReason(mc("Which punctuation mark ends a question?", ["?", "!", ".", ","])) === null,
);
check(
  "a typed answer is judged on its accepted spellings, not on showing options",
  unplayableReason({
    ...mc("What element has the symbol K?", ["Potassium"]),
    type: QuestionType.TYPE_ANSWER,
  }) === null,
);

const imported = parseImportDataWithReport(
  [
    "category,question,option1,option2,option3,option4,correctAnswer,explanation",
    "Science,Real one?,Alpha,Beta,Gamma,Delta,Beta,",
    "Science,Fake one?,Alpha,Placeholder 1,Placeholder 2,Placeholder 3,Alpha,",
    "History,All filler?,Placeholder 1,Placeholder 2,Placeholder 3,Placeholder 4,Placeholder 1,",
  ].join("\n"),
);
check(
  "an import keeps the real rows and reports the eliminated ones",
  Object.values(imported.contents).flatMap((c) => c.questions).length === 1 &&
    imported.skipped.length === 2 &&
    !("history" in imported.contents),
  `${imported.skipped.map((row) => `row ${row.row}: ${row.reason}`).join("; ")}`,
);

const pruned = playableRounds([
  { roundNumber: 1, category: prefs.roundsConfig[0].category, questions: [mc("Fine?", ["a", "b"])] },
  { roundNumber: 2, category: prefs.roundsConfig[0].category, questions: [mc("Filler?", ["Option A", "Option B"])] },
  { roundNumber: 3, category: prefs.roundsConfig[0].category, questions: [mc("Also fine?", ["c", "d"])] },
]);
check(
  "a round left with nothing playable is dropped, and the rest renumbered",
  pruned.length === 2 && pruned.map((round) => round.roundNumber).join(",") === "1,2",
);

console.log(
  failures === 0
    ? "\nAll round-pacing checks passed."
    : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
