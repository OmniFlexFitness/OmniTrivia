import React from "react";

/**
 * The last thing between a crash and a blank screen.
 *
 * React unmounts the whole tree when a render throws, so without this a single
 * bad read — a field that moved, a list that arrived empty — takes the entire
 * page down to the background colour. That is the worst possible failure for
 * this app: it happens on somebody's phone, in the middle of a round, and it
 * looks exactly like a dead connection. Nobody in the room can tell you what
 * went wrong, because there is nothing on the screen to tell you.
 *
 * So a crash gets a screen of its own: what broke, and the two things worth
 * trying. The message is deliberately in plain words at the top, with the
 * technical line underneath for whoever is running the game.
 */

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

const reload = () => {
  // A crash caused by a half-updated build is fixed by getting the current
  // one, so this reload skips the cache the same way the boot guard does.
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("v", Date.now().toString(36));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
};

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Kept in the console for whoever opens it, since there is no server to
    // send it to.
    console.error("OmniTrivia crashed while rendering:", error, info);
  }

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center gap-4">
        <div className="text-3xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-neon-blue to-neon-pink">
          OMNI<span className="text-white">TRIVIA</span>
        </div>

        <h1 className="text-2xl font-bold">This screen stopped working</h1>

        <p className="text-slate-400 max-w-md">
          Reloading usually fixes it — most often this happens when the page has
          been open since before the game was last updated.
        </p>

        <button
          onClick={reload}
          className="mt-2 px-6 py-3 rounded-xl border-2 border-neon-pink text-neon-pink font-bold hover:bg-neon-pink hover:text-white transition-colors"
        >
          RELOAD
        </button>

        <p className="text-xs font-mono text-slate-600 max-w-lg break-words mt-4">
          {error.message}
        </p>
      </div>
    );
  }
}

export default ErrorBoundary;
