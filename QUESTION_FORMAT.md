# Question file format

Use this to hand OmniTrivia your own questions instead of generating them.
**No API key is needed for this path** — importing runs entirely in the browser
and makes no network calls at all.

Load a file with **HOST GAME → IMPORT MY OWN QUESTIONS → Select File**, or paste
a public Google Sheet URL on the same screen.

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
| `option1` … `optionN` | **`option1` yes** | Meaning depends on `type` (see below) |
| `correctAnswer` | **yes** | Meaning depends on `type` (see below) |
| `type` | no | Defaults to `MULTIPLE_CHOICE` |
| `explanation` | no | Shown on the leaderboard after the question |

Rounds appear in the order their category first appears in the file. A category
matching a built-in name — **Science, History, Geography, Pop Culture, Sports,
Tech, Art, Literature, Music, Food** — gets that category's icon and colour on
the wheel. Any other name still works, but shows as ❓ in grey.

## Question types

### `MULTIPLE_CHOICE` (the default)

`option1`–`option4` are the choices. `correctAnswer` must match one of them
exactly, ignoring case.

```csv
type,category,question,option1,option2,option3,option4,correctAnswer,explanation
MULTIPLE_CHOICE,Science,What planet is known as the Red Planet?,Mars,Venus,Jupiter,Mercury,Mars,Iron oxide gives Mars its colour.
```

> If `correctAnswer` matches no option, the importer silently falls back to
> `option1` and logs a warning to the browser console. Typos here become wrong
> answers in front of a room — proofread this column.

### `TRUE_FALSE`

Options are forced to True/False regardless of what you write.
`correctAnswer` must be `True` or `False`.

```csv
TRUE_FALSE,Science,"The Great Wall is visible from the Moon, true or false?",True,False,,,False,Not visible to the naked eye.
```

You can omit the `type` column entirely for these: a question with exactly two
options that are `True` and `False` is auto-detected.

### `TYPE_ANSWER`

Players type a free-text answer. **Every option is an accepted spelling** —
list all of them. Matching ignores case, leading/trailing spaces, and repeated
inner spaces, so `"  george   WASHINGTON "` matches `George Washington`. It is
otherwise exact: no fuzzy matching, no partial credit.

```csv
TYPE_ANSWER,Music,"Which Beatle was known as ""the quiet one""?",George Harrison,Harrison,George,,George Harrison,List every spelling you will accept.
```

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

For `TYPE_ANSWER`, `SLIDER`, and `PUZZLE` the `correctAnswer` column is not used
for grading — it is required to be non-empty, and is worth filling in so the
file is readable by a human.

## Gotchas

- **No line breaks inside a field**, even quoted. The parser splits on newlines
  before it parses quotes, so a multi-line cell silently corrupts that row and
  everything after it. Keep every question on one line.
- **Commas inside a field are fine** if the field is quoted: `"Water boils at
  100°C, true or false?"`. Excel and Google Sheets do this automatically on
  export.
- **Literal double quotes** inside a quoted field are doubled: `"the ""quiet""
  one"`.
- Rows missing `category`, `question`, `option1`, or `correctAnswer` are
  **skipped silently** (a warning goes to the browser console only). Check the
  review screen shows the number of questions you expect.
- Unused option columns should be left empty, not deleted.
- Blank `explanation` is fine; it just shows a default line.

## Google Sheets

Instead of a file, paste the sheet URL on the import screen. Sharing must be set
to **"Anyone with the link can view"** — the app fetches
`.../export?format=csv`. The same column rules apply. Put one quiz per tab and
link the tab you want (the `gid=` in the URL is respected).

## Checking your file

After importing, the review screen lists every round and question with its type
badge and correct answer marked. Read it before opening the lobby — that screen
is the last point where a typo is cheap to fix.
