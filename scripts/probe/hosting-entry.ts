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
  buildFirstRound,
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
