/**
 * Coming back to a game, driven the way a bad night drives it.
 *
 * Two people can lose a game they are in the middle of, and this proves both
 * of them can get it back:
 *
 *  - the **host**, whose window is the whole game, coming back with the PIN
 *    and the host password — on the machine that lost it or on another one;
 *  - a **player**, whose phone is flat or wiped or belongs to a friend,
 *    coming back with their name and the code they chose.
 *
 * It imports the app's own services rather than a copy of them, so what it
 * proves is what ships. Run it with `node scripts/check-returns.mjs`.
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
import { REVEAL_DURATION } from "../../src/constants";
import { hostProof, playerProof, suggestHostPassword } from "../../src/services/proof";
import {
  applyHostState,
  captureHostState,
  clearHostSession,
  parseHostEnvelope,
  readHostSession,
  saveHostSession,
} from "../../src/services/hostSession";
import { resolveJoinRequest, maySpeakFor } from "../../src/services/seats";
import type { SeatBindings } from "../../src/services/seats";
import { buildRoundLanes, recordLaneAnswer } from "../../src/services/lanes";
import { buildSnapshot } from "../../src/services/snapshot";

let failures = 0;

const check = (label: string, passed: boolean, detail = ""): void => {
  console.log(`${passed ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
};

const section = (title: string): void => console.log(`\n${title}`);

/* ------------------------------------------------------------------ *
 * A game in the middle of a round
 * ------------------------------------------------------------------ */

const PIN = "4242";

const question = (id: string): Question => ({
  id,
  category: "science",
  text: `Question ${id}?`,
  options: ["Right", "Wrong", "Also wrong", "Wrong again"],
  correctIndex: 0,
  type: QuestionType.MULTIPLE_CHOICE,
});

const player = (id: string, name: string, extra: Partial<Player> = {}): Player => ({
  id,
  name,
  avatar: "🐼",
  score: 0,
  roundScore: 0,
  isBot: false,
  streak: 0,
  ...extra,
});

const category = {
  id: "science",
  name: "Science",
  icon: "🧬",
  color: "bg-green-500",
};

const liveGame = (): GameState => {
  const players = [
    player("host-1", "Host", { isHost: true, score: 300 }),
    player("p-dave", "Dave", { score: 1200, streak: 3, rejoinProof: DAVE_PROOF }),
    player("p-mo", "Mo", { score: 900, rejoinProof: MO_PROOF }),
  ];

  const questions = [question("q1"), question("q2"), question("q3")];

  const base: GameState = {
    phase: GamePhase.PLAYING,
    mode: GameMode.STANDARD,
    players,
    currentPlayerId: "host-1",
    isHost: true,
    gamePin: PIN,
    gameName: "Thursday Night Trivia",
    hostPassword: HOST_PASSWORD,
    clientPin: null,
    clientPlayerId: null,
    joining: false,
    joinError: null,
    resuming: false,
    resumeError: null,
    totalRounds: 3,
    questionsPerRound: 3,
    roundsConfig: [{ roundNumber: 1, category, questions }],
    currentRound: 1,
    questionsQueue: questions,
    usedCategories: ["science"],
    selectedCategory: "science",
    bracket: [
      {
        roundNumber: 1,
        matchups: [
          {
            id: "m1",
            roundNumber: 1,
            playerAId: "p-dave",
            playerBId: "p-mo",
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
    categoryLikes: [{ category, playerIds: ["p-dave"] }],
    categoryPoll: null,
    loading: false,
    error: null,
    contentWarning: null,
    initialPin: null,
    roomWarning: null,
  };

  // Deal the round and put one answer in, so what is saved is a round in
  // progress rather than a game that never started.
  const dealt = { ...base, lanes: buildRoundLanes(base) };
  return recordLaneAnswer(dealt, "p-dave", 0);
};

const HOST_PASSWORD = "Thursday!42";
const DAVE_CODE = "1234";
const MO_CODE = "9999";
const DAVE_PROOF = playerProof(PIN, DAVE_CODE);
const MO_PROOF = playerProof(PIN, MO_CODE);

/* ------------------------------------------------------------------ *
 * The proofs
 * ------------------------------------------------------------------ */

section("Proofs");

check(
  "the same password derives the same proof twice",
  hostProof(PIN, HOST_PASSWORD) === hostProof(PIN, HOST_PASSWORD),
);

check(
  "a different password derives a different proof",
  hostProof(PIN, HOST_PASSWORD) !== hostProof(PIN, `${HOST_PASSWORD} `),
);

check(
  "the same password on another PIN is another proof",
  hostProof(PIN, HOST_PASSWORD) !== hostProof("4243", HOST_PASSWORD),
);

check(
  "a host password and a player code never collide",
  hostProof(PIN, DAVE_CODE) !== playerProof(PIN, DAVE_CODE),
);

check(
  "a proof gives nothing away about the secret",
  !hostProof(PIN, HOST_PASSWORD).includes("42") &&
    hostProof(PIN, HOST_PASSWORD).length === 64,
);

check(
  "a suggested password is typeable and unambiguous",
  /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(suggestHostPassword()) &&
    suggestHostPassword() !== suggestHostPassword(),
);

/* ------------------------------------------------------------------ *
 * The host's way back
 * ------------------------------------------------------------------ */

section("The host takes the game back");

const game = liveGame();
const proof = hostProof(PIN, HOST_PASSWORD);
const bindings: [string, string][] = [
  ["p-dave", "uid-dave"],
  ["p-mo", "uid-mo"],
];

clearHostSession();
check("nothing saved means nothing to come back to", readHostSession() === null);

saveHostSession({
  pin: PIN,
  hostId: "host-window-1",
  proof,
  seats: bindings,
  state: captureHostState(game),
});

const saved = readHostSession(PIN);
check("the game is there after the window is gone", saved !== null);
check(
  "a different PIN is a different game",
  readHostSession("1111") === null,
  "a saved game answered to a PIN that is not its own",
);
check(
  "the right password matches what was saved",
  saved?.proof === hostProof(PIN, HOST_PASSWORD),
);
check(
  "a wrong password does not",
  saved?.proof !== hostProof(PIN, "Thursday!43"),
);

// What a host window does with it on the way back in.
const blank: GameState = { ...liveGame(), phase: GamePhase.START, isHost: false };
const resumed = applyHostState(blank, saved!.state, PIN);

check("the round comes back mid-round", resumed.phase === GamePhase.PLAYING);
// Against the live game rather than against a literal: Dave answered on the
// way in, so what has to come back is the score *after* that answer — points,
// time bonus, streak and all.
check(
  "every score comes back as it stood",
  resumed.players.map((p) => p.score).join(",") ===
    game.players.map((p) => p.score).join(","),
  `${resumed.players.map((p) => `${p.name}:${p.score}`).join(" ")} vs ${game.players
    .map((p) => `${p.name}:${p.score}`)
    .join(" ")}`,
);
check(
  "including the points that answer had just earned",
  (resumed.players.find((p) => p.name === "Dave")?.score ?? 0) > 1200,
  "a restored game forgot the answer it had already scored",
);
check(
  "streaks come back",
  resumed.players.find((p) => p.name === "Dave")?.streak ===
    game.players.find((p) => p.name === "Dave")?.streak,
);
check("the bracket comes back", resumed.bracket[0]?.matchups[0]?.playerAId === "p-dave");
check(
  "the answer already given is still given",
  resumed.lanes[0]?.answers.length === 1,
  `${resumed.lanes[0]?.answers.length} answers`,
);
check(
  "the clock comes back where it stopped",
  resumed.lanes[0]?.seats[0]?.timeLeft === game.lanes[0].seats[0].timeLeft,
);
check("likes come back", resumed.categoryLikes[0]?.playerIds.length === 1);
check("this window is the host again", resumed.isHost === true);
check(
  "it is not also a guest",
  resumed.clientPin === null && resumed.clientPlayerId === null,
);
check(
  "a half-finished join does not come back with it",
  resumed.joining === false && resumed.joinError === null && resumed.resuming === false,
);
check(
  "the password is not carried into the restored window",
  !JSON.stringify(saved!.state).includes(HOST_PASSWORD),
  "the saved game contained the password in the clear",
);

section("The room's copy of the game");

const envelope = parseHostEnvelope(
  JSON.stringify({ state: captureHostState(game), seats: bindings }),
);
check("the room's copy parses", envelope !== null);
check(
  "it carries the seat bindings a new device has no other way to know",
  envelope?.seats.length === 2 && envelope.seats[0][1] === "uid-dave",
);
check(
  "it carries the round in progress",
  envelope?.state.phase === GamePhase.PLAYING && envelope.state.currentRound === 1,
);
check("a blob that is not a game is refused", parseHostEnvelope('{"state":{"nope":1}}') === null);
check("junk is refused", parseHostEnvelope("not json at all") === null);
check("nothing is refused", parseHostEnvelope(undefined) === null);

// The answers are in the room's copy, which is exactly why the rules keep it
// away from players — and why the *snapshot*, which players do read, does not
// have them.
check(
  "the room's copy is the whole game, answers included",
  JSON.stringify(envelope?.state).includes('"correctIndex"'),
);
const published = buildSnapshot(game, "host-window-1");

check(
  "the snapshot players read carries no question bank",
  !("roundsConfig" in published) && !("questionsQueue" in published),
);
check(
  "and still holds the room's answer back while anyone is on the question",
  published.reveal === null,
  "the projector was handed the answer with a player still working on it",
);
check(
  "and never carries a player's rejoin proof",
  !JSON.stringify(published).includes(DAVE_PROOF),
  "a player's way back into their own seat was published to every device",
);
check(
  "nor the host password, which is on the state it is built from",
  !JSON.stringify(published).includes(HOST_PASSWORD),
  "the host password reached every phone in the room",
);

/* ------------------------------------------------------------------ *
 * A player's way back
 * ------------------------------------------------------------------ */

section("A player takes their seat back");

const seats: SeatBindings = new Map(bindings);
const open = { players: game.players, seats, lobbyOpen: true };
const closed = { players: game.players, seats, lobbyOpen: false };

// Dave's phone is dead. He borrows one, which has never seen this game: a new
// player id, a new signed-in identity, and nothing else but what he remembers.
const daveOnANewPhone = resolveJoinRequest({
  ...closed,
  request: { playerId: "p-fresh", name: "Dave", rejoinProof: DAVE_PROOF },
  meta: { uid: "uid-borrowed" },
});

check("a player with their code is let back in mid-game", daveOnANewPhone.accepted);
check(
  "into the seat they already had, not a new one",
  daveOnANewPhone.seatId === "p-dave",
  daveOnANewPhone.seatId,
);
check("and the host knows it was a rejoin", daveOnANewPhone.rejoined === true);

check(
  "the name is read the way it was typed",
  resolveJoinRequest({
    ...closed,
    request: { playerId: "p-fresh", name: "  dave ", rejoinProof: DAVE_PROOF },
    meta: { uid: "uid-borrowed" },
  }).seatId === "p-dave",
);

check(
  "a wrong code does not open somebody else's seat",
  !resolveJoinRequest({
    ...closed,
    request: {
      playerId: "p-fresh",
      name: "Dave",
      rejoinProof: playerProof(PIN, "0000"),
    },
    meta: { uid: "uid-thief" },
  }).accepted,
);

check(
  "somebody else's code does not either",
  resolveJoinRequest({
    ...closed,
    request: { playerId: "p-fresh", name: "Dave", rejoinProof: MO_PROOF },
    meta: { uid: "uid-mo" },
  }).accepted === false,
  "Mo's code was accepted for Dave's seat",
);

check(
  "a name with no code cannot take a seat that has one",
  !resolveJoinRequest({
    ...closed,
    request: { playerId: "p-fresh", name: "Dave" },
    meta: { uid: "uid-thief" },
  }).accepted,
);

check(
  "and is told why, in the lobby, rather than getting a second Dave",
  resolveJoinRequest({
    ...open,
    request: { playerId: "p-fresh", name: "Dave" },
    meta: { uid: "uid-stranger" },
  }).reason?.includes("rejoin code") === true,
);

check(
  "a stranger with the right name and no code is still refused",
  !resolveJoinRequest({
    ...open,
    request: { playerId: "p-fresh", name: "DAVE" },
    meta: { uid: "uid-stranger" },
  }).accepted,
);

section("What was already true stays true");

check(
  "a new player joins an open lobby",
  resolveJoinRequest({
    ...open,
    request: { playerId: "p-new", name: "Sam", rejoinProof: playerProof(PIN, "5555") },
    meta: { uid: "uid-sam" },
  }).accepted,
);

check(
  "a new player cannot join once the bracket is drawn",
  !resolveJoinRequest({
    ...closed,
    request: { playerId: "p-new", name: "Sam", rejoinProof: playerProof(PIN, "5555") },
    meta: { uid: "uid-sam" },
  }).accepted,
);

check(
  "a phone that reloaded comes back to its own seat with no code at all",
  resolveJoinRequest({
    ...closed,
    request: { playerId: "p-mo", name: "Mo" },
    meta: { uid: "uid-mo" },
  }).accepted,
);

check(
  "another device cannot take a live seat by naming it",
  !resolveJoinRequest({
    ...closed,
    request: { playerId: "p-mo", name: "Mo" },
    meta: { uid: "uid-intruder" },
  }).accepted,
);

check(
  "the host's own seat cannot be claimed with a code",
  !resolveJoinRequest({
    ...closed,
    request: { playerId: "p-x", name: "Host", rejoinProof: DAVE_PROOF },
    meta: { uid: "uid-thief" },
  }).accepted,
);

section("Answering after a seat changes hands");

// The binding follows the decision: the borrowed phone may now answer for
// Dave, and the phone that died may not.
const afterRejoin: SeatBindings = new Map(bindings);
afterRejoin.set(daveOnANewPhone.seatId, "uid-borrowed");

check(
  "the phone that proved the seat may answer for it",
  maySpeakFor(afterRejoin, "p-dave", { uid: "uid-borrowed" }),
);
check(
  "the phone that lost it may not",
  !maySpeakFor(afterRejoin, "p-dave", { uid: "uid-dave" }),
);
check(
  "and nobody else may either",
  !maySpeakFor(afterRejoin, "p-dave", { uid: "uid-stranger" }),
);

clearHostSession();
check("ending a game closes the door behind it", readHostSession() === null);

console.log(
  `\n${failures ? `${failures} CHECK(S) FAILED` : "every check passed"}`,
);
process.exit(failures ? 1 : 0);
