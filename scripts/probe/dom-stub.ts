/**
 * The transport reaches for browser globals: `localStorage` for the room
 * registry and the stored snapshot, `addEventListener` for cross-tab storage
 * events. Node has neither, and the probe is not testing them — it is testing
 * what happens over the network — so they are stubbed just far enough that
 * the same code runs unmodified.
 */
const store = new Map<string, string>();

const shim = {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  location: { href: "http://localhost/", search: "" },
};

Object.assign(globalThis, { window: shim, localStorage: shim.localStorage });

export {};
