# Prompt for generating your own questions

Paste the block below into any assistant (Claude, ChatGPT, whatever you have
open), edit the **SETTINGS** at the top, and it returns a CSV. Save that as
`my-questions.csv` and load it with **HOST GAME → IMPORT MY OWN QUESTIONS →
Select File**. No API key is involved on this path.

The categories are yours to change — whatever you put in `CATEGORIES` becomes
the rounds and the wheel. The list below is the ten the wheel ships with, so
leaving it alone reproduces the built-in look. Any other name works too and
shows on the wheel with a ❓ in grey, which is the only difference.

There is a checklist at the bottom of this file for sanity-checking what comes
back before you play it in front of a room.

---

````text
You are writing trivia questions for a game I host on a screen for a room of
people. I need the output as a CSV I can import directly, so the format rules
below are strict — a malformed row is silently dropped or, worse, plays with
the wrong answer highlighted.

SETTINGS — these are the only things I change between runs:
  CATEGORIES: Science, History, Geography, Pop Culture, Sports, Tech, Art,
              Literature, Music, Food
  QUESTIONS PER CATEGORY: 5
  AUDIENCE: a relaxed bar crowd, mixed ages, answering out loud
  DIFFICULTY: mostly gettable — per category, roughly one easy, two medium,
              one that rewards someone who actually knows the subject
  TYPE MIX per category: 3 MULTIPLE_CHOICE, 1 TRUE_FALSE, and 1 of
              SLIDER / TYPE_ANSWER / PUZZLE (vary which one across categories)

CONTENT RULES
- One defensibly correct answer per question. If two answers could be argued,
  rewrite the question.
- Wrong options must be plausible to someone who does not know, and clearly
  wrong to someone who does. No joke options, no "none of the above".
- No two questions in a category about the same person, event or work.
- Skip the most worn-out pub quiz questions.
- Keep each question on one line, ideally under 120 characters.
- The explanation is one sentence, and should be worth reading aloud — the
  reason the answer is what it is, or the fact that makes it stick.

OUTPUT FORMAT
Return ONLY the CSV. No preamble, no commentary, no markdown fences.
First line is exactly this header:

type,category,question,option1,option2,option3,option4,option5,correctAnswer,explanation

One question per line. Every line has all 10 fields, so unused option columns
are left empty (adjacent commas). Group all of a category's rows together;
each distinct category becomes one round, in the order it first appears.

WHAT THE COLUMNS MEAN, PER TYPE

MULTIPLE_CHOICE — option1-4 are the choices, option5 empty. correctAnswer must
repeat one option word for word.

TRUE_FALSE — option1=True, option2=False, options 3-5 empty. correctAnswer is
True or False.

TYPE_ANSWER — players type an answer. EVERY option is an accepted spelling, so
list the full name, the surname alone, and any common variant, one per option
column. Matching ignores case and extra spaces but is otherwise exact, so an
answer you forgot to list is marked wrong. correctAnswer repeats option1.

SLIDER — players drag to a number. The options are positional, all numbers:
  option1 = lowest value on the slider
  option2 = highest value on the slider
  option3 = step size
  option4 = lowest value that counts as correct
  option5 = highest value that counts as correct
Bracket the true answer without giving it away, and make the correct window
wide enough that a good guess wins. The step must be able to land inside that
window (a step of 10 with a window of 384-386 is unwinnable). correctAnswer is
the real answer written out, e.g. About 384,000 km.

PUZZLE — players drag items into order. Put option1-4 in the CORRECT order;
the game shuffles them. Order by something unarguable, usually date. All four
must be right to score. correctAnswer repeats the four items in that same
order separated by pipes: First|Second|Third|Fourth

CSV RULES — the importer is strict about these
- Never put a line break inside a field. Every question is one line.
- Never use double-quote characters anywhere in the text. If you would quote
  something, use single quotes.
- If a field contains a comma, wrap that field in double quotes. That is the
  only place double quotes may appear.
- Do not leave category, question, option1 or correctAnswer empty — rows
  missing any of those are skipped without warning.

EXAMPLE OF EACH TYPE (format only — write your own content)

MULTIPLE_CHOICE,Science,Which planet is known as the Red Planet?,Mars,Venus,Jupiter,Mercury,,Mars,Iron oxide dust gives Mars its rusty colour.
TRUE_FALSE,Science,Sound travels faster through water than through air.,True,False,,,,True,"Water is far less compressible, so sound moves about four times faster in it."
TYPE_ANSWER,Music,Which Beatle was known as the quiet one?,George Harrison,Harrison,George,,,George Harrison,"He wrote Something, which Sinatra called the best love song of the era."
SLIDER,History,In what year did Apollo 11 land on the Moon?,1960,1980,1,1968,1970,1969,Armstrong stepped out six hours after touchdown because nobody could sleep.
PUZZLE,Tech,"Put these gadgets in order of release, earliest first.",Sony Walkman,Nintendo Game Boy,Apple iPod,Amazon Kindle,,Sony Walkman|Nintendo Game Boy|Apple iPod|Amazon Kindle,"1979, 1989, 2001 and 2007 - roughly a decade apart until the 2000s sped up."

Now write CATEGORIES × QUESTIONS PER CATEGORY questions using the settings above.
````

---

## Before you play it

The review screen after import is the last cheap place to catch a mistake. It
lists every round and marks the correct answer, so read it.

Worth checking specifically:

- **The round count and question count match what you asked for.** If a round
  is short, some rows were dropped for a missing required field.
- **The ✓ is on the right answer** in each multiple choice question. A
  `correctAnswer` that does not match any option falls back to option 1 —
  which is a wrong answer shown as right, in front of everyone.
- **Slider ranges** make sense, and the correct window is not so narrow that
  nobody can land in it.
- **Puzzle items** are in the true order in the file. They are shuffled for
  players, so the file order is the answer key.
- **Typed answers** list every spelling you would accept out loud.

If a category shows as ❓ in grey on the wheel, the name simply is not one of
the ten built-ins. It still plays normally.

`QUESTION_FORMAT.md` is the full column reference, and `questions.csv` is a
complete working example — 10 rounds of 5 across all five types.
