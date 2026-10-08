# Question file format

Use this to hand OmniTrivia your own questions instead of generating them.
**No API key is needed for this path.**

> Not sure you want to write any? **HOST GAME → USE THE QUESTION BANK** loads
> several hundred premade questions and needs none of this. The bank is just a
> sheet in this format, so everything below describes it too — and if you want
> to extend it, this is the shape to add rows in.

Load a file with **HOST GAME → IMPORT MY OWN QUESTIONS → Select File**, or paste
a public Google Sheet URL on the same screen. A CSV file is parsed entirely in
the browser and makes no network calls at all; a Google Sheet is fetched from
`docs.google.com` first (see the Google Sheets section below), so it needs
internet access.

`questions.example.csv` in this repo is a working file with at least one
question of every format. Open it alongside this doc.

## Columns

The first row must be a header. Column names are matched case-insensitively
with spaces removed, so `Correct Answer`, `correctanswer`, and `correctAnswer`
are all the same column. Order does not matter.

| Column | Required | Purpose |
|---|---|---|
| `category` | **yes** | Groups questions into rounds — one round per distinct category |
| `question` | **yes** | The question text shown to players |
| `option1` … `optionN` | no | Meaning depends on `type` (see below). Add as many as a question needs. Leave them all empty and the row is read as a short answer — see **Shorthand** |
| `correctAnswer` | **yes** | Meaning depends on `type` (see below) |
| `type` | no | Defaults to `MULTIPLE_CHOICE` — the formats are below |
| `explanation` | no | Shown with the answer key after the round |
| `image` | no | A picture shown with the question — an `https://` URL, or `world` / `usa` for a built-in map. Required for a `PIN` question, where it is what gets pinned |
| `margin` | no | How forgiving a `SLIDER`, `PIN` or `NUMBER` question is: `none`, `low`, `medium`, `high` or `maximum` |
| `unit` | no | What a `SLIDER`, `RANGE` or `NUMBER` answer counts — `km`, `°F`, `years` |
| `timeLimit` | no | Seconds on the clock for this question, 5–120. Each format has its own default |

Each distinct category becomes one category the wheel can land on. A category
matching a built-in name — **Science, History, Geography, Pop Culture, Sports,
Tech, Art, Literature, Music, Food** — gets that category's icon and colour on
the wheel. Any other name still works and gets an icon and colour of its own.

**The order in the file is not the order it is played.** After the file is read
you are shown **WHAT TO PLAY**: tick the categories you want, and the rounds
and questions-per-round numbers you set on the setup screen trim the rest away.
Whatever survives is shuffled — categories, the questions inside each one, and
the options under each multiple-choice and select-all question — and which
category comes up in which round is then decided by the wheel, live. So a file
can hold far more than one night's worth, and the same file gives a different
game each time.

## The formats at a glance

| `type` | What players do | Clock | Scoring |
|---|---|---|---|
| `MULTIPLE_CHOICE` | Tap one option | 15s | All or nothing |
| `MULTI_SELECT` | Tick every right option | 20s | A wrong tick cancels a right one |
| `TRUE_FALSE` | Tap True or False | 12s | All or nothing |
| `TYPE_ANSWER` | Type the answer | 20s | All or nothing |
| `SLIDER` | Slide to a number | 20s | In the target range scores in full; `margin` pays for a near miss |
| `RANGE` | Drag two handles to catch the answer | 20s | The tighter the catch, the more it pays |
| `NUMBER` | Type a number, no scale shown | 20s | Closest guess scores most |
| `PIN` | Drop a pin on a picture or a map | 25s | Inside the ring scores in full; `margin` pays for a near miss |
| `PUZZLE` | Put items in order | 30s | All or nothing |
| `MATCH` | Pair items with their partners | 30s | Pays for every pair right beyond guessing |
| `CATEGORIZE` | Sort items into groups | 30s | Pays for every item right beyond guessing |
| `SCRAMBLE` | Rebuild a word from shuffled letters | 25s | All or nothing |

The `type` column is forgiving: `True/False`, `TF`, `Select all that apply`,
`Pin answer`, `Map`, `Closest`, `Order`, `Sort`, `Anagram` and similar
spellings all resolve to the format they name.

**Points** are 100 for a right answer plus up to 150 for speed — ten a second
on a fifteen-second question, scaled so that a full clock is worth the same on
every format. A near miss earns its share of that, and is shown as **≈ close**
rather than ✓: it scores, but it is not a right answer and it does not keep a
streak going.

## The formats

### `MULTIPLE_CHOICE` (the default)

`option1`–`option4` are the choices. `correctAnswer` should match one of them
exactly, ignoring case.

```csv
type,category,question,option1,option2,option3,option4,correctAnswer,explanation
MULTIPLE_CHOICE,Science,What planet is known as the Red Planet?,Mars,Venus,Jupiter,Mercury,Mars,Iron oxide gives Mars its colour.
```

An answer key written a bit more fully than the option it points at is still
resolved, as long as only one option can be meant — a parenthetical gloss, a
leading article, or a fuller phrasing:

| `correctAnswer` | Options | Marks |
|---|---|---|
| `The Nile` | Amazon, Nile, Mississippi, Yangtze | Nile |
| `Tampa (Ybor City)` | Jacksonville, Tampa, Miami, Key West | Tampa |
| `Old Town Road by Lil Nas X` | Shape of You, Despacito, Old Town Road, … | Old Town Road |

> **If `correctAnswer` matches no option at all, the question is dropped** and
> the setup screen says so. It used to fall back to `option1`, which does not
> fail an import — it just makes the wrong answer correct in front of a room.

### `MULTI_SELECT` — select all that apply

The options are the choices, as for multiple choice. `correctAnswer` lists
**every** right option, separated by pipes. Players are not told how many are
right — that is the question.

```csv
type,category,question,option1,option2,option3,option4,correctAnswer,explanation
MULTI_SELECT,Science,Which of these are noble gases?,Helium,Nitrogen,Argon,Oxygen,Helium|Argon,
```

A wrong tick cancels a right one, so ticking everything is worth nothing:
both noble gases is full points, Helium alone is half, Helium and Nitrogen is
nothing. Needs at least three options, and every item in `correctAnswer` has
to match one of them or the question is dropped.

### `TRUE_FALSE`

Players get two big buttons — ✓ True and ✕ False — and on a keyboard, T and F.
Options are forced to True/False regardless of what you write.
`correctAnswer` is `True` or `False` (`T`, `F`, `Yes`, `No`, `Fact` and
`Fiction` work too when the type column says `TRUE_FALSE`).

```csv
type,category,question,option1,option2,option3,option4,correctAnswer,explanation
TRUE_FALSE,Science,"The Great Wall is visible from the Moon, true or false?",True,False,,,False,Not visible to the naked eye.
```

You can omit the `type` column entirely for these, two ways: a question with
exactly two options that are `True` and `False` is auto-detected, and so is a
question with **no options at all** whose `correctAnswer` is `True` or `False`.

```csv
category,question,option1,option2,option3,option4,correctAnswer,explanation
Florida,True or False: Florida is the flattest state in the US.,,,,,True,Britton Hill tops out at 345 feet.
```

### `TYPE_ANSWER`

Players type a free-text answer. **Every option is an accepted spelling** —
list all of them. Matching ignores case, leading/trailing spaces, and repeated
inner spaces, so `"  george   WASHINGTON "` matches `George Washington`. It is
otherwise exact: no fuzzy matching, no partial credit.

```csv
type,category,question,option1,option2,option3,option4,correctAnswer,explanation
TYPE_ANSWER,Music,"Which Beatle was known as ""the quiet one""?",George Harrison,Harrison,George,,George Harrison,List every spelling you will accept.
```

Leave the option columns empty and the accepted spellings are derived from
`correctAnswer` instead — see **Shorthand** below.

### `SLIDER`

Players drag to a number. Options are positional:
`option1`=min, `option2`=max, `option3`=step, `option4`=correctLow,
`option5`=correctHigh. Any answer within low–high inclusive scores in full.

```csv
type,category,question,option1,option2,option3,option4,option5,correctAnswer,explanation,margin
SLIDER,History,In what year did Apollo 11 land on the Moon?,1960,1980,1,1968,1970,1969,Any guess 1968-1970 counts.,low
```

The shorter way: give just min, max and step, and put the answer — or a range
like `1968-1970` — in `correctAnswer`.

The `margin` column decides what a near miss is worth, the way Kahoot's
"margin of accuracy" does. Credit falls in a straight line from full at the
edge of the target to nothing at the edge of the margin:

| `margin` | A miss still scores within… |
|---|---|
| `none` (default) | nothing — inside the target or no points |
| `low` | 5% of the slider's scale |
| `medium` | 15% of the scale |
| `high` | 30% of the scale |
| `maximum` | the whole scale — every answer scores, closer scores more |

A slider starts in the middle of its scale, and players can nudge it a step at
a time. A `unit` column puts the unit after the number.

### `RANGE`

Players drag **two** handles to bracket the answer. If the answer is inside
the range, the tighter it is the more it pays: a range no wider than 10% of
the scale earns full points, sliding down to a fifth of the points at half the
scale. Miss the answer, or cast a range wider than half the scale, and it
scores nothing. Players see a live meter of what their range is worth before
they lock it in — worked out from its width, so it gives nothing away.

Options are the same as a slider's — min, max, step — with the exact answer
in `correctAnswer`:

```csv
type,category,question,option1,option2,option3,correctAnswer,explanation,unit
RANGE,Geography,"How tall is Mount Everest, in metres?",5000,10000,10,8849,Surveyed at 8848.86 m in 2020.,m
```

Choose a scale wide enough that the answer is not obvious from it.

### `NUMBER` — closest guess

Players type a number, with no scale to hint at where it is. `correctAnswer` is
the number (commas and a trailing unit are fine: `384,400 km` reads as 384400
with the unit `km`). `option1`, if given, is a tolerance: anything within it
counts as dead on.

```csv
type,category,question,option1,option2,option3,option4,correctAnswer,explanation
NUMBER,Science,How many bones are in the adult human body?,,,,,206,
```

Margins work as for a slider, measured as a share of the answer itself, so 25%
of 384,400 km is a lot more room than 25% of 7. The default is `medium`:

| `margin` | A miss still scores within… |
|---|---|
| `none` | nothing (or the tolerance) |
| `low` | 10% of the answer |
| `medium` (default) | 25% of the answer |
| `high` | 50% of the answer |
| `maximum` | 100% of the answer |

### `PIN` — pin answer

Players drop a pin on a picture — tap to place it, tap again to move it,
pinch, scroll or press + to zoom in, drag to pan. Answered inside the ring
scores in full; the `margin` pays for a near miss, and is `low` unless the row
says otherwise. At the end of the round the answer key draws the ring, and
every pin the room dropped.

**On a built-in map**, set `image` to `world` (the world, Antarctica cropped)
or `usa` (the lower 48 states), and the options are **latitude, longitude, and
how many kilometres away still counts** — no measuring pixels:

```csv
type,category,question,option1,option2,option3,correctAnswer,explanation,image
PIN,Geography,Drop a pin on Mount Kilimanjaro.,-3.0674,37.3556,400,"Mount Kilimanjaro, Tanzania",Africa's highest peak.,world
PIN,Florida,Pin Fort Myers on the map.,26.6406,-81.8723,120,Fort Myers,Edison wintered here.,usa
```

The radius defaults to 500 km on the world map and 150 km on the US map. A spot
that is off the map — Honolulu on the lower 48 — drops the question.

**On any other picture**, set `image` to an `https://` URL, and the options are
**percent across, percent down, and the radius as a percent of the picture's
width** (fractions from 0 to 1 work too):

```csv
type,category,question,option1,option2,option3,correctAnswer,explanation,image
PIN,Art,Where is the Mona Lisa's left eye?,58,32,4,Her left eye,,https://example.com/mona-lisa.jpg
```

With no `image` column at all, put the URL or the map name in `option1` and
shift the numbers along one. `correctAnswer` is what the answer key calls the
spot. Pictures are loaded straight from their URL by every phone and the big
screen, so use a host that allows it, and check it loads on the review screen.

### `PUZZLE` — put them in order

Players drag items into order (or nudge them with arrows). **Put the options
in the correct order** — the game shuffles them for players, and never shows
them in the answer order. All items must be in the right place to score.

```csv
type,category,question,option1,option2,option3,option4,correctAnswer,explanation
PUZZLE,History,Put these in chronological order,World War I,World War II,Korean War,Vietnam War,World War I|World War II|Korean War|Vietnam War,Ordered by start year.
```

With the option columns left empty, the order in `correctAnswer` (separated by
pipes) is used instead.

### `MATCH` — pair them up

Players tap an item, then its partner. Write each pair in its own option
column as `item = partner` (`->`, `→` and `::` work in place of `=`), in the
right pairs — the game shuffles the partners. Two to six pairs, every partner
different. `correctAnswer` is not used for grading; anything readable will do.

```csv
type,category,question,option1,option2,option3,option4,correctAnswer,explanation
MATCH,Science,Match each element to its symbol.,Gold = Au,Silver = Ag,Iron = Fe,Sodium = Na,See the pairs,
```

It pays for every pair right beyond what guessing would get: all four is full
points, two of four is a third of them, one is nothing.

### `CATEGORIZE` — sort them into groups

Players tap a group for every item. Write each item in its own option column
as `item = group`, with **two to four groups**; the items are shuffled for
players and the groups shown alphabetically.

```csv
type,category,question,option1,option2,option3,option4,option5,option6,correctAnswer,explanation
CATEGORIZE,Food,"Botanically, fruit or vegetable?",Tomato = Fruit,Cucumber = Fruit,Carrot = Vegetable,Bell pepper = Fruit,Potato = Vegetable,Celery = Vegetable,See the groups,
```

Like a match, it pays for what is right beyond guessing — so dumping every item
in one of two groups scores nothing. A long sort deserves a longer clock: add
`40` in `timeLimit`.

### `SCRAMBLE` — unscramble

`correctAnswer` is the word or short phrase (3 to 20 letters); the question is
the clue. Players rebuild it from its shuffled letters by tapping tiles or
typing. Case, spaces and punctuation are ignored, and a phrase shows how long
each word is (`NEW YORK` is 3 · 4).

```csv
type,category,question,option1,option2,option3,option4,correctAnswer,explanation
SCRAMBLE,Music,Unscramble the instrument.,,,,,Saxophone,Adolphe Sax patented it in 1846.
```

## A picture on any question

The `image` column works on every format, not just pins: a logo to name, a
painting to date, a flag to place. It is shown above the options on the
phones and the big screen. Use a picture that does not give the answer away.

## Shorthand: rows with no options

A spreadsheet somebody types by hand rarely fills in four options for every
row, so a row with **every option column empty** and **no `type`** is read
rather than dropped:

| `correctAnswer` | Read as | Notes |
|---|---|---|
| `True` or `False` | `TRUE_FALSE` | The two options are the question |
| anything else | `TYPE_ANSWER` | The answer becomes the accepted spelling |

```csv
category,question,option1,option2,option3,option4,correctAnswer,explanation
Science,What element has the symbol K?,,,,,Potassium,
Science,Name as many noble gases as you can.,,,,,"Helium, Neon, Argon, Krypton",
```

For the short-answer case the accepted spellings are derived from the answer:

- The answer **exactly as written** — this is what the reveal puts on the big
  screen, so write it for a human reading it out.
- **Each comma- or semicolon-separated item**, so a "name as many as you can"
  round marks a player right for naming one of them rather than wrong for not
  naming all twelve. (Skipped when the commas are thousands separators.)
- **With and without a parenthetical gloss**, so `Rum (white rum)` accepts
  `Rum` and `white rum` as well.

Want tighter grading than that? Set `type` to `TYPE_ANSWER` and list exactly
the spellings you will accept in the option columns — a row that lists them is
taken at its word.

## Gotchas

- **No line breaks inside a field**, even quoted. The parser splits on newlines
  before it parses quotes, so a multi-line cell silently corrupts that row and
  everything after it. Keep every question on one line.
- **Commas inside a field are fine** if the field is quoted: `"Water boils at
  100°C, true or false?"`. Excel and Google Sheets do this automatically on
  export.
- **Literal double quotes** inside a quoted field are doubled: `"the ""quiet""
  one"`.
- **A row that cannot be played is left out, and the setup screen says how many
  and why** — a missing category, question or answer, a multiple-choice answer
  that matches none of its options, a slider with no scale, a pin target off
  the map, a match with two items sharing a partner, placeholder answers. Check
  the review screen shows the number of questions you expect.
- Unused option columns should be left empty, not deleted.
- Blank `explanation` is fine — the reveal just shows the answer with no note
  under it.

## Google Sheets

Instead of a file, paste the sheet URL on the import screen. Sharing must be set
to **"Anyone with the link can view"** — the app fetches
`.../export?format=csv`. The same column rules apply. Put one quiz per tab and
link the tab you want: open that tab, then copy the URL from the address bar.
It ends in `gid=<number>`, and the app reads that tab.

A link with no `gid=` (the kind the **Share** button copies) reads tab 0: the
tab a sheet made in Google Sheets starts with, wherever it has since been
moved. If there is no tab 0, the app reads the leftmost tab instead.

**An Excel file in Google Drive works too.** Opening a `.xlsx` from Drive shows
it in Sheets without converting it. Its share link looks like
`.../edit?usp=sharing&ouid=...&rtpof=true&sd=true`, with no `gid=`, and its tabs
have long random ids instead of 0, so the app reads its first tab. To read a
different tab, open that tab and copy the URL as above. If anything about the
file gives trouble, use **File → Save as Google Sheets** and link the copy.

The **Select File** button takes `.csv`, `.tsv` and `.txt`, not `.xlsx`. To
upload an Excel file rather than link it, save it as CSV first: in Excel,
**File → Save As → CSV UTF-8**; in Sheets, **File → Download → Comma-separated
values (.csv)**, which saves only the tab that is open.

This is exactly how the built-in question bank is served. To make a sheet of
your own the app's default, point `DEFAULT_QUESTION_BANK` in
`src/constants.ts` at it and run `npm run check-question-bank` to confirm every
row still parses.

## Checking your file

After importing, the review screen lists every round and question with its
format, its clock, and its answer — drawn, for the formats that have something
to draw: a ring on the map, a band on the slider's scale, the pairs, the
groups. Read it before opening the lobby — that screen is the last point where
a typo is cheap to fix.

`npm run check-question-types` checks every format against the app's own
importer, grader and answer-hiding, including that `questions.example.csv`
still covers every format and plays without a row left out.
