import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BroadcastSnapshot,
  Category,
  GamePhase,
  LaneStatus,
  PublicLane,
  PublicPlayer,
  PublicSeat,
  Question,
  RemoteCommand,
} from "../types";
import {
  PLAYER_ATTACH_TIMEOUT_MS,
  attachRoomChannel,
  canReachOtherDevices,
  claimRoomAsHost,
  detachRoomChannel,
  deviceIdentity,
  fetchHostState,
  pinFromUrl,
  pinViewToUrl,
  postMessage,
  reloadForNewBuild,
  roomFailureReason,
  snapshotFit,
  subscribeToMessages,
} from "../services/broadcastBus";
import { hostProof, remoteSignature } from "../services/proof";
import {
  LOCAL_UID,
  REMOTE_HEARTBEAT_MS,
  describeDevice,
  isPairingKey,
  pairingKeyFromHash,
  passwordSpellings,
} from "../services/remoteControl";
import { parseHostEnvelope, readHostSession } from "../services/hostSession";
import { buildReveal, seatsOf } from "../services/snapshot";
import { matchupById, roundsToDecide, sideOf } from "../services/bracket";
import AvatarDisplay from "./AvatarDisplay";
import BracketView, { MatchupCard, SideTag } from "./BracketView";
import CategoryVotePanel from "./CategoryVotePanel";
import SpectatorWheel from "./SpectatorWheel";
import Button from "./Button";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Crown,
  Eye,
  EyeOff,
  Flag,
  Hourglass,
  KeyRound,
  Loader2,
  LogOut,
  Pause,
  Play,
  Radio,
  RotateCcw,
  ShieldAlert,
  Shuffle,
  SkipForward,
  Swords,
  Tablet,
  Users,
  Zap,
} from "lucide-react";

/**
 * The host's remote — the round, run from a tablet on the floor.
 *
 * The host's own window keeps running the game: it holds the questions, scores
 * every answer and drives the big screen. This screen is a second set of hands
 * on it. It renders the same snapshot the projector does, and every button on
 * it sends a command the host window carries out with the very code its own
 * buttons call. So walking the room with an iPad changes where the host is
 * standing, not who is running the game.
 *
 * Getting in takes the PIN and the host password — the same two things that
 * take a lost game back — because this screen can end a round in front of a
 * room. The password never leaves this device: it becomes the proof, and the
 * proof only ever signs a hello bound to this device's identity (see
 * `services/remoteControl`).
 */

/** Where this remote remembers what it signed in with, for a reload. */
const SESSION_KEY = "omnitrivia:remote";

/** How long a command may go unanswered before the remote says so. */
const ACK_TIMEOUT_MS = 6000;

/** How often to ask again when the host window has not answered a hello. */
const HELLO_RETRY_MS = 5000;

/** No word from the host window for this long and the remote says so. */
const HOST_TIMEOUT_MS = 8000;

type Status =
  | "signin"
  | "connecting"
  | "waiting"
  | "ready"
  | "wrong-password"
  | "no-game"
  | "unreachable"
  | "denied";

interface StoredRemote {
  pin: string;
  /**
   * The proofs this remote can sign with: one from a pairing QR, or one per
   * spelling of a typed password. Which of them is the right one only the
   * host window can say, and it says so by letting the remote in.
   */
  proofs: string[];
}

const readStored = (pin: string | null): StoredRemote | null => {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredRemote> & { proof?: string };
    // An earlier build kept a single proof.
    const proofs = Array.isArray(stored?.proofs)
      ? stored.proofs.filter(isPairingKey)
      : isPairingKey(stored?.proof)
        ? [stored.proof]
        : [];
    if (!stored?.pin || proofs.length === 0) return null;
    return !pin || stored.pin === pin ? { pin: stored.pin, proofs } : null;
  } catch {
    return null;
  }
};

const writeStored = (stored: StoredRemote | null): void => {
  try {
    if (stored) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // No session storage: a reload asks for the password again.
  }
};

/**
 * What this page was opened with: a pairing key from the host's QR code, or
 * whatever this tab signed in with before a reload.
 *
 * A key read off the address is taken straight back out of it, so it does not
 * sit in the address bar, in this tab's history, or in a link somebody copies
 * from it.
 */
const initialRemote = (): StoredRemote | null => {
  const pin = pinFromUrl();
  try {
    const key = pairingKeyFromHash(window.location.hash);
    if (key && pin) {
      const url = new URL(window.location.href);
      url.hash = "";
      window.history.replaceState(null, "", url.toString());
      const paired = { pin, proofs: [key] };
      writeStored(paired);
      return paired;
    }
  } catch {
    // An address this browser will not rewrite: fall back to what is stored.
  }
  return readStored(pin);
};

const newId = (prefix: string) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;

interface Feedback {
  commandId: string;
  label: string;
  state: "sent" | "done" | "refused" | "silent";
  reason?: string;
}

/* ------------------------------------------------------------------ *
 * The link to the host window
 * ------------------------------------------------------------------ */

const useRemoteLink = () => {
  const [initial] = useState(initialRemote);
  const [pin, setPin] = useState<string | null>(() => initial?.pin ?? pinFromUrl());
  const [proofs, setProofs] = useState<string[] | null>(() => initial?.proofs ?? null);
  const [status, setStatus] = useState<Status>(() => (initial ? "connecting" : "signin"));
  const [snapshot, setSnapshot] = useState<BroadcastSnapshot | null>(null);
  const [hostSeenAt, setHostSeenAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [answers, setAnswers] = useState<Map<string, Question>>(new Map());
  /** Each player's rejoin code, for the one who has lost theirs. */
  const [codes, setCodes] = useState<Map<string, string>>(new Map());
  /** The proof the database accepted, which is what reads the saved game. */
  const [readProof, setReadProof] = useState<string | null>(null);
  const canReadGame = readProof !== null;

  const controllerId = useRef(newId("remote"));
  const uidRef = useRef<string>(LOCAL_UID);
  const statusRef = useRef(status);
  statusRef.current = status;
  const lastHello = useRef(0);
  const followingHost = useRef<string | null>(null);
  const ackTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const sendHello = useCallback(() => {
    if (!pin || !proofs?.length) return;
    const at = Date.now();
    // An "unbound" answer and a reclaimed room can both ask for one at once.
    if (at - lastHello.current < 1500) return;
    lastHello.current = at;
    const [first, ...rest] = proofs.map((proof) =>
      remoteSignature(proof, pin, uidRef.current, controllerId.current),
    );
    postMessage({
      type: "remote-hello",
      pin,
      controllerId: controllerId.current,
      label: describeDevice(),
      signature: first,
      alternates: rest.length ? rest : undefined,
    });
  }, [pin, proofs]);

  /* --- connecting, and proving the password --- */
  useEffect(() => {
    if (!pin || !proofs?.length) return;
    let cancelled = false;

    void (async () => {
      setStatus("connecting");
      setReadProof(null);
      const remote = canReachOtherDevices();

      if (remote) {
        const attached = await attachRoomChannel(pin, false, PLAYER_ATTACH_TIMEOUT_MS);
        if (cancelled) return;
        if (!attached) {
          setStatus(roomFailureReason() === "denied" ? "denied" : "unreachable");
          return;
        }
        uidRef.current = (await deviceIdentity()) ?? LOCAL_UID;

        // Proving the password to the database as well is what lets this
        // device read the saved game — the answers, and every player's rejoin
        // code. It is not what gets the remote in: the host window decides
        // that, from the signed hello below. So a refusal here is not a wrong
        // password. It is just as often a database whose rules predate this
        // (the live site's did), and the remote works without it.
        for (const proof of proofs) {
          const claim = await claimRoomAsHost(pin, proof);
          if (cancelled) return;
          if (claim === "missing") {
            setStatus("no-game");
            return;
          }
          if (claim === "ok") {
            setReadProof(proof);
            break;
          }
          if (claim === "unreachable") break;
        }
      } else {
        // No network: the only host this can reach is a window of this same
        // browser, which keeps its own copy of the game to check against.
        const local = readHostSession(pin);
        const matching = local ? proofs.find((proof) => proof === local.proof) : undefined;
        if (local && !matching) {
          writeStored(null);
          setStatus("wrong-password");
          return;
        }
        setReadProof(matching ?? null);
        uidRef.current = LOCAL_UID;
      }

      if (cancelled) return;
      writeStored({ pin, proofs });
      setStatus("waiting");
      lastHello.current = 0;
      sendHello();
    })();

    return () => {
      cancelled = true;
    };
  }, [pin, proofs, sendHello]);

  // Leaving the page leaves the room.
  useEffect(() => () => void detachRoomChannel(), []);

  /* --- listening --- */
  useEffect(() => {
    if (!pin || !proofs) return;

    return subscribeToMessages((message) => {
      switch (message.type) {
        case "snapshot": {
          const fit = snapshotFit(message.snapshot);
          if (fit === "sender-is-newer") {
            reloadForNewBuild();
            return;
          }
          if (fit !== "ok" || message.snapshot.gamePin !== pin) return;
          followingHost.current = message.snapshot.hostId;
          setSnapshot(message.snapshot);
          setHostSeenAt(Date.now());
          return;
        }
        case "host-heartbeat":
          // Only the host whose game this is — a heartbeat carries no PIN.
          if (followingHost.current === message.hostId) setHostSeenAt(Date.now());
          return;
        case "remote-welcome":
          if (message.controllerId !== controllerId.current) return;
          setStatus("ready");
          return;
        case "remote-rejected":
          if (message.controllerId !== controllerId.current) return;
          if (message.reason === "password") {
            writeStored(null);
            setStatus("wrong-password");
          } else {
            // The host window has forgotten this remote — it reloaded, or the
            // game was taken back on another device. Introduce it again.
            setStatus("waiting");
            sendHello();
          }
          return;
        case "host-reclaimed":
          if (message.pin !== pin) return;
          setStatus("waiting");
          lastHello.current = 0;
          sendHello();
          return;
        case "remote-ack": {
          if (message.controllerId !== controllerId.current) return;
          clearTimeout(ackTimers.current.get(message.commandId));
          ackTimers.current.delete(message.commandId);
          setFeedback((current) =>
            current?.commandId === message.commandId
              ? {
                  ...current,
                  state: message.ok ? "done" : "refused",
                  reason: message.reason,
                }
              : current,
          );
          return;
        }
        default:
          return;
      }
    });
  }, [pin, proofs, sendHello]);

  /* --- staying in touch --- */
  useEffect(() => {
    if (!pin || !proofs) return;

    const beat = setInterval(() => {
      setNow(Date.now());
      const current = statusRef.current;
      if (current === "ready") {
        postMessage({ type: "remote-heartbeat", pin, controllerId: controllerId.current });
      } else if (current === "waiting") {
        // Nobody answered the last hello: the laptop may be asleep, or the
        // hello went out before its window was listening.
        if (Date.now() - lastHello.current >= HELLO_RETRY_MS) sendHello();
      }
    }, REMOTE_HEARTBEAT_MS);

    return () => clearInterval(beat);
  }, [pin, proofs, sendHello]);

  /* --- the answer key, for reading out on the floor --- */
  const fetchedAt = useRef(0);
  const refreshAnswers = useCallback(async (minGapMs = 4000) => {
    if (!pin || !readProof) return;
    if (Date.now() - fetchedAt.current < minGapMs) return;
    fetchedAt.current = Date.now();

    const state = canReachOtherDevices()
      ? parseHostEnvelope((await fetchHostState(pin))?.payload)?.state
      : readHostSession(pin)?.state;
    if (!state) return;

    const map = new Map<string, Question>();
    state.roundsConfig.forEach((round) =>
      round.questions.forEach((question) => map.set(question.id, question)),
    );
    state.questionsQueue.forEach((question) => map.set(question.id, question));
    setAnswers(map);

    const codeMap = new Map<string, string>();
    state.players.forEach((player) => {
      if (player.rejoinCode) codeMap.set(player.id, player.rejoinCode);
    });
    setCodes(codeMap);
  }, [pin, readProof]);

  // Only when the snapshot names a question this remote cannot answer: the
  // saved game carries every round's questions, so one read usually covers
  // the night.
  useEffect(() => {
    if (!snapshot) return;
    const ids = [
      snapshot.question?.id,
      ...snapshot.lanes.flatMap((lane) => seatsOf(lane).map((seat) => seat.question?.id)),
    ].filter((id): id is string => Boolean(id));
    if (ids.some((id) => !answers.has(id))) void refreshAnswers();
  }, [snapshot, answers, refreshAnswers]);

  // A player who joined since the last read has a code this remote has not
  // seen. Checked less eagerly than the answers: somebody who joined without
  // one would otherwise have the whole game re-read every few seconds.
  useEffect(() => {
    if (!snapshot) return;
    const missing = snapshot.players.some(
      (player) => !player.isBot && !player.isHost && !codes.has(player.id),
    );
    if (missing) void refreshAnswers(15000);
  }, [snapshot, codes, refreshAnswers]);

  /* --- sending --- */
  const send = useCallback(
    (command: RemoteCommand, label: string) => {
      if (!pin) return;
      const commandId = newId("cmd");
      setFeedback({ commandId, label, state: "sent" });
      postMessage({
        type: "remote-command",
        pin,
        controllerId: controllerId.current,
        commandId,
        command,
      });
      ackTimers.current.set(
        commandId,
        setTimeout(() => {
          setFeedback((current) =>
            current?.commandId === commandId && current.state === "sent"
              ? { ...current, state: "silent" }
              : current,
          );
        }, ACK_TIMEOUT_MS),
      );
    },
    [pin],
  );

  const signIn = (nextPin: string, password: string) => {
    pinViewToUrl(nextPin);
    setPin(nextPin);
    setProofs(passwordSpellings(password).map((spelling) => hostProof(nextPin, spelling)));
  };

  const signOut = () => {
    writeStored(null);
    void detachRoomChannel();
    setProofs(null);
    setSnapshot(null);
    setAnswers(new Map());
    setStatus("signin");
  };

  const hostLive = hostSeenAt > 0 && now - hostSeenAt < HOST_TIMEOUT_MS;

  return {
    pin,
    status,
    snapshot,
    hostLive,
    feedback,
    answers,
    codes,
    canReadGame,
    send,
    signIn,
    signOut,
  };
};

type Send = (command: RemoteCommand, label: string) => void;

/* ------------------------------------------------------------------ *
 * Signing in
 * ------------------------------------------------------------------ */

const SignIn: React.FC<{
  pin: string | null;
  status: Status;
  onSubmit: (pin: string, password: string) => void;
}> = ({ pin, status, onSubmit }) => {
  const [pinValue, setPinValue] = useState(pin ?? "");
  const [password, setPassword] = useState("");
  const validPin = /^\d{4}$/.test(pinValue);

  const problem =
    status === "wrong-password"
      ? `That host password does not match the game on PIN ${pinValue}.`
      : status === "no-game"
        ? `No game is running on PIN ${pinValue}.`
        : status === "unreachable"
          ? "Could not reach the game server from this device. Check its Wi-Fi and try again."
          : status === "denied"
            ? "The game server is refusing every device — its database rules have not been published (see MULTIPLAYER.md)."
            : null;

  return (
    <div className="min-h-screen tron-backdrop flex items-center justify-center p-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (validPin && password.trim()) onSubmit(pinValue, password.trim());
        }}
        className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-5 shadow-2xl"
      >
        <div className="flex items-center gap-3">
          <Tablet className="text-neon-blue" size={30} />
          <div>
            <h1 className="text-2xl font-black text-white">HOST REMOTE</h1>
            <p className="text-xs text-slate-400">
              Run the round from anywhere in the room. The host window keeps
              running the game — this drives it.
            </p>
          </div>
        </div>

        {problem && (
          <div className="flex items-start gap-2 text-sm text-amber-200 bg-amber-500/10 border border-amber-500/40 rounded-lg p-3">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            {problem}
          </div>
        )}

        <label className="block">
          <span className="block text-xs uppercase tracking-wider text-slate-400 mb-1">
            Game PIN
          </span>
          <input
            value={pinValue}
            onChange={(event) => setPinValue(event.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            autoComplete="off"
            className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-3xl text-center font-mono tracking-[0.3em] text-white focus:border-neon-blue outline-none"
          />
        </label>

        <label className="block">
          <span className="block text-xs uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
            <KeyRound size={12} className="text-neon-yellow" /> Host password
          </span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="off"
            autoCapitalize="characters"
            className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-xl font-mono text-white focus:border-neon-yellow outline-none"
          />
          <span className="block text-[11px] text-slate-500 mt-1">
            The one on the host's lobby screen. It stays on this device — only a
            signature made with it is sent.
          </span>
        </label>

        <Button
          type="submit"
          variant="neon"
          fullWidth
          disabled={!validPin || !password.trim() || status === "connecting"}
          className="flex items-center justify-center gap-2 h-14 text-lg"
        >
          {status === "connecting" ? (
            <>
              <Loader2 className="animate-spin" size={18} /> CONNECTING…
            </>
          ) : (
            <>
              TAKE THE REMOTE <ArrowRight size={18} />
            </>
          )}
        </Button>

        {!canReachOtherDevices() && (
          <p className="text-[11px] text-slate-500">
            Multiplayer is not configured in this build, so a remote only
            reaches a host window in this same browser.
          </p>
        )}
      </form>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

const Card: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  action,
  children,
}) => (
  <section className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4">
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-slate-400">{title}</h2>
      {action}
    </div>
    {children}
  </section>
);

/** A button big enough to hit with a thumb while walking. */
const Big: React.FC<React.ComponentProps<typeof Button>> = ({ className = "", ...props }) => (
  <Button
    {...props}
    className={`flex items-center justify-center gap-2 min-h-[3.25rem] text-sm hover:scale-100 ${className}`}
  />
);

/** The answer to one question, hidden until the host asks — players walk past. */
const AnswerPeek: React.FC<{ question: Question | undefined; canRead: boolean }> = ({
  question,
  canRead,
}) => {
  const [shown, setShown] = useState(false);

  if (!question) {
    return (
      <div className="text-xs text-slate-500">
        {canRead ? "Fetching the answer…" : "Answers are on the host's desk only."}
      </div>
    );
  }

  const reveal = buildReveal(question);
  return (
    <button
      onClick={() => setShown((value) => !value)}
      className="w-full flex items-start gap-2 text-left bg-slate-900/80 border border-slate-700 rounded-lg px-3 py-2"
    >
      {shown ? <Eye size={16} className="text-green-400 mt-0.5" /> : <EyeOff size={16} className="text-slate-500 mt-0.5" />}
      <span className="flex-1 min-w-0">
        <span className="block text-[10px] font-mono uppercase tracking-widest text-slate-500">
          Answer
        </span>
        {shown ? (
          <span className="block font-bold text-green-400">{reveal.label}</span>
        ) : (
          <span className="block text-slate-500 text-sm">Tap to show</span>
        )}
      </span>
    </button>
  );
};

const seatLine = (seat: PublicSeat, questions: number): string => {
  if (seat.status === LaneStatus.DONE) return "through the round";
  const where = `Q${Math.min(seat.completed + 1, questions)}/${questions}`;
  if (seat.status === LaneStatus.REVEAL) return `${where} · locked in`;
  if (seat.timerPaused) return `${where} · paused`;
  return `${where} · ${seat.timeLeft}s${seat.answered ? " · in" : ""}`;
};

const LaneRemote: React.FC<{
  lane: PublicLane;
  snapshot: BroadcastSnapshot;
  answers: Map<string, Question>;
  canRead: boolean;
  send: Send;
}> = ({ lane, snapshot, answers, canRead, send }) => {
  const seats = seatsOf(lane);
  const playerOf = (id: string) => snapshot.players.find((p) => p.id === id);
  const matchup = matchupById(snapshot.bracket, lane.matchupId);
  const running = seats.some((seat) => seat.status === LaneStatus.ANSWERING && !seat.timerPaused);
  const done = lane.status === LaneStatus.DONE;
  // The question the slower player at this table is still reading.
  const slowest = seats
    .filter((seat) => seat.status !== LaneStatus.DONE && seat.question)
    .sort((a, b) => a.completed - b.completed)[0];

  return (
    <div
      className={`rounded-xl border p-3 space-y-2 ${
        done ? "border-slate-800 bg-slate-900/40" : "border-slate-700 bg-slate-900"
      }`}
    >
      <div className="flex items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-widest text-slate-500">
        <span className="flex items-center gap-2">
          {matchup && <SideTag side={sideOf(matchup)} />}
          {lane.playerIds.length < 2 ? "bye" : "matchup"}
        </span>
        {done && (
          <span className="flex items-center gap-1 text-slate-400">
            <Flag size={11} /> match over
          </span>
        )}
      </div>

      {seats.map((seat, index) => {
        const player = playerOf(seat.playerId);
        return (
          <React.Fragment key={seat.playerId}>
            {index > 0 && <Swords size={12} className="mx-auto text-neon-pink" />}
            <div className="flex items-center gap-2">
              {player && (
                <AvatarDisplay
                  avatar={player.avatar}
                  color={player.avatarColor}
                  accessory={player.avatarAccessory}
                  size="sm"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white truncate">{player?.name ?? "Unknown"}</div>
                <div
                  className={`text-[11px] font-mono uppercase tracking-widest ${
                    seat.status === LaneStatus.ANSWERING && seat.timeLeft <= 5 && !seat.timerPaused
                      ? "text-red-400"
                      : "text-slate-400"
                  }`}
                >
                  {seatLine(seat, snapshot.questionsInRound)}
                </div>
              </div>
            </div>
          </React.Fragment>
        );
      })}

      {/* Somebody in the pairing who is not answering — usually the host,
          running the room from this very remote — still belongs on the card. */}
      {lane.playerIds
        .filter((id) => !seats.some((seat) => seat.playerId === id))
        .map((id) => (
          <div key={id} className="text-[11px] font-mono uppercase tracking-widest text-slate-500">
            {playerOf(id)?.name ?? "Unknown"} · not answering
          </div>
        ))}

      {!done && slowest?.question && (
        <div className="space-y-2 pt-1">
          <p className="text-sm text-slate-300 leading-snug">{slowest.question.text}</p>
          <AnswerPeek question={answers.get(slowest.question.id)} canRead={canRead} />
        </div>
      )}

      {!done && (
        <div className="grid grid-cols-3 gap-2 pt-1">
          <Big
            variant="secondary"
            onClick={() =>
              send(
                { kind: "lane-pause", laneId: lane.id, paused: running },
                running ? "Pause this table" : "Resume this table",
              )
            }
          >
            {running ? <Pause size={16} /> : <Play size={16} />}
            {running ? "Pause" : "Resume"}
          </Big>
          <Big
            variant="secondary"
            onClick={() =>
              send({ kind: "lane-add-time", laneId: lane.id, seconds: 10 }, "+10s at this table")
            }
          >
            +10s
          </Big>
          <Big
            variant="neon"
            onClick={() => send({ kind: "lane-close", laneId: lane.id }, "Close this table's question")}
          >
            <SkipForward size={16} /> Close
          </Big>
        </div>
      )}
    </div>
  );
};

const Standings: React.FC<{
  players: PublicPlayer[];
  codes: Map<string, string>;
  showCodes: boolean;
}> = ({ players, codes, showCodes }) => (
  <div className="space-y-1.5">
    {[...players]
      .sort((a, b) => b.score - a.score)
      .map((player) => (
        <div
          key={player.id}
          className={`flex items-center gap-2 bg-slate-900 rounded-lg px-2 py-1.5 text-sm ${
            player.eliminated ? "opacity-40" : ""
          }`}
        >
          <AvatarDisplay avatar={player.avatar} color={player.avatarColor} size="sm" />
          <span className="flex-1 truncate font-bold">{player.name}</span>
          {showCodes && codes.get(player.id) && (
            <span className="font-mono text-xs tracking-[0.2em] text-neon-yellow">
              {codes.get(player.id)}
            </span>
          )}
          {player.losersBracket && !player.eliminated && (
            <span className="px-1.5 rounded border border-orange-400/60 text-[9px] font-mono uppercase text-orange-300">
              LB
            </span>
          )}
          {player.eliminated && (
            <span className="text-[9px] font-mono uppercase text-red-400">out</span>
          )}
          <span className="font-mono font-bold text-neon-pink">{player.score}</span>
        </div>
      ))}
  </div>
);

/** Asks once before doing the one thing that cannot be taken back. */
const ConfirmBig: React.FC<{
  label: React.ReactNode;
  confirmText: string;
  onConfirm: () => void;
  variant?: "danger" | "secondary";
}> = ({ label, confirmText, onConfirm, variant = "danger" }) => {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Big
        variant="secondary"
        onClick={() => setAsking(true)}
        className={variant === "danger" ? "border-red-500/60 text-red-300" : ""}
      >
        {label}
      </Big>
    );
  }
  return (
    <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 space-y-2">
      <p className="text-xs text-red-100">{confirmText}</p>
      <div className="grid grid-cols-2 gap-2">
        <Big variant="secondary" onClick={() => setAsking(false)}>
          Cancel
        </Big>
        <Big
          variant="danger"
          onClick={() => {
            setAsking(false);
            onConfirm();
          }}
        >
          Yes
        </Big>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Phase panels
 * ------------------------------------------------------------------ */

/** Bots on or off, from the floor — up until round one is dealt. */
const BotsSwitch: React.FC<{ snapshot: BroadcastSnapshot; send: Send }> = ({
  snapshot,
  send,
}) => {
  const bots = snapshot.players.filter((player) => player.isBot).length;
  const enabled = snapshot.botsEnabled !== false;
  return (
    <button
      onClick={() =>
        send(
          { kind: "set-bots", enabled: !enabled },
          enabled ? "Bots off" : "Bots on",
        )
      }
      className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left ${
        enabled ? "border-neon-blue/60 bg-neon-blue/10 text-neon-blue" : "border-slate-600 text-slate-300"
      }`}
    >
      <Bot size={20} />
      <span className="flex-1">
        <span className="block font-bold">Bots {enabled ? "on" : "off"}</span>
        <span className="block text-xs text-slate-400">
          {snapshot.phase === GamePhase.LOBBY
            ? enabled
              ? `${bots} in the lobby — tap to remove them and stop more joining.`
              : "Only real players will be drawn."
            : enabled && bots > 0
              ? `${bots} in round one's draw — tap to remove them and redraw.`
              : "No bots in this game."}
        </span>
      </span>
    </button>
  );
};

const LobbyRemote: React.FC<{ snapshot: BroadcastSnapshot; send: Send }> = ({
  snapshot,
  send,
}) => {
  const needed = roundsToDecide(snapshot.players.length, snapshot.losersBracket);

  return (
    <div className="space-y-4">
      <Card title={`Lobby · ${snapshot.players.length} in`} action={<Users size={14} className="text-neon-pink" />}>
        <div className="flex flex-wrap gap-3">
          {snapshot.players.map((player) => (
            <div key={player.id} className="flex flex-col items-center gap-1 w-16">
              <AvatarDisplay
                avatar={player.avatar}
                color={player.avatarColor}
                accessory={player.avatarAccessory}
                size="md"
              />
              <span className="text-[11px] text-slate-300 truncate w-full text-center">
                {player.name}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Bracket">
        <button
          onClick={() =>
            send(
              { kind: "set-losers-bracket", enabled: !snapshot.losersBracket },
              snapshot.losersBracket ? "Loser's bracket off" : "Loser's bracket on",
            )
          }
          className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left ${
            snapshot.losersBracket
              ? "border-orange-400/70 bg-orange-500/10 text-orange-200"
              : "border-slate-600 text-slate-300"
          }`}
        >
          <ShieldAlert size={20} />
          <span className="flex-1">
            <span className="block font-bold">
              Loser's bracket {snapshot.losersBracket ? "on" : "off"}
            </span>
            <span className="block text-xs text-slate-400">
              Needs up to {needed} round{needed === 1 ? "" : "s"} for{" "}
              {snapshot.players.length} players · {snapshot.totalRounds} loaded
            </span>
          </span>
        </button>
      </Card>

      <Card title="Bots">
        <BotsSwitch snapshot={snapshot} send={send} />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Big
          variant="secondary"
          disabled={!snapshot.botsEnabled}
          onClick={() => send({ kind: "add-bot" }, "Add a bot")}
        >
          <Bot size={18} /> ADD BOT
        </Big>
        <Big
          variant="neon"
          disabled={snapshot.players.length < 1}
          onClick={() => send({ kind: "start-game" }, "Start the game")}
        >
          <Zap size={18} /> START GAME
        </Big>
      </div>
    </div>
  );
};

const WheelRemote: React.FC<{ snapshot: BroadcastSnapshot; send: Send }> = ({
  snapshot,
  send,
}) => {
  const [settled, setSettled] = useState<Category | null>(null);
  const round = snapshot.bracket[snapshot.roundNumber - 1];
  const landed = !snapshot.wheelSpinning && snapshot.category;

  return (
    <div className="space-y-4">
      <Card title={`Round ${snapshot.roundNumber} of ${snapshot.totalRounds} · the wheel`}>
        <div className="flex flex-col items-center gap-4">
          {snapshot.wheelSlices.length > 0 && (
            <SpectatorWheel
              categories={snapshot.wheelSlices}
              spinning={snapshot.wheelSpinning}
              landed={snapshot.category}
              roundNumber={snapshot.roundNumber}
              onSettled={setSettled}
              className="w-56 h-56"
            />
          )}
          <div className="text-xl font-black text-white text-center min-h-[1.75rem]">
            {snapshot.wheelSpinning
              ? "Spinning…"
              : settled
                ? `${settled.icon} ${settled.name}`
                : landed
                  ? "Landing…"
                  : "Ready to spin"}
          </div>

          <div className="grid grid-cols-2 gap-3 w-full">
            <Big
              variant={landed ? "secondary" : "neon"}
              disabled={snapshot.wheelSpinning}
              onClick={() =>
                send({ kind: "spin", round: snapshot.roundNumber }, landed ? "Respin" : "Spin the wheel")
              }
            >
              <RotateCcw size={18} /> {landed ? "RESPIN" : "SPIN"}
            </Big>
            <Big
              variant="neon"
              disabled={!landed}
              onClick={() =>
                send({ kind: "start-round", round: snapshot.roundNumber }, "Start the round")
              }
            >
              START ROUND <ArrowRight size={18} />
            </Big>
          </div>
        </div>
      </Card>

      {snapshot.roundNumber === 1 && (
        <Card title="Before round one">
          <BotsSwitch snapshot={snapshot} send={send} />
        </Card>
      )}

      {round && (
        <Card title="This round's matchups">
          <div className="space-y-2">
            {round.matchups.map((matchup) => (
              <MatchupCard
                key={matchup.id}
                matchup={matchup}
                players={snapshot.players}
                isLive={false}
                size="sm"
                showSide
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

const PlayingRemote: React.FC<{
  snapshot: BroadcastSnapshot;
  send: Send;
  answers: Map<string, Question>;
  canRead: boolean;
}> = ({ snapshot, send, answers, canRead }) => {
  const seats = snapshot.lanes.flatMap(seatsOf);
  const anyRunning = seats.some(
    (seat) => seat.status === LaneStatus.ANSWERING && !seat.timerPaused,
  );
  const live = seats.filter((seat) => seat.status !== LaneStatus.DONE).length;
  const ordered = [...snapshot.lanes].sort(
    (a, b) => Number(a.status === LaneStatus.DONE) - Number(b.status === LaneStatus.DONE),
  );

  return (
    <div className="space-y-4">
      <Card title={`Round ${snapshot.roundNumber} · every table`}>
        <div className="grid grid-cols-2 gap-2">
          <Big
            variant="secondary"
            onClick={() =>
              send({ kind: "pause-all", paused: anyRunning }, anyRunning ? "Pause every clock" : "Resume every clock")
            }
          >
            {anyRunning ? <Pause size={16} /> : <Play size={16} />}
            {anyRunning ? "Pause all" : "Resume all"}
          </Big>
          <Big variant="secondary" onClick={() => send({ kind: "add-time-all", seconds: 10 }, "+10s to everyone")}>
            +10s all
          </Big>
          <Big variant="secondary" onClick={() => send({ kind: "close-all" }, "Close every question")}>
            <SkipForward size={16} /> Close all
          </Big>
          <ConfirmBig
            label={
              <>
                <Flag size={16} /> End round
              </>
            }
            confirmText={
              live > 0
                ? `${live} player${live === 1 ? "" : "s"} still answering. The round is settled on the scores as they stand.`
                : "Everyone is through — go straight to the results?"
            }
            onConfirm={() => send({ kind: "end-round", round: snapshot.roundNumber }, "End the round")}
          />
        </div>
      </Card>

      <Card
        title={`Big screen · Q${snapshot.questionNumber} of ${snapshot.questionsInRound}`}
        action={
          <button
            onClick={() =>
              send(
                { kind: "set-auto-advance", enabled: !snapshot.autoAdvance },
                `Auto-advance ${snapshot.autoAdvance ? "off" : "on"}`,
              )
            }
            className={`px-2 py-1 rounded border text-[10px] font-mono uppercase tracking-widest ${
              snapshot.autoAdvance ? "border-neon-green text-neon-green" : "border-slate-600 text-slate-400"
            }`}
          >
            auto-advance {snapshot.autoAdvance ? "on" : "off"}
          </button>
        }
      >
        {snapshot.question && (
          <div className="space-y-2">
            <p className="text-sm text-slate-200">{snapshot.question.text}</p>
            <AnswerPeek question={answers.get(snapshot.question.id)} canRead={canRead} />
            <div className="text-[11px] font-mono uppercase tracking-widest text-slate-500">
              {snapshot.lanesCompleted}/{snapshot.lanesInPlay} matches through it
            </div>
            {snapshot.roomLockedIn && (
              <Big variant="neon" fullWidth onClick={() => send({ kind: "advance-room" }, "Move the room on")}>
                MOVE THE ROOM ON <ArrowRight size={16} />
              </Big>
            )}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ordered.map((lane) => (
          <LaneRemote
            key={lane.id}
            lane={lane}
            snapshot={snapshot}
            answers={answers}
            canRead={canRead}
            send={send}
          />
        ))}
      </div>
    </div>
  );
};

const RoundEndRemote: React.FC<{ snapshot: BroadcastSnapshot; send: Send }> = ({
  snapshot,
  send,
}) => {
  const round = snapshot.bracket[snapshot.roundNumber - 1];
  const isLast = snapshot.championId !== null || snapshot.roundNumber >= snapshot.totalRounds;

  return (
    <div className="space-y-4">
      <Big
        variant="neon"
        fullWidth
        className="h-16 text-lg"
        onClick={() =>
          send(
            { kind: "next-round", round: snapshot.roundNumber },
            isLast ? "Show the final results" : `Start round ${snapshot.roundNumber + 1}`,
          )
        }
      >
        {isLast ? "SHOW FINAL RESULTS" : `START ROUND ${snapshot.roundNumber + 1}`}
        <ArrowRight size={20} />
      </Big>

      {round && (
        <Card title={`Round ${snapshot.roundNumber} results`}>
          <div className="space-y-2">
            {round.matchups.map((matchup) => (
              <MatchupCard
                key={matchup.id}
                matchup={matchup}
                players={snapshot.players}
                isLive={false}
                size="sm"
                showSide
              />
            ))}
          </div>
        </Card>
      )}

      {snapshot.categoryPoll && (
        <Card
          title="The vote on what to play next"
          action={
            <button
              onClick={() => send({ kind: "redraw-ballot" }, "Draw different options")}
              className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-slate-400"
            >
              <Shuffle size={12} /> redraw
            </button>
          }
        >
          <CategoryVotePanel poll={snapshot.categoryPoll} readOnly />
        </Card>
      )}
    </div>
  );
};

const GameOverRemote: React.FC<{ snapshot: BroadcastSnapshot; send: Send }> = ({
  snapshot,
  send,
}) => {
  const champion = snapshot.players.find((p) => p.id === snapshot.championId);
  return (
    <div className="space-y-4">
      <Card title="Game over">
        <div className="text-center space-y-2">
          <Crown size={36} className="mx-auto text-yellow-400" />
          <div className="text-3xl font-black text-white">{champion?.name ?? "No one"}</div>
          <div className="text-xs text-slate-500">
            Ending the game for good — closing the room — is done from the host's
            own window.
          </div>
        </div>
      </Card>
      <ConfirmBig
        variant="secondary"
        label={
          <>
            <RotateCcw size={16} /> PLAY AGAIN
          </>
        }
        confirmText="Replay the same questions with every score reset and the bracket redrawn?"
        onConfirm={() => send({ kind: "play-again" }, "Play again")}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Shell
 * ------------------------------------------------------------------ */

const FEEDBACK_TONE: Record<Feedback["state"], string> = {
  sent: "border-slate-600 text-slate-300",
  done: "border-neon-green/60 text-neon-green",
  refused: "border-amber-500/60 text-amber-200",
  silent: "border-red-500/60 text-red-300",
};

const RemoteControlScreen: React.FC = () => {
  const link = useRemoteLink();
  const { snapshot, status, feedback, send } = link;

  // A result the host has already acted on fades rather than sitting there.
  const [visibleFeedback, setVisibleFeedback] = useState<Feedback | null>(null);
  useEffect(() => {
    setVisibleFeedback(feedback);
    if (!feedback || feedback.state === "sent") return;
    const timer = setTimeout(() => setVisibleFeedback(null), 3500);
    return () => clearTimeout(timer);
  }, [feedback]);

  const [showCodes, setShowCodes] = useState(false);

  const hostPlayer = useMemo(
    () => snapshot?.players.find((player) => player.isHost),
    [snapshot],
  );

  if (
    !link.pin ||
    status === "signin" ||
    status === "wrong-password" ||
    status === "no-game" ||
    status === "denied" ||
    (status === "unreachable" && !snapshot)
  ) {
    return <SignIn pin={link.pin} status={status} onSubmit={link.signIn} />;
  }

  const ready = status === "ready";

  const body = () => {
    if (!snapshot) {
      return (
        <div className="text-center py-20 space-y-3">
          <Loader2 size={40} className="mx-auto text-neon-blue animate-spin" />
          <p className="text-slate-300 font-mono uppercase tracking-widest">
            {status === "connecting" ? "Connecting to the room…" : "Waiting for the host window…"}
          </p>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            The laptop running the game has to be open on PIN {link.pin}. It
            answers within a few seconds of waking up.
          </p>
        </div>
      );
    }

    switch (snapshot.phase) {
      case GamePhase.LOBBY:
        return <LobbyRemote snapshot={snapshot} send={send} />;
      case GamePhase.CATEGORY_SELECT:
        return <WheelRemote snapshot={snapshot} send={send} />;
      case GamePhase.PLAYING:
        return (
          <PlayingRemote
            snapshot={snapshot}
            send={send}
            answers={link.answers}
            canRead={link.canReadGame}
          />
        );
      case GamePhase.ROUND_END:
        return <RoundEndRemote snapshot={snapshot} send={send} />;
      case GamePhase.GAME_OVER:
        return <GameOverRemote snapshot={snapshot} send={send} />;
      default:
        return (
          <p className="text-slate-400 text-center py-10">
            The host is still setting this game up.
          </p>
        );
    }
  };

  return (
    <div className="min-h-screen tron-backdrop text-white p-3 md:p-5 pb-24">
      <header className="flex flex-wrap items-center gap-3 mb-4">
        <div className="text-lg font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-pink">
          OMNI<span className="text-white">TRIVIA</span>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-mono uppercase tracking-widest text-neon-yellow">
          remote
        </span>
        {snapshot?.gameName && (
          <span className="text-sm font-bold text-slate-300 truncate max-w-[12rem]">
            {snapshot.gameName}
          </span>
        )}
        <span className="text-xs font-mono text-slate-500">PIN {link.pin}</span>
        {snapshot && snapshot.roundNumber > 0 && (
          <span className="text-xs font-mono text-slate-500">
            R{snapshot.roundNumber}/{snapshot.totalRounds}
          </span>
        )}

        <span
          className={`ml-auto flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest ${
            ready && link.hostLive ? "text-neon-green" : "text-amber-300 animate-pulse"
          }`}
        >
          {ready && link.hostLive ? <Radio size={13} /> : <Hourglass size={13} />}
          {ready ? (link.hostLive ? "host live" : "host quiet") : "not linked yet"}
        </span>
        <button
          onClick={link.signOut}
          className="p-2 rounded-lg border border-slate-700 text-slate-400"
          title="Sign this remote out"
          aria-label="Sign this remote out"
        >
          <LogOut size={14} />
        </button>
      </header>

      {!ready && snapshot && (
        <p className="mb-4 text-sm text-amber-200 border border-amber-500/40 bg-amber-500/10 rounded-lg px-3 py-2">
          Showing the game, but the host window has not let this remote in yet —
          buttons will not do anything until it does. Is the host laptop awake,
          with the game open?
        </p>
      )}

      {snapshot && hostPlayer && snapshot.phase !== GamePhase.GAME_OVER && (
        <button
          onClick={() =>
            send(
              { kind: "set-host-answering", enabled: !snapshot.hostAnswering },
              `Your answering ${snapshot.hostAnswering ? "off" : "on"}`,
            )
          }
          className={`mb-4 w-full flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs ${
            snapshot.hostAnswering
              ? "border-neon-green/60 text-neon-green"
              : "border-slate-700 text-slate-400"
          }`}
        >
          <CheckCircle2 size={14} />
          <span className="flex-1">
            Your seat ({hostPlayer.name}) is{" "}
            {snapshot.hostAnswering ? "answering" : "not answering"} — tap to switch.
            {snapshot.hostAnswering && " Nothing on this remote plays for you, so switch it off while you walk the room."}
          </span>
        </button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">{body()}</div>
        {snapshot && (
          <div className="space-y-4">
            <Card
              title="Scores"
              action={
                link.codes.size > 0 ? (
                  <button
                    onClick={() => setShowCodes((shown) => !shown)}
                    className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-slate-400"
                  >
                    {showCodes ? <EyeOff size={12} /> : <Eye size={12} />} rejoin codes
                  </button>
                ) : undefined
              }
            >
              <Standings players={snapshot.players} codes={link.codes} showCodes={showCodes} />
            </Card>
            {snapshot.bracket.length > 0 && (
              <Card title="Bracket">
                <BracketView
                  bracket={snapshot.bracket}
                  players={snapshot.players}
                  currentRound={snapshot.roundNumber}
                  championId={snapshot.championId}
                />
              </Card>
            )}
          </div>
        )}
      </div>

      {visibleFeedback && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] rounded-full border bg-slate-900/95 px-4 py-2 text-sm shadow-xl flex items-center gap-2 ${FEEDBACK_TONE[visibleFeedback.state]}`}
          role="status"
        >
          {visibleFeedback.state === "sent" && <Loader2 size={14} className="animate-spin" />}
          <span className="font-bold">{visibleFeedback.label}</span>
          <span className="opacity-80">
            {visibleFeedback.state === "sent"
              ? "sending…"
              : visibleFeedback.state === "done"
                ? "done"
                : visibleFeedback.state === "refused"
                  ? `— ${visibleFeedback.reason ?? "not done"}`
                  : "— no answer from the host window"}
          </span>
        </div>
      )}
    </div>
  );
};

export default RemoteControlScreen;
