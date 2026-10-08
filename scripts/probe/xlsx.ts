/**
 * The tabs of an .xlsx workbook as rows of text, with no dependency.
 *
 * Just enough to read back `questions.template.xlsx`, which the template
 * generator writes and the question-type probe checks: a workbook is a zip of
 * XML, Node can inflate the zip, and the cells the generator writes are inline
 * strings and plain numbers. Shared strings are read too, so a copy re-saved by
 * Excel still reads. Formulas, dates and rich formatting are not this file's
 * business.
 */
import { inflateRawSync } from "node:zlib";

/** Every file in a zip archive, by name. */
const unzip = (archive: Buffer): Map<string, Buffer> => {
  const files = new Map<string, Buffer>();
  // The end-of-central-directory record is the last thing in the file, give
  // or take a comment of up to 64 KB.
  let end = archive.length - 22;
  while (end >= 0 && archive.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("not a zip archive");

  const count = archive.readUInt16LE(end + 10);
  let entry = archive.readUInt32LE(end + 16);
  for (let i = 0; i < count; i += 1) {
    if (archive.readUInt32LE(entry) !== 0x02014b50) throw new Error("bad zip directory");
    const method = archive.readUInt16LE(entry + 10);
    const size = archive.readUInt32LE(entry + 20);
    const nameLength = archive.readUInt16LE(entry + 28);
    const extraLength = archive.readUInt16LE(entry + 30);
    const commentLength = archive.readUInt16LE(entry + 32);
    const local = archive.readUInt32LE(entry + 42);
    const name = archive.toString("utf8", entry + 46, entry + 46 + nameLength);

    const start =
      local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
    const raw = archive.subarray(start, start + size);
    files.set(name, method === 8 ? inflateRawSync(raw) : Buffer.from(raw));

    entry += 46 + nameLength + extraLength + commentLength;
  }
  return files;
};

const decode = (text: string): string =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");

/** The text of every `<t>` inside a fragment, joined: a rich run reads whole. */
const textOf = (xml: string): string =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((m) => decode(m[1])).join("");

/** "C" is column 2 (zero-based), "AA" is 26. */
const columnIndex = (ref: string): number =>
  [...ref.replace(/\d+$/, "")].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0) - 1;

export interface Tab {
  name: string;
  /** Rows top to bottom, cells left to right, empty cells as "". */
  rows: string[][];
}

/** Every tab of the workbook, in the order the tabs are shown. */
export const readWorkbook = (archive: Buffer): Tab[] => {
  const files = unzip(archive);
  const read = (name: string): string => {
    const file = files.get(name);
    if (!file) throw new Error(`workbook has no ${name}`);
    return file.toString("utf8");
  };

  const shared = files.has("xl/sharedStrings.xml")
    ? [...read("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
    : [];

  const targets = new Map(
    [...read("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map((m) => [
      /Id="([^"]+)"/.exec(m[0])?.[1],
      (/Target="([^"]+)"/.exec(m[0])?.[1] ?? "").replace(/^\/?(xl\/)?/, "xl/"),
    ]),
  );

  return [...read("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const name = decode(/name="([^"]*)"/.exec(m[0])?.[1] ?? "");
    const id = /r:id="([^"]+)"/.exec(m[0])?.[1];
    const xml = read(targets.get(id) ?? "");

    const rows: string[][] = [];
    for (const row of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const cells: string[] = [];
      for (const cell of (row[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attributes = cell[1];
        const body = cell[2] ?? "";
        const ref = /\br="([A-Z]+\d+)"/.exec(attributes)?.[1] ?? "";
        const type = /\bt="([^"]+)"/.exec(attributes)?.[1] ?? "n";
        const value = /<v>([^<]*)<\/v>/.exec(body)?.[1];
        const text =
          type === "inlineStr"
            ? textOf(body)
            : type === "s"
              ? shared[Number(value)] ?? ""
              : value === undefined
                ? ""
                : decode(value);
        const column = ref ? columnIndex(ref) : cells.length;
        while (cells.length < column) cells.push("");
        cells[column] = text;
      }
      rows.push(cells);
    }
    return { name, rows };
  });
};

/**
 * One line of a CSV file as cells: commas split, double quotes group, and a
 * doubled quote inside quotes is one quote. Lines only — the format forbids
 * line breaks inside a cell, so nothing here has to cope with one.
 */
export const csvCells = (line: string): string[] => {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted && char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
};
