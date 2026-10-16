---
name: omnitrivia-questions
description: Write a ready-to-import OmniTrivia question set as a CSV file for one category at a chosen difficulty, 30 questions by default, in the exact 16-column format the game's importer reads, then validate it and explain how to load it. Use this whenever Bertin asks for trivia questions, a question set, a round, a question bank or "questions for OmniTrivia" or "for trivia night", for any category (Science, History, Pop Culture, Sports, Fitness, Supplements, Movies and so on) at any level (everyday, high school, pub quiz), even if he never says CSV, format or import. Also use it to add rows to an existing set, to re-pitch a set at a different difficulty, to write several categories in one go, or when asked how to get questions into the game.
---

# OmniTrivia question sets

OmniTrivia is a phone-based bar trivia game. The host loads questions as a CSV
and the game plays one round per category. This skill writes that CSV: one
category, one difficulty, 30 questions, in the format the importer accepts
without edits, validated before it is handed over.

The job is harder than it looks for one reason: the room is not a quiz team.
Head-to-head rounds are scored on speed, so the game is best when nearly
everyone knows nearly every answer and races to tap. A question that is too
easy costs nothing. A question that is too hard loses the room. Every decision
below leans easier.

## 1. Read the settings out of the request

| Setting | Default | How to read the request |
| --- | --- | --- |
| **Category** | ask only if none is given | One of the 20 game categories in `references/categories.md`, spelled the way the game spells it (Pop Culture, Tech, Video Games, Internet Culture). Any other name also works; the game plays it as its own round. |
| **Difficulty** | `school` | `everyday` for "easy", "family", "kids", "anyone"; `school` for "normal", "high school", "bar night", "regular"; `quiz` for "hard", "competitive", "pub quiz", "challenge". The three levels are defined in `references/difficulty.md`. |
| **Count** | 30 | Whatever number is asked for. Stay between 20 and 40 in one file; past 40 the set repeats itself, so write a second file with an avoid-list instead. |
| **Typed answers** | off | Only write `TYPE_ANSWER` rows if the request says typed answers are on. The game drops them unless the host turned the TYPED ANSWERS switch on. |
| **Avoid-list** | none | Questions already in an earlier file for the same category. Do not repeat their subjects. |

Several categories in one request mean one file per category, written one
after another, each with the whole process below. Do not blend categories in
one file unless asked for a single merged file; then write the files first and
concatenate them under one header.

## 2. Load the references

Read all three before writing a row. They are short and they are the contract.

- `references/difficulty.md`: the reader each level is written for, the test
  applied to every question, and real examples of right-level and too-hard.
- `references/categories.md`: what each category covers at these levels and
  what to stay away from.
- `references/format.md`: the 16 columns, what each format puts in them, the
  CSV rules the importer is strict about, and one example row per format.

## 3. Plan the mix

Multiple choice and true/false are the backbone. The other formats are rare,
never repeated inside a file, and they get the easiest questions in the set,
because the format itself is the work.

| Count | MULTIPLE_CHOICE | TRUE_FALSE | Other formats (each a different one) |
| --- | --- | --- | --- |
| 30 | 20 | 6 | 4 |
| 24 | 16 | 5 | 3 |
| 20 | 13 | 4 | 3 |
| any n | about two thirds | about one in five | at most n/6, rounded down |

Pick the "other" formats from what the category suits: SLIDER and PUZZLE for
anything with dates, PIN for places, MATCH and CATEGORIZE for pairs and groups,
MULTI_SELECT and SCRAMBLE for almost anything, NUMBER and RANGE only when a
number most people roughly know exists. Never force a format onto a category
that has no natural question for it.

## 4. Write the questions

Work subtopic by subtopic across the whole category so the set is spread, not
clustered. The category note lists the subtopics; cover most of them.

For every question, before keeping it:

1. **Apply the level's test** from `references/difficulty.md`. For `school`:
   would an average 17-year-old, and an adult who has not followed the subject
   since school, know this without looking anything up or working anything
   out? About two thirds of the set are questions nearly everybody gets, the
   rest ones about half the room gets, and nothing beyond that. If a question
   fails the test, find an easier fact about the same subject.
2. **One defensible answer.** If two answers could be argued, rewrite.
3. **Wrong options are things the room has heard of**, plausible to someone
   who does not know and clearly wrong to someone who does. One to four
   words each. No jokes, no "none of the above".
4. **One plain sentence, ideally under 90 characters**, no double negatives,
   no trick wording. It is read against a clock of 15 seconds (12 for
   true/false).
5. **The explanation is one sentence worth reading aloud**: why the answer is
   what it is, or the fact that makes it stick.
6. **No two questions with the same answer**, and no two about the same
   person, event or work. A big subject (the Moon, Rome, the Beatles) can
   carry more than one question if each asks a different fact, but spread the
   set rather than mining one subject.
7. **Never** an exact year, a precise statistic, a minor character, a specific
   episode, a name only a fan knows, or anything that takes two facts.

True/false: about half the statements false, and a false one is a believable
near miss, never nonsense.

## 5. Write the file and validate it

Save the set as `questions-<category>-<difficulty>.csv`, lowercase with
hyphens, for example `questions-pop-culture-school.csv`, in the place the
request named, otherwise the working directory or wherever files for the
user go in this environment. UTF-8, no byte-order mark, Unix line endings,
the exact header from `references/format.md`, one row per question, every
row 16 fields.

Then run the validator in this skill's `scripts/` folder, by its full path
from wherever the skill is installed:

```bash
python3 <skill folder>/scripts/validate_csv.py questions-pop-culture-school.csv
```

It checks what the importer checks (header, field count, required cells,
correct answers that match an option, numeric slider and pin cells, puzzle and
match shapes, stray double quotes) plus what the game cannot check for you (the
mix, repeated formats, duplicate subjects, question length, the difficulty
column). Fix every error and re-run until it reports clean. Read the warnings
too; most of them are a question that will play badly.

Finally read the file once as the room, not as the host. Any row you would
have to think about at the `school` level is a `quiz` row that slipped in.
Replace it; do not keep it.

## 6. Deliver

Hand over the file itself. Under it, in a few lines: the category, level and
count, the format mix, anything the validator warned about that was left on
purpose, and the import steps below. Keep the questions out of the chat
unless asked; the file is the deliverable.

## How to import the file into OmniTrivia

Include this with the first delivery in a conversation; on later deliveries
in the same conversation, one line saying the steps are the same is enough.
The wording matches the buttons in the app.

1. **Open the app and press HOST GAME.** On the setup screen, check the
   **TYPED ANSWERS** switch: it is off by default and any `TYPE_ANSWER` rows
   are left out while it is off. Leave it off unless the file was written with
   typed answers on.
2. **Press IMPORT MY OWN QUESTIONS.** Three sources are offered:
   - **Select File**: a `.csv`, `.tsv` or `.txt` file saved as UTF-8. Commas,
     semicolons or tabs between cells all work. This is the one to use for a
     file this skill wrote.
   - **Google Sheet URL**: paste the link to a sheet shared as "Anyone with
     the link can view" and press Import. Use this for a merged library.
   - **LOAD THE QUESTION BANK**: the built-in premade bank, no file needed.
3. **Pick what plays.** The next screen lists every category in the file as a
   round. Keep the ones for tonight and set **Rounds** and **Questions per
   round**; a 30-question category feeds a round of any length, and the
   questions are drawn at random from what is kept.
4. **Review every question.** The review screen shows each round with the
   correct answer marked, says how many rows were left out and why, and has a
   regenerate button that rewrites one weak question at the current difficulty
   setting. Then **APPROVE & OPEN LOBBY**.

Building a library out of many files: paste each file into one tab of one
Google Sheet under the same header. The game ignores the `difficulty` column,
so it is the filter: export only the `school` rows for a normal night, the
`everyday` rows for a family one. To make that sheet the app's default bank,
point `DEFAULT_QUESTION_BANK` in `src/constants.ts` at it.

The full column reference is `QUESTION_FORMAT.md` in the OmniTrivia
repository, and `QUESTION_PROMPT.md` there is the same brief as a paste-in
prompt for claude.ai.

## Example

Request: "Give me 30 high-school level Space questions for Friday."

Settings read: category Space, difficulty `school`, count 30, typed answers
off. Mix: 20 multiple choice, 6 true/false, 4 others, each a different
format and each the easiest question in the set (say one SLIDER on how many
minutes sunlight takes to reach Earth, one PUZZLE ordering four planets
outward from the Sun, one MULTI_SELECT on which of these are moons, one
SCRAMBLE of a planet name). Each "other" takes a subject the multiple choice
rows then leave alone. File written to `questions-space-school.csv`,
validator clean, delivered with the import steps.
