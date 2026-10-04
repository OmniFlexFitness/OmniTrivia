/**
 * The built-in maps a pin question can be asked on, as geometry.
 *
 * A pin question needs a picture and a spot on it. For "where is Lake
 * Titicaca?" nobody should have to find a map, upload it somewhere and
 * measure pixels, so two maps ship with the game — the world and the lower 48
 * states — and a question written against one of them gives its answer as a
 * latitude and longitude instead. This module is what turns one into the
 * other.
 *
 * It is the single source of truth for that, on purpose: the script that drew
 * the maps (`scripts/generate-maps.mjs`) imports this same file to project
 * the coastlines, so a city's coordinates land on the city on the drawing and
 * not a few pixels into the sea. That is also why it imports nothing — Node
 * runs it directly, with no bundler in the way.
 *
 * Every map is drawn in its own viewBox, 1000 units wide. A pin is stored as
 * a fraction of that box (0–1 across, 0–1 down), so the same answer means the
 * same spot at any size the map is drawn.
 */

export type MapKey = "world" | "usa";

export interface MapFrame {
  key: MapKey;
  /** What the map is called on a host's screen. */
  name: string;
  /** The viewBox the map's paths are drawn in. */
  width: number;
  height: number;
  /** Latitude/longitude in degrees to viewBox units. */
  project: (lat: number, lng: number) => [number, number];
  /** viewBox units back to latitude/longitude in degrees. */
  invert: (x: number, y: number) => [number, number];
}

const RAD = Math.PI / 180;
const MAP_WIDTH = 1000;

/* ------------------------------------------------------------------ *
 * The world: plate carrée, cropped
 *
 * Equirectangular is the projection a room recognises as "the world map",
 * and it keeps a degree the same size in both directions, which makes a pin
 * radius mean the same thing everywhere on it. Antarctica is cropped off: it
 * would take a quarter of the height of a phone screen to show a continent
 * almost no question is about.
 * ------------------------------------------------------------------ */

const WORLD_NORTH = 84;
const WORLD_SOUTH = -58;
const WORLD_UNITS_PER_DEGREE = MAP_WIDTH / 360;

const world: MapFrame = {
  key: "world",
  name: "World map",
  width: MAP_WIDTH,
  height: (WORLD_NORTH - WORLD_SOUTH) * WORLD_UNITS_PER_DEGREE,
  project: (lat, lng) => [
    (lng + 180) * WORLD_UNITS_PER_DEGREE,
    (WORLD_NORTH - lat) * WORLD_UNITS_PER_DEGREE,
  ],
  invert: (x, y) => [
    WORLD_NORTH - y / WORLD_UNITS_PER_DEGREE,
    x / WORLD_UNITS_PER_DEGREE - 180,
  ],
};

/* ------------------------------------------------------------------ *
 * The lower 48: Albers equal-area conic
 *
 * The projection every US map in an atlas is drawn in — standard parallels
 * 29.5° and 45.5°, centred on 96°W — so the states have the shapes people
 * know. Alaska and Hawaii are left off rather than drawn as insets: an inset
 * is a box with a different scale, and a pin dropped across its edge would
 * not mean anything.
 * ------------------------------------------------------------------ */

const ALBERS_N = (Math.sin(29.5 * RAD) + Math.sin(45.5 * RAD)) / 2;
const ALBERS_C = Math.cos(29.5 * RAD) ** 2 + 2 * ALBERS_N * Math.sin(29.5 * RAD);
const ALBERS_RHO0 = Math.sqrt(ALBERS_C - 2 * ALBERS_N * Math.sin(37.5 * RAD)) / ALBERS_N;
const ALBERS_LNG0 = -96;

/** The raw projection, on a unit sphere, y pointing north. */
export const albersRaw = (lat: number, lng: number): [number, number] => {
  const rho = Math.sqrt(ALBERS_C - 2 * ALBERS_N * Math.sin(lat * RAD)) / ALBERS_N;
  const theta = ALBERS_N * (lng - ALBERS_LNG0) * RAD;
  return [rho * Math.sin(theta), ALBERS_RHO0 - rho * Math.cos(theta)];
};

const albersRawInvert = (x: number, y: number): [number, number] => {
  const dy = ALBERS_RHO0 - y;
  const rho = Math.sign(ALBERS_N) * Math.sqrt(x * x + dy * dy);
  const theta = Math.atan2(x, dy);
  const sinLat = (ALBERS_C - (rho * ALBERS_N) ** 2) / (2 * ALBERS_N);
  return [
    Math.asin(Math.max(-1, Math.min(1, sinLat))) / RAD,
    theta / ALBERS_N / RAD + ALBERS_LNG0,
  ];
};

/**
 * Where the lower 48 sit inside the raw projection, padded a little. These
 * are the drawing's bounds — `scripts/generate-maps.mjs` measures them from
 * the coastline and refuses to write a map that disagrees with them.
 */
export const USA_FIT = {
  minX: -0.3789,
  maxX: 0.3632,
  minY: -0.2206,
  maxY: 0.2559,
};

const USA_SCALE = MAP_WIDTH / (USA_FIT.maxX - USA_FIT.minX);

const usa: MapFrame = {
  key: "usa",
  name: "US map",
  width: MAP_WIDTH,
  height: (USA_FIT.maxY - USA_FIT.minY) * USA_SCALE,
  project: (lat, lng) => {
    const [x, y] = albersRaw(lat, lng);
    return [(x - USA_FIT.minX) * USA_SCALE, (USA_FIT.maxY - y) * USA_SCALE];
  },
  invert: (x, y) =>
    albersRawInvert(x / USA_SCALE + USA_FIT.minX, USA_FIT.maxY - y / USA_SCALE),
};

export const MAP_FRAMES: Record<MapKey, MapFrame> = { world, usa };

/** How a built-in map is named in a question's `image`. */
export const MAP_PREFIX = "map:";

/**
 * Which built-in map a picture reference means, if any.
 *
 * Generous about spelling, because it is typed into a spreadsheet: "world",
 * "World map", "map:world", "USA", "US", "United States" and "us map" all
 * resolve. Anything that looks like a URL is a picture, never a map.
 */
export const mapKeyFor = (reference: string | undefined | null): MapKey | null => {
  if (!reference) return null;
  const key = reference
    .trim()
    .toLowerCase()
    .replace(/^map:\s*/, "")
    .replace(/\s*map$/, "")
    .replace(/[\s._-]+/g, "");
  if (!key || /^(https?:|data:|\/)/.test(reference.trim())) return null;
  if (key === "world" || key === "earth" || key === "globe") return "world";
  if (["usa", "us", "unitedstates", "america", "lower48", "conus"].includes(key)) {
    return "usa";
  }
  return null;
};

/** A map's frame from a question's `image`, or null for any other picture. */
export const mapFrameFor = (reference: string | undefined | null): MapFrame | null => {
  const key = mapKeyFor(reference);
  return key ? MAP_FRAMES[key] : null;
};

/** Height over width, which is what a pin's distances are measured with. */
export const mapAspect = (frame: MapFrame): number => frame.height / frame.width;

/** Kilometres in one degree of latitude, which is the same everywhere. */
const KM_PER_DEGREE_LAT = 111.32;

/**
 * A spot and a radius in kilometres, as a pin target on one of these maps.
 *
 * The radius is measured north–south at the target, where both maps keep
 * true scale well enough for a trivia question, and expressed as a fraction
 * of the map's width — the unit every pin is graded in. Returns null for a
 * spot that is off the map (Honolulu on the lower 48).
 */
export const geoPinTarget = (
  frame: MapFrame,
  lat: number,
  lng: number,
  radiusKm: number,
): { x: number; y: number; radius: number } | null => {
  if (![lat, lng, radiusKm].every(Number.isFinite)) return null;
  const [x, y] = frame.project(lat, lng);
  if (x < 0 || x > frame.width || y < 0 || y > frame.height) return null;

  // A short hop north, measured on the drawing, gives the local scale.
  const step = 0.5;
  const [nx, ny] = frame.project(lat + step, lng);
  const unitsPerKm = Math.hypot(nx - x, ny - y) / (step * KM_PER_DEGREE_LAT);

  return {
    x: x / frame.width,
    y: y / frame.height,
    radius: (Math.max(1, radiusKm) * unitsPerKm) / frame.width,
  };
};

/** The latitude/longitude under a pin, for describing it on a screen. */
export const pinToLatLng = (
  frame: MapFrame,
  x: number,
  y: number,
): [number, number] => frame.invert(x * frame.width, y * frame.height);

/**
 * A pin target on one of these maps, back as latitude, longitude and a
 * radius in kilometres — the inverse of `geoPinTarget`, for writing a
 * question back out to a spreadsheet in the units it was written in.
 */
export const geoFromPinTarget = (
  frame: MapFrame,
  pin: { x: number; y: number; radius: number },
): { lat: number; lng: number; km: number } => {
  const [lat, lng] = pinToLatLng(frame, pin.x, pin.y);
  const [x, y] = frame.project(lat, lng);
  const step = 0.5;
  const [nx, ny] = frame.project(lat + step, lng);
  const unitsPerKm = Math.hypot(nx - x, ny - y) / (step * KM_PER_DEGREE_LAT);
  return { lat, lng, km: (pin.radius * frame.width) / unitsPerKm };
};
