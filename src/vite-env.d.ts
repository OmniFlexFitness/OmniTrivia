/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANTHROPIC_API_KEY: string;
  readonly VITE_ANTHROPIC_WORKSPACE_ID: string;

  /**
   * A server that holds the Anthropic key, so the deployed site can generate
   * questions without shipping one. See `worker/`.
   */
  readonly VITE_ANTHROPIC_PROXY_URL: string;

  /**
   * Firebase, which is what lets phones in the room join the host's game.
   * Absent, the app still runs — same-browser play only. These are public
   * values by design: a Firebase web config identifies the project, and the
   * database rules are what protect it.
   */
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_DATABASE_URL: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;

  /** `host:port` of a local Firebase emulator, for development and tests. */
  readonly VITE_FIREBASE_EMULATOR_HOST: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
