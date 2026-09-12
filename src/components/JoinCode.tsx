import React from "react";
import QRCode from "react-qr-code";
import { joinUrl } from "../services/broadcastBus";

/**
 * The two ways into a room: scan the code, or type the PIN.
 *
 * The QR encodes the app's own URL with `?pin=` already filled in, so a scan
 * lands on the join screen with nothing left to type.
 */
const JoinCode: React.FC<{
  pin: string;
  size?: "md" | "lg";
  showUrl?: boolean;
}> = ({ pin, size = "md", showUrl = true }) => {
  const url = joinUrl(pin);
  const box = size === "lg" ? 220 : 132;

  return (
    <div className="flex items-center gap-6">
      <div
        className="bg-white rounded-xl p-3 shrink-0"
        style={{ width: box, height: box }}
      >
        {/* The library sets its own viewBox from the matrix; it just needs
            to be told to fill the box we gave it. */}
        <QRCode value={url} style={{ height: "100%", width: "100%" }} />
      </div>

      <div className="min-w-0">
        <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-slate-500">
          Game PIN
        </div>
        <div
          className={`font-mono font-black tracking-[0.2em] text-white text-neon-shadow ${
            size === "lg" ? "text-7xl" : "text-4xl"
          }`}
        >
          {pin}
        </div>
        {showUrl && (
          <div className="mt-2 text-xs text-slate-500 break-all max-w-xs">
            {url}
          </div>
        )}
      </div>
    </div>
  );
};

export default JoinCode;
