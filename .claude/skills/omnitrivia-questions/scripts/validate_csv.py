#!/usr/bin/env python3
"""Check an OmniTrivia question CSV before it goes anywhere near a room.

Usage:
    python validate_csv.py questions-science-school.csv [more files...]

The script checks two kinds of thing:

  1. What the game's importer checks, so that no row is silently dropped at
     import: the header, the field count, the required cells, a correct answer
     that matches an option, numeric slider and pin cells, the shape of puzzle,
     match and sort rows, double quotes inside text.
  2. What the importer cannot check for you: the format mix, a format used
     twice in one file, duplicate questions, over-long questions, an empty
     explanation, the difficulty column.

Errors (printed as "ERROR") mean a row the game would drop or play wrongly;
fix them all. Warnings ("warn") mean a row that will probably play badly; read
each one and decide. Exit status is 1 when any file has errors.

Only the standard library is used, so it runs anywhere Python 3.8+ does.
"""

from __future__ import annotations

import csv
import math
import re
import sys
from collections import Counter
from pathlib import Path

HEADER = [
    "type", "category", "question",
    "option1", "option2", "option3", "option4", "option5", "option6",
    "correctAnswer", "explanation", "image", "margin", "unit", "timeLimit",
    "difficulty",
]
GAME_COLUMNS = 15  # the importer reads these; "difficulty" is ours

TYPES = {
    "MULTIPLE_CHOICE", "TRUE_FALSE", "MULTI_SELECT", "SLIDER", "RANGE",
    "NUMBER", "PIN", "PUZZLE", "MATCH", "CATEGORIZE", "SCRAMBLE",
    "TYPE_ANSWER",
}
BACKBONE = {"MULTIPLE_CHOICE", "TRUE_FALSE"}
LEVELS = {"everyday", "school", "quiz"}
MARGINS = {"none", "low", "medium", "high", "maximum"}
PIN_MAPS = {"world", "usa"}

QUESTION_SOFT_LIMIT = 90   # chars; the brief asks for under this
QUESTION_HARD_LIMIT = 160  # past this the clock is mostly reading time


class Report:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, line: int, text: str) -> None:
        self.errors.append(f"  ERROR line {line}: {text}")

    def warn(self, line: int, text: str) -> None:
        self.warnings.append(f"  warn  line {line}: {text}")


def number(value: str) -> float | None:
    """A plain number, or None. Thousands separators are a mistake here."""
    value = value.strip()
    if not value:
        return None
    if "," in value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def leading_number(value: str) -> float | None:
    """The first number in a cell, the way the game reads a slider answer."""
    cleaned = re.sub(r"(\d),(?=\d{3}\b)", r"\1", value)
    match = re.search(r"-?\d*\.?\d+(?:e[+-]?\d+)?", cleaned, re.I)
    return float(match.group(0)) if match else None


def options(row: dict, upto: int = 6) -> list[str]:
    return [row[f"option{i}"].strip() for i in range(1, upto + 1)]


def check_empty_options(rep: Report, line: int, row: dict, first: int, label: str) -> None:
    for i in range(first, 7):
        if row[f"option{i}"].strip():
            rep.error(line, f"{label}: option{i} must be empty")


def check_pairs(rep: Report, line: int, cells: list[str], label: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for i, cell in enumerate(cells, start=1):
        if not cell:
            rep.error(line, f"{label}: option{i} is empty")
            continue
        if cell.count("=") != 1:
            rep.error(line, f"{label}: option{i} must be written 'item = partner' with one '=': {cell!r}")
            continue
        left, right = (part.strip() for part in cell.split("="))
        if not left or not right:
            rep.error(line, f"{label}: option{i} has an empty side: {cell!r}")
            continue
        if "|" in cell:
            rep.error(line, f"{label}: option{i} contains '|', which the game treats as a separator")
        pairs.append((left, right))
    return pairs


def validate_row(rep: Report, line: int, row: dict, seen_questions: dict, seen_answers: dict) -> str | None:
    qtype = row["type"].strip()
    category = row["category"].strip()
    question = row["question"].strip()
    answer = row["correctAnswer"].strip()
    explanation = row["explanation"].strip()

    # Fields the importer requires on every row.
    if qtype not in TYPES:
        rep.error(line, f"unknown type {qtype!r}; one of {', '.join(sorted(TYPES))}")
        return None
    if not category:
        rep.error(line, "category is empty; the row would be dropped")
    if not question:
        rep.error(line, "question is empty; the row would be dropped")
    if not answer:
        rep.error(line, "correctAnswer is empty; the row would be dropped")

    # Text hygiene.
    for key in HEADER:
        value = row.get(key, "")
        if "\n" in value or "\r" in value:
            rep.error(line, f"{key} contains a line break")
        if '"' in value:
            rep.error(line, f"{key} contains a double-quote character; use single quotes inside text")
    if len(question) > QUESTION_HARD_LIMIT:
        rep.error(line, f"question is {len(question)} characters; keep it to one plain sentence")
    elif len(question) > QUESTION_SOFT_LIMIT:
        rep.warn(line, f"question is {len(question)} characters (aim for under {QUESTION_SOFT_LIMIT})")
    if not explanation:
        rep.warn(line, "explanation is empty; the host reads it aloud after the answer")
    if "not " in question.lower() and " never " in question.lower():
        rep.warn(line, "possible double negative in the question")

    # Our own columns.
    level = row["difficulty"].strip().lower()
    if level and level not in LEVELS:
        rep.error(line, f"difficulty {row['difficulty']!r} must be everyday, school or quiz")
    elif not level and "difficulty" in row.get("_present", "difficulty"):
        rep.warn(line, "difficulty is empty; write the level on every row so the sheet can be filtered")

    image = row["image"].strip().lower()
    margin = row["margin"].strip().lower()
    unit = row["unit"].strip()
    time_limit = row["timeLimit"].strip()
    if time_limit and number(time_limit) is None:
        rep.error(line, f"timeLimit {time_limit!r} is not a number")
    if margin and margin not in MARGINS:
        rep.error(line, f"margin {row['margin']!r} must be low, medium or high (or empty)")
    if image and qtype != "PIN":
        rep.warn(line, f"image is set on a {qtype} row; only PIN uses it")
    if margin and qtype != "SLIDER":
        rep.warn(line, f"margin is set on a {qtype} row; only SLIDER uses it")
    if unit and qtype not in {"RANGE", "NUMBER"}:
        rep.warn(line, f"unit is set on a {qtype} row; only RANGE and NUMBER use it")

    # Duplicates across the file.
    key = re.sub(r"\W+", " ", question.lower()).strip()
    if key in seen_questions:
        rep.error(line, f"duplicate question (same as line {seen_questions[key]})")
    else:
        seen_questions[key] = line
    if qtype not in {"TRUE_FALSE", "MATCH", "CATEGORIZE"} and answer:
        akey = answer.lower()
        if akey in seen_answers:
            rep.warn(line, f"same correct answer as line {seen_answers[akey]} ({answer}); two questions about one thing?")
        else:
            seen_answers[akey] = line

    opts = options(row)

    if qtype == "MULTIPLE_CHOICE":
        choices = opts[:4]
        if any(not c for c in choices):
            rep.error(line, "MULTIPLE_CHOICE needs option1 to option4 all filled")
        check_empty_options(rep, line, row, 5, "MULTIPLE_CHOICE")
        if len({c.lower() for c in choices if c}) != len([c for c in choices if c]):
            rep.error(line, "MULTIPLE_CHOICE options repeat each other")
        if answer and answer not in choices:
            lowered = [c.lower() for c in choices]
            if answer.lower() in lowered:
                rep.error(line, f"correctAnswer {answer!r} matches an option only if capitals are ignored; copy it word for word")
            else:
                rep.error(line, f"correctAnswer {answer!r} is not one of the options; the row would be dropped")
        for c in choices:
            if len(c.split()) > 5:
                rep.warn(line, f"option {c!r} is long; keep options to one to four words")
        if re.match(r"^(none|all) of the above", answer.lower()) or any(
            re.match(r"^(none|all) of the above", c.lower()) for c in choices
        ):
            rep.error(line, "no 'none of the above' or 'all of the above' options")

    elif qtype == "TRUE_FALSE":
        if opts[0].lower() != "true" or opts[1].lower() != "false":
            rep.error(line, "TRUE_FALSE needs option1=True and option2=False")
        check_empty_options(rep, line, row, 3, "TRUE_FALSE")
        if answer.lower() not in {"true", "false"}:
            rep.error(line, f"correctAnswer must be True or False, not {answer!r}")
        if question.lower().startswith("true or false"):
            rep.warn(line, "the game already labels the format; write the statement alone")

    elif qtype == "MULTI_SELECT":
        choices = [c for c in opts[:5] if c]
        if any(not c for c in opts[:len(choices)]) or len(choices) < 4:
            rep.error(line, "MULTI_SELECT needs four or five choices in option1 to option5 with no gaps")
        if opts[5]:
            rep.error(line, "MULTI_SELECT: option6 must be empty")
        rights = [r.strip() for r in answer.split("|") if r.strip()]
        if len(rights) < 2:
            rep.error(line, "MULTI_SELECT needs at least two right answers separated by |")
        missing = [r for r in rights if r not in choices]
        if missing:
            rep.error(line, f"MULTI_SELECT right answers not found among the options word for word: {missing}")
        if choices and len(rights) >= len(choices):
            rep.error(line, "MULTI_SELECT: every option is right; there is nothing to pick")
        if len(rights) > 3:
            rep.warn(line, "MULTI_SELECT with more than three right answers is a lot to tap in 25 seconds")

    elif qtype == "SLIDER":
        vals = [number(v) for v in opts[:5]]
        if any(v is None for v in vals):
            rep.error(line, "SLIDER needs five numbers: min, max, step, correct-low, correct-high (no thousands separators)")
        else:
            lo, hi, step, clo, chi = vals
            if not lo < hi:
                rep.error(line, "SLIDER: option1 (min) must be below option2 (max)")
            if step <= 0:
                rep.error(line, "SLIDER: option3 (step) must be positive")
            if not clo <= chi:
                rep.error(line, "SLIDER: option4 (correct low) must not exceed option5 (correct high)")
            if clo < lo or chi > hi:
                rep.error(line, "SLIDER: the correct window must sit inside the slider range")
            if step > 0 and lo < hi:
                first = lo + math.ceil((clo - lo) / step - 1e-9) * step
                if first > chi + 1e-9:
                    rep.error(line, "SLIDER: no step from the minimum lands inside the correct window")
                width = (hi - lo)
                if width > 0 and (chi - clo) / width < 0.02:
                    rep.warn(line, "SLIDER: the correct window is under 2% of the range; a sensible guess will miss it")
            real = leading_number(answer)
            if real is None:
                rep.error(line, "SLIDER: correctAnswer must contain the real number")
            elif not clo <= real <= chi:
                rep.error(line, f"SLIDER: the real answer {real:g} is outside the correct window {clo:g} to {chi:g}")
        if opts[5]:
            rep.error(line, "SLIDER: option6 must be empty")
        if not margin:
            rep.warn(line, "SLIDER: put low in margin so a near miss earns a few points")

    elif qtype == "RANGE":
        vals = [number(v) for v in opts[:3]]
        if any(v is None for v in vals):
            rep.error(line, "RANGE needs three numbers: min, max, step")
        else:
            lo, hi, step = vals
            if not lo < hi:
                rep.error(line, "RANGE: option1 (min) must be below option2 (max)")
            if step <= 0:
                rep.error(line, "RANGE: option3 (step) must be positive")
            real = number(answer)
            if real is None:
                rep.error(line, "RANGE: correctAnswer must be a plain number")
            elif not lo <= real <= hi:
                rep.error(line, f"RANGE: the answer {real:g} is outside {lo:g} to {hi:g}")
        check_empty_options(rep, line, row, 4, "RANGE")

    elif qtype == "NUMBER":
        check_empty_options(rep, line, row, 1, "NUMBER")
        if number(answer) is None:
            rep.error(line, "NUMBER: correctAnswer must be a plain number with no thousands separator")

    elif qtype == "PIN":
        if image not in PIN_MAPS:
            rep.error(line, "PIN: image must be world or usa")
        lat, lon, radius = (number(v) for v in opts[:3])
        if lat is None or lon is None or radius is None:
            rep.error(line, "PIN needs option1 latitude, option2 longitude, option3 radius in km, all plain numbers")
        else:
            if not -90 <= lat <= 90 or not -180 <= lon <= 180:
                rep.error(line, "PIN: latitude must be -90..90 and longitude -180..180")
            if radius <= 0:
                rep.error(line, "PIN: the radius must be positive")
            if image == "usa":
                if not (24 <= lat <= 50 and -125 <= lon <= -66):
                    rep.error(line, "PIN on the usa map must be inside the lower 48 states")
                if not 150 <= radius <= 250:
                    rep.warn(line, "PIN on the usa map: 150 to 250 km is the generous radius the brief asks for")
            elif image == "world" and not 600 <= radius <= 800:
                rep.warn(line, "PIN on the world map: 600 to 800 km is the generous radius the brief asks for")
        check_empty_options(rep, line, row, 4, "PIN")

    elif qtype == "PUZZLE":
        items = opts[:4]
        if any(not i for i in items):
            rep.error(line, "PUZZLE needs four items in option1 to option4, in the correct order")
        check_empty_options(rep, line, row, 5, "PUZZLE")
        if answer != "|".join(items):
            rep.error(line, "PUZZLE: correctAnswer must repeat option1 to option4 in the same order joined with |")

    elif qtype == "MATCH":
        pairs = check_pairs(rep, line, opts[:4], "MATCH")
        check_empty_options(rep, line, row, 5, "MATCH")
        if len({p[1].lower() for p in pairs}) != len(pairs):
            rep.error(line, "MATCH: every partner must be different")
        if len({p[0].lower() for p in pairs}) != len(pairs):
            rep.error(line, "MATCH: every item must be different")
        if answer.lower() != "see the pairs":
            rep.error(line, "MATCH: correctAnswer must be 'See the pairs'")

    elif qtype == "CATEGORIZE":
        pairs = check_pairs(rep, line, opts[:6], "CATEGORIZE")
        groups = Counter(p[1].lower() for p in pairs)
        if len(pairs) == 6:
            if len(groups) not in {2, 3}:
                rep.error(line, f"CATEGORIZE needs two groups of three (or three obvious groups), not {len(groups)}")
            elif len(groups) == 2 and set(groups.values()) != {3}:
                rep.warn(line, "CATEGORIZE: two groups should be three items each")
            elif min(groups.values()) < 2:
                rep.error(line, "CATEGORIZE: every group needs at least two items")
        if answer.lower() != "see the groups":
            rep.error(line, "CATEGORIZE: correctAnswer must be 'See the groups'")

    elif qtype == "SCRAMBLE":
        check_empty_options(rep, line, row, 1, "SCRAMBLE")
        if not re.fullmatch(r"[A-Za-z]+", answer):
            rep.error(line, "SCRAMBLE: correctAnswer must be a single word, letters only")
        elif not 5 <= len(answer) <= 8:
            rep.warn(line, f"SCRAMBLE: {answer!r} is {len(answer)} letters; 5 to 8 plays best")

    elif qtype == "TYPE_ANSWER":
        if not opts[0]:
            rep.error(line, "TYPE_ANSWER: option1 must hold the canonical answer")
        if answer != opts[0]:
            rep.error(line, "TYPE_ANSWER: correctAnswer must repeat option1")
        if len([o for o in opts if o]) < 2:
            rep.warn(line, "TYPE_ANSWER: list the surname and common variants as extra options or they are marked wrong")

    return qtype


def validate_file(path: Path) -> Report:
    rep = Report(path)
    try:
        raw = path.read_bytes()
    except OSError as exc:
        rep.error(0, f"cannot read file: {exc}")
        return rep
    if raw.startswith(b"\xef\xbb\xbf"):
        rep.warn(1, "file starts with a byte-order mark; save as plain UTF-8")
        raw = raw[3:]
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        rep.error(0, "file is not UTF-8")
        return rep
    if "\r\n" in text:
        rep.warn(1, "Windows line endings; fine for the game, but Unix endings are the convention here")

    rows = list(csv.reader(text.splitlines()))
    if not rows:
        rep.error(1, "file is empty")
        return rep

    header = [h.strip() for h in rows[0]]
    if header[:GAME_COLUMNS] != HEADER[:GAME_COLUMNS]:
        rep.error(1, "header must be exactly: " + ",".join(HEADER))
        return rep
    has_difficulty = len(header) != GAME_COLUMNS
    if not has_difficulty:
        rep.warn(1, "no difficulty column; the game does not need it but the library filter does")
        header = header + ["difficulty"]
    elif header != HEADER:
        rep.error(1, "header must be exactly: " + ",".join(HEADER))
        return rep

    types: list[str] = []
    categories: Counter = Counter()
    levels: Counter = Counter()
    tf_false = 0
    seen_q: dict = {}
    seen_a: dict = {}

    for index, cells in enumerate(rows[1:], start=2):
        if not any(c.strip() for c in cells):
            continue
        if len(cells) == GAME_COLUMNS:
            cells = cells + [""]
        if len(cells) != len(HEADER):
            rep.error(index, f"{len(cells)} fields instead of {len(HEADER)}; a comma inside a field needs the field wrapped in double quotes")
            continue
        row = dict(zip(HEADER, cells))
        row["_present"] = "difficulty" if has_difficulty else ""
        qtype = validate_row(rep, index, row, seen_q, seen_a)
        if qtype is None:
            continue
        types.append(qtype)
        categories[row["category"].strip()] += 1
        levels[row["difficulty"].strip().lower() or "(empty)"] += 1
        if qtype == "TRUE_FALSE" and row["correctAnswer"].strip().lower() == "false":
            tf_false += 1

    n = len(types)
    counts = Counter(types)
    summary = [f"  {n} questions"]
    if len(categories) > 1:
        rep.warn(1, f"{len(categories)} categories in one file ({', '.join(sorted(categories))}); fine for a merged library, not for a single run")
    summary.append("  categories: " + ", ".join(f"{c} ({k})" for c, k in categories.most_common()))
    summary.append("  difficulty: " + ", ".join(f"{c} ({k})" for c, k in levels.most_common()))
    summary.append("  mix: " + ", ".join(f"{t} {k}" for t, k in counts.most_common()))

    if n:
        mc = counts.get("MULTIPLE_CHOICE", 0)
        tf = counts.get("TRUE_FALSE", 0)
        others = n - mc - tf
        if mc / n < 0.55:
            rep.warn(1, f"only {mc} of {n} are MULTIPLE_CHOICE; the brief asks for about two thirds")
        if tf == 0 and n >= 10:
            rep.warn(1, "no TRUE_FALSE rows; the brief asks for about one in five")
        if others > n // 6:
            rep.warn(1, f"{others} rows in the other formats; the brief allows at most one in six ({n // 6})")
        repeated = [t for t, k in counts.items() if t not in BACKBONE and k > 1]
        if repeated:
            rep.warn(1, f"format used more than once in one file: {', '.join(repeated)}")
        if tf and (tf_false == 0 or tf_false == tf):
            rep.warn(1, f"all {tf} TRUE_FALSE rows have the same answer; aim for about half False")
        if counts.get("TYPE_ANSWER"):
            rep.warn(1, f"{counts['TYPE_ANSWER']} TYPE_ANSWER rows; the game drops them unless TYPED ANSWERS is on at setup")

    rep.summary = summary  # type: ignore[attr-defined]
    return rep


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    status = 0
    for arg in argv[1:]:
        path = Path(arg)
        rep = validate_file(path)
        print(f"{path}:")
        for line in getattr(rep, "summary", []):
            print(line)
        for line in rep.errors:
            print(line)
        for line in rep.warnings:
            print(line)
        if rep.errors:
            print(f"  {len(rep.errors)} error(s), {len(rep.warnings)} warning(s): fix the errors, the game would drop or misplay those rows")
            status = 1
        else:
            print(f"  clean: 0 errors, {len(rep.warnings)} warning(s)")
    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv))
