/**
 * Draws the two built-in maps pin questions can be asked on.
 *
 *   npm i --no-save world-atlas@2 us-atlas@3 topojson-client@3 topojson-simplify@3
 *   node scripts/generate-maps.mjs
 *
 * Writes `src/assets/mapPaths.ts`: the world's land and country borders, and
 * the lower 48 states, as SVG path data. The output is committed, so nobody
 * needs to run this to play — only to redraw a map.
 *
 * Sources, both public domain:
 *   - world-atlas: Natural Earth 1:110m admin-0 countries
 *   - us-atlas:    US Census Bureau cartographic boundaries, 1:10m states
 *
 * The coastlines are projected through `src/services/mapProjection.ts` — the
 * same file the game uses to put a question's latitude and longitude on the
 * drawing. Node runs that TypeScript directly (22.18 or later), so the map a
 * player pins and the spot a question is graded against cannot drift apart.
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAP_FRAMES,
  USA_FIT,
  albersRaw,
} from "../src/services/mapProjection.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

let topojson;
let simplifier;
try {
  topojson = require("topojson-client");
  simplifier = require("topojson-simplify");
} catch {
  console.error(
    "\n  The map sources are not installed. Run this first (it does not touch package.json):\n" +
      "    npm i --no-save world-atlas@2 us-atlas@3 topojson-client@3 topojson-simplify@3\n",
  );
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * Path writing
 * ------------------------------------------------------------------ */

/** One decimal of a 1000-unit map is a tenth of a pixel on a 1000px screen. */
const round = (value) => Math.round(value * 10) / 10;

/**
 * A ring or line as compact path data: an absolute move, then relative steps,
 * with steps that round to nothing dropped. Relative steps are what keep the
 * file small — most of them are a unit or two.
 */
const pathFor = (points, project, close) => {
  let out = "";
  let last = null;
  for (const [lng, lat] of points) {
    const [x, y] = project(lat, lng).map(round);
    if (!last) {
      out += `M${x} ${y}`;
    } else {
      const dx = round(x - last[0]);
      const dy = round(y - last[1]);
      if (dx === 0 && dy === 0) continue;
      out += `l${dx} ${dy}`;
    }
    last = [x, y];
  }
  return close ? `${out}z` : out;
};

/**
 * A ring that crosses the antimeridian (Chukotka, Fiji), drawn whole.
 *
 * Its longitudes jump from +180 to −180 halfway round, and drawn as they come
 * that jump is a line straight across the map. Unwrapped into one continuous
 * run it lands partly off one edge of the drawing, so it is drawn a second
 * time a world-width over: each copy shows the half the other one is missing,
 * and the map's own edge clips the rest.
 */
const unwrapped = (points) => {
  const out = [];
  let offset = 0;
  for (let i = 0; i < points.length; i++) {
    const [lng, lat] = points[i];
    if (i > 0) {
      const jump = lng + offset - out[i - 1][0];
      if (jump > 180) offset -= 360;
      else if (jump < -180) offset += 360;
    }
    out.push([lng + offset, lat]);
  }
  const lngs = out.map(([lng]) => lng);
  const copies = [out];
  if (Math.max(...lngs) > 180) copies.push(out.map(([lng, lat]) => [lng - 360, lat]));
  if (Math.min(...lngs) < -180) copies.push(out.map(([lng, lat]) => [lng + 360, lat]));
  return copies;
};

const polygonsPath = (geometry, project) => {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons
    .flatMap((rings) =>
      rings.flatMap((ring) => unwrapped(ring).map((copy) => pathFor(copy, project, true))),
    )
    .join("");
};

const linesPath = (geometry, project) => {
  const lines =
    geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  return lines
    .flatMap((line) => unwrapped(line).map((copy) => pathFor(copy, project, false)))
    .join("");
};

/** Simplified topology keeping roughly `keep` of its points. */
const simplified = (topology, keep) => {
  const pre = simplifier.presimplify(topology);
  return simplifier.simplify(pre, simplifier.quantile(pre, 1 - keep));
};

/* ------------------------------------------------------------------ *
 * The world
 * ------------------------------------------------------------------ */

const worldTopology = simplified(require("world-atlas/countries-110m.json"), 0.85);
const ANTARCTICA = "010";
const countries = worldTopology.objects.countries.geometries.filter(
  (country) => country.id !== ANTARCTICA,
);
const worldProject = MAP_FRAMES.world.project;

const worldLand = polygonsPath(topojson.merge(worldTopology, countries), worldProject);
const worldBorders = linesPath(
  topojson.mesh(
    worldTopology,
    { type: "GeometryCollection", geometries: countries },
    (a, b) => a !== b,
  ),
  worldProject,
);

/* ------------------------------------------------------------------ *
 * The lower 48
 * ------------------------------------------------------------------ */

// Alaska, Hawaii and the territories: nothing a lower-48 map can draw.
const OFF_MAP = new Set(["02", "15", "60", "66", "69", "72", "78"]);
const usTopology = simplified(require("us-atlas/states-10m.json"), 0.12);
const states = usTopology.objects.states.geometries.filter(
  (state) => !OFF_MAP.has(state.id),
);
const statesCollection = { type: "GeometryCollection", geometries: states };

// The drawing's bounds have to be the bounds the game projects with. Measure
// them from the coastline and refuse to write a map that disagrees.
const outline = topojson.merge(usTopology, states);
let minX = Infinity;
let maxX = -Infinity;
let minY = Infinity;
let maxY = -Infinity;
for (const polygon of outline.coordinates) {
  for (const ring of polygon) {
    for (const [lng, lat] of ring) {
      const [x, y] = albersRaw(lat, lng);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
}
const PAD = 0.01;
const measured = {
  minX: Math.floor((minX - PAD) * 1e4) / 1e4,
  maxX: Math.ceil((maxX + PAD) * 1e4) / 1e4,
  minY: Math.floor((minY - PAD) * 1e4) / 1e4,
  maxY: Math.ceil((maxY + PAD) * 1e4) / 1e4,
};
const fitDrifted = Object.keys(measured).some(
  (key) => Math.abs(measured[key] - USA_FIT[key]) > 1e-4,
);
if (fitDrifted) {
  console.error(
    "\n  USA_FIT in src/services/mapProjection.ts does not match the coastline.\n" +
      "  Set it to the following and run this again:\n\n" +
      `  export const USA_FIT = ${JSON.stringify(measured, null, 2).replace(/"/g, "")};\n`,
  );
  process.exit(1);
}

const usaProject = MAP_FRAMES.usa.project;
const usaLand = polygonsPath(outline, usaProject);
const usaBorders = linesPath(
  topojson.mesh(usTopology, statesCollection, (a, b) => a !== b),
  usaProject,
);

/* ------------------------------------------------------------------ *
 * Writing it out
 * ------------------------------------------------------------------ */

const file = `/**
 * Generated by scripts/generate-maps.mjs — do not edit by hand.
 *
 * The built-in maps pin questions are asked on, as SVG path data in each
 * map's viewBox (see src/services/mapProjection.ts for the projections).
 *
 * World: Natural Earth 1:110m admin-0 countries, via world-atlas. Public domain.
 * USA:   US Census Bureau cartographic boundaries, 1:10m, via us-atlas. Public domain.
 *
 * Loaded on demand: a game with no map question never downloads it.
 */
import type { MapKey } from "../services/mapProjection";

export interface MapPaths {
  /** Filled: every landmass. */
  land: string;
  /** Stroked: the borders inside it. */
  borders: string;
}

export const MAP_PATHS: Record<MapKey, MapPaths> = {
  world: {
    land: ${JSON.stringify(worldLand)},
    borders: ${JSON.stringify(worldBorders)},
  },
  usa: {
    land: ${JSON.stringify(usaLand)},
    borders: ${JSON.stringify(usaBorders)},
  },
};
`;

const out = join(root, "src", "assets", "mapPaths.ts");
writeFileSync(out, file);

const kb = (value) => `${(value.length / 1024).toFixed(1)} KB`;
console.log(`wrote ${out}`);
console.log(`  world: land ${kb(worldLand)}, borders ${kb(worldBorders)}`);
console.log(`  usa:   land ${kb(usaLand)}, borders ${kb(usaBorders)}`);
console.log(`  total ${kb(file)}`);
