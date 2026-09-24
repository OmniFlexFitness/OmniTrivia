import React, { useState } from "react";
import QRCode from "react-qr-code";
import { useGame } from "../context/GameContext";
import {
  canReachOtherDevices,
  castUrl,
  remoteUrl,
} from "../services/broadcastBus";
import { Check, Copy, KeyRound, Monitor, Tablet, Tv, X } from "lucide-react";

/**
 * Hosting from more than one screen.
 *
 * The laptop running the game does not have to be the only screen the host
 * uses. The broadcast can go up on any device with a browser — a smart TV, a
 * second laptop by the projector — and the round can be run from a tablet
 * while the host walks the room. Both reach the game by PIN over the network,
 * the way a phone does, and this is where the links to them live.
 *
 * The laptop still runs the game in both cases, so it has to stay open (not
 * minimised: a hidden tab's clock is slowed down by the browser).
 */

const CopyLink: React.FC<{ url: string }> = ({ url }) => {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(url).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => undefined,
        );
      }}
      className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-slate-400 hover:text-white"
    >
      {copied ? <Check size={12} className="text-neon-green" /> : <Copy size={12} />}
      {copied ? "copied" : "copy link"}
    </button>
  );
};

const LinkCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  url: string;
  children: React.ReactNode;
}> = ({ icon, title, url, children }) => (
  <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-3">
    <div className="flex items-center gap-2 font-bold text-white">
      {icon} {title}
    </div>
    <div className="flex gap-4 items-start">
      <div className="bg-white rounded-lg p-2 shrink-0 w-28 h-28">
        <QRCode value={url} style={{ width: "100%", height: "100%" }} />
      </div>
      <div className="min-w-0 space-y-2 text-sm text-slate-400">{children}</div>
    </div>
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-slate-500 break-all">{url}</span>
      <CopyLink url={url} />
    </div>
  </div>
);

const HostScreensPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { gamePin, remotes, broadcastConnected, openBroadcast } = useGame();
  const networked = canReachOtherDevices();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto custom-scrollbar bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-white">OTHER SCREENS</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-slate-400">
          This window runs the game wherever else it is shown or controlled
          from, so keep it open — and not minimised, which slows a browser's
          clock down.
        </p>

        {/* The one that needs no network: a second window of this browser,
            dragged onto the projector. */}
        <div className="flex flex-wrap items-center gap-3 bg-slate-900 border border-slate-700 rounded-2xl p-4">
          <Monitor size={20} className="text-neon-blue" />
          <div className="flex-1 min-w-[12rem] text-sm text-slate-400">
            <span className="block font-bold text-white">On this machine</span>
            A second window for a projector plugged into this laptop.
          </div>
          <button
            onClick={openBroadcast}
            className={`px-4 py-2 rounded-lg border text-sm font-bold ${
              broadcastConnected
                ? "border-neon-green text-neon-green bg-neon-green/10"
                : "border-neon-pink text-neon-pink bg-neon-pink/10"
            }`}
          >
            {broadcastConnected ? "BROADCAST LIVE" : "OPEN BROADCAST DISPLAY"}
          </button>
        </div>

        {!gamePin ? null : !networked ? (
          <p className="text-sm text-amber-300 border border-amber-500/40 bg-amber-500/10 rounded-lg px-3 py-2">
            Other devices need multiplayer set up — without it, the broadcast
            and the remote only work as windows of this same browser. See
            MULTIPLAYER.md.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <LinkCard
              icon={<Tv size={18} className="text-neon-blue" />}
              title="Broadcast on another device"
              url={castUrl(gamePin)}
            >
              <p>
                Open this on the TV's browser or the laptop by the projector,
                then go full screen. It follows this game by PIN and shows
                exactly what the room screen shows — no controls, no answers.
              </p>
              <p>
                On a screen with no camera, open the site with
                <span className="font-mono text-slate-300"> ?view=broadcast</span> and
                type PIN <span className="font-mono text-white">{gamePin}</span>.
              </p>
            </LinkCard>

            <LinkCard
              icon={<Tablet size={18} className="text-neon-yellow" />}
              title="Remote for your tablet"
              url={remoteUrl(gamePin)}
            >
              <p>
                Scan with your iPad to run the round from the floor: spin the
                wheel, pause a table, end the round, start the next one.
              </p>
              <p className="flex items-start gap-1.5">
                <KeyRound size={13} className="shrink-0 mt-0.5 text-neon-yellow" />
                It asks for the host password. Anyone who scans this without it
                gets nothing.
              </p>
            </LinkCard>
          </div>
        )}

        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4">
          <div className="text-xs font-mono uppercase tracking-[0.2em] text-slate-400 mb-2">
            Remotes connected
          </div>
          {remotes.length === 0 ? (
            <p className="text-sm text-slate-500">None right now.</p>
          ) : (
            <ul className="space-y-1">
              {remotes.map((remote) => (
                <li
                  key={remote.controllerId}
                  className="flex items-center gap-2 text-sm text-neon-green"
                >
                  <Tablet size={14} /> {remote.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default HostScreensPanel;
