import { defineConfig, loadEnv, Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite inlines VITE_* values into the code it serves, so a LAN-bound dev server
 * hands the Anthropic key to every device that opens the Network URL. That is the
 * accepted trade for local play, but the host should be told, not surprised.
 */
const warnOnExposedKey = (apiKey: string): Plugin => ({
  name: "omnitrivia-warn-exposed-key",
  apply: "serve",
  configureServer(server) {
    server.httpServer?.once("listening", () => {
      // `host` is `true` for every interface, a string for an explicit bind, or
      // undefined/false for loopback only. Only the first two can reach the LAN,
      // and a string still counts as loopback when it names one.
      const host = server.config.server.host;
      const loopback = ["localhost", "127.0.0.1", "::1"];
      const lanBound =
        host === true ||
        (typeof host === "string" && !loopback.includes(host.toLowerCase()));

      if (!apiKey) {
        // The app's only symptom is placeholder questions on the review
        // screen, which reads as a broken app rather than a missing file.
        // On Windows the usual cause is Notepad saving ".env" as ".env.txt".
        server.config.logger.warn(
          [
            "",
            "  No VITE_ANTHROPIC_API_KEY found, so GENERATE & REVIEW will only",
            "  produce placeholder questions. Put your key in a file named",
            "  exactly `.env` next to package.json and restart this server:",
            "",
            "    VITE_ANTHROPIC_API_KEY=sk-ant-...",
            "    VITE_ANTHROPIC_WORKSPACE_ID=wrkspc_...   (identity-linked keys only)",
            "",
            "  Or skip the key entirely: HOST GAME > IMPORT MY OWN QUESTIONS.",
            "",
          ].join("\n"),
        );
        return;
      }

      if (!lanBound) return;
      server.config.logger.warn(
        [
          "",
          "  WARNING: VITE_ANTHROPIC_API_KEY is readable by anyone on this network.",
          "  The dev server is bound to all interfaces, and Vite inlines the key",
          "  into the code it serves, so any device that opens the Network URL",
          "  can read it and spend against your Anthropic account.",
          "  Give the key a low spend limit in the Anthropic Console, or use",
          "  `npm run dev:local` on an untrusted network. See LOCAL_PLAY.md.",
          "",
        ].join("\n"),
      );
    });
  },
});

export default defineConfig(({ mode }) => {
  // Third arg "" loads every var, not just the VITE_ prefixed ones, so this
  // check does not itself depend on the prefix convention.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), warnOnExposedKey(env.VITE_ANTHROPIC_API_KEY)],
    server: {
      // Bind to every interface so phones/laptops on the same Wi-Fi can reach
      // the dev server at http://<host-lan-ip>:5173
      host: true,
      port: 5173,
      strictPort: true,
      open: true,
    },
    preview: {
      host: true,
      port: 4173,
      strictPort: true,
    },
    build: {
      outDir: "dist",
      sourcemap: true,
    },
  };
});
