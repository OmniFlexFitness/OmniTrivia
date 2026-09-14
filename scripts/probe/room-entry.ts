/**
 * One device in a two-device handshake, driven by `scripts/check-room-join.mjs`.
 *
 * This imports the app's own transport rather than a copy of it, so what it
 * proves is what ships: a host claims a PIN, a player on another device finds
 * it, asks for a seat, is admitted, renders the host's snapshot, and answers.
 * Run as `host` or `player`; the runner spawns one of each.
 */
import "./dom-stub";
import type { BroadcastSnapshot } from "../../src/types";
import {
  attachRoomChannel,
  canReachOtherDevices,
  detachRoomChannel,
  postMessage,
  publishSnapshot,
  registerRoom,
  roomChannelReady,
  subscribeToMessages,
} from "../../src/services/broadcastBus";

const role = process.argv[2];
const pin = process.env.PROBE_PIN ?? "4242";
const say = (line: string) => console.log(line);

const snapshotFor = (phase: string): BroadcastSnapshot =>
  ({
    version: 1,
    updatedAt: Date.now(),
    hostId: "host-window-1",
    phase,
    gamePin: pin,
    gameName: "Probe Game",
    roundNumber: 0,
    totalRounds: 3,
    category: null,
    wheelSpinning: false,
    questionNumber: 0,
    questionsInRound: 5,
    question: null,
    reveal: null,
    timeLeft: 0,
    timerDuration: 25,
    timerPaused: false,
    revealSecondsLeft: 0,
    revealReason: null,
    autoAdvance: true,
    activePlayerIds: [],
    answeredPlayerIds: [],
    correctPlayerIds: [],
    optionTallies: null,
    players: [],
    bracket: [],
    nextRoundMatchups: null,
    championId: null,
  }) as unknown as BroadcastSnapshot;

const runHost = async () => {
  await attachRoomChannel(pin, true);
  registerRoom(pin, "host-window-1", "Probe Game", true);

  subscribeToMessages((message) => {
    if (message.type === "room-query" && message.pin === pin) {
      say(`HOST_SAW_QUERY ${message.nonce}`);
      postMessage({
        type: "room-offer",
        pin,
        nonce: message.nonce,
        hostId: "host-window-1",
        gameName: "Probe Game",
        open: true,
      });
      return;
    }

    if (message.type === "player-join" && message.pin === pin) {
      say(`HOST_SAW_JOIN ${message.name}`);
      postMessage({
        type: "player-join-result",
        clientId: message.clientId,
        accepted: true,
        hostId: "host-window-1",
        gameName: "Probe Game",
        pin,
      });
      return;
    }

    if (message.type === "player-answer" && message.pin === pin) {
      say(`HOST_SAW_ANSWER ${JSON.stringify(message.answer)}`);
    }
  });

  // The snapshot the room renders, republished the way the game republishes it.
  const beat = setInterval(() => publishSnapshot(snapshotFor("LOBBY")), 500);
  say("HOST_READY");

  setTimeout(() => {
    clearInterval(beat);
    void detachRoomChannel();
    say("HOST_DONE");
    process.exit(0);
  }, 20000);
};

const runPlayer = async () => {
  const nonce = "probe-nonce";
  const clientId = "probe-client";
  let joined = false;

  await attachRoomChannel(pin, false);
  say(`PLAYER_REMOTE ${canReachOtherDevices()}`);
  say(`PLAYER_CONNECTED ${await roomChannelReady()}`);

  subscribeToMessages((message) => {
    if (message.type === "room-offer" && message.nonce === nonce) {
      say(`PLAYER_SAW_OFFER open=${message.open}`);
      postMessage({
        type: "player-join",
        pin,
        clientId,
        playerId: "probe-player",
        name: "Phone",
        avatar: "🐣",
      });
      return;
    }

    if (message.type === "player-join-result" && message.clientId === clientId) {
      say(`PLAYER_JOINED accepted=${message.accepted}`);
      joined = true;
      postMessage({ type: "player-answer", pin, playerId: "probe-player", answer: 2 });
      return;
    }

    if (message.type === "snapshot" && message.snapshot.gamePin === pin) {
      // Only the first is interesting; the host republishes twice a second.
      if (joined) {
        say(`PLAYER_SAW_SNAPSHOT ${message.snapshot.gameName}`);
        joined = false;
      }
    }
  });

  postMessage({ type: "room-query", pin, nonce });

  setTimeout(() => {
    void detachRoomChannel();
    say("PLAYER_DONE");
    process.exit(0);
  }, 12000);
};

void (role === "host" ? runHost() : runPlayer());
