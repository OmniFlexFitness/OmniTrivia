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

`questions.example.csv` in this repo is a working file covering every type. Open
it alongside this doc.

## Columns

The first row must be a header. Column names are matched case-insensitively
with spaces removed, so `Correct Answer`, `correctanswer`, and `correctAnswer`
are all the same column. Order does not matter.

| Column | Required | Purpose |
|---|---|---|
| `category` | **yes** | Groups questions into rounds — one round per distinct category |
| `question` | **yes** | The question text shown to players |
| `option1` … `optionN` | no | Meaning depends on `type` (see below). Leave them all empty and the row is read as a short answer — see **Shorthand** |
| `correctAnswer` | **yes** | Meaning depends on `type` (see below) |
| `type` | no | Defaults to `MULTIPLE_CHOICE` |
| `explanation` | no | Shown on the leaderboard after the question |

Each distinct category becomes one category the wheel can land on. A category
matching a built-in name — **Science, History, Geography, Pop Culture, Sports,
Tech, Art, Literature, Music, Food** — gets that category's icon and colour on
the wheel. Any other name still works, but shows as ❓ in grey.

**The order in the file is not the order it is played.** After the file is read
you are shown **WHAT TO PLAY**: tick the categories you want, and the rounds
and questions-per-round numbers you set on the setup screen trim the rest away.
Whatever survives is shuffled — categories, the questions inside each one, and
the options under each multiple-choice question — and which category comes up
in which round is then decided by the wheel, live. So a file can hold far more
than one night's worth, and the same file gives a different game each time.

## Question types

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

> **If `correctAnswer` matches no option at all, the question is dropped** and a
> warning goes to the browser console. It used to fall back to `option1`, which
> does not fail an import — it just makes the wrong answer correct in front of a
> room. Losing the question is the lesser evil, but proofread this column: check
> the review screen shows the number of questions you expect.

### `TRUE_FALSE`

Options are forced to True/False regardless of what you write.
`correctAnswer` must be `True` or `False`.

```csv
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
TYPE_ANSWER,Music,"Which Beatle was known as ""the quiet one""?",George Harrison,Harrison,George,,George Harrison,List every spelling you will accept.
```

Leave the option columns empty and the accepted spellings are derived from
`correctAnswer` instead — see **Shorthand** below.

### `SLIDER`

Players drag to a number. Options are positional:
`option1`=min, `option2`=max, `option3`=step, `option4`=correctLow,
`option5`=correctHigh. Any answer within low–high inclusive counts.

```csv
SLIDER,History,In what year did Apollo 11 land on the Moon?,1960,1980,1,1968,1970,1969,Any guess 1968-1970 counts.
```

Set low and high to the same number to require an exact answer.

### `PUZZLE`

Players drag items into order. **Put the options in the correct order** — the
game shuffles them for players. All items must be in the right place to score.

```csv
PUZZLE,History,Put these in chronological order,World War I,World War II,Korean War,Vietnam War,,World War I|World War II|Korean War|Vietnam War,Ordered by start year.
```

For `TYPE_ANSWER` (with options listed), `SLIDER`, and `PUZZLE` the
`correctAnswer` column is not used for grading — it is required to be non-empty,
and is worth filling in so the file is readable by a human.

## Shorthand: rows with no options

A spreadsheet somebody types by hand rarely fills in four options for every
row, so a row with **every option column empty** is read rather than dropped:

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
- Rows missing `category`, `question`, or `correctAnswer` are **skipped
  silently** (a warning goes to the browser console only), and so is a
  multiple-choice row whose `correctAnswer` matches none of its options. Check
  the review screen shows the number of questions you expect.
- Unused option columns should be left empty, not deleted.
- Blank `explanation` is fine — the reveal just shows the answer with no note
  under it.

## Google Sheets

Instead of a file, paste the sheet URL on the import screen. Sharing must be set
to **"Anyone with the link can view"** — the app fetches
`.../export?format=csv`. The same column rules apply. Put one quiz per tab and
link the tab you want (the `gid=` in the URL is respected).

This is exactly how the built-in question bank is served. To make a sheet of
your own the app's default, point `DEFAULT_QUESTION_BANK` in
`src/constants.ts` at it and run `npm run check-question-bank` to confirm every
row still parses.

## Checking your file

After importing, the review screen lists every round and question with its type
badge and correct answer marked. Read it before opening the lobby — that screen
is the last point where a typo is cheap to fix.
