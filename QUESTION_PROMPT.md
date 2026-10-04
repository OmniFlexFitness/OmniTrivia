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
people answering on their phones. I need the output as a CSV I can import
directly, so the format rules below are strict — a malformed row is left out
of the game.

SETTINGS — these are the only things I change between runs:
  CATEGORIES: Science, History, Geography, Pop Culture, Sports, Tech, Art,
              Literature, Music, Food
  QUESTIONS PER CATEGORY: 6
  AUDIENCE: a relaxed bar crowd, mixed ages, answering out loud
  DIFFICULTY: mostly gettable — per category, roughly two easy, three medium,
              one that rewards someone who actually knows the subject
  TYPE MIX per category: 2 MULTIPLE_CHOICE, 1 TRUE_FALSE, and 3 of the other
              formats, picked to suit each question (vary them across
              categories so every format turns up somewhere)

CONTENT RULES
- One defensibly correct answer per question. If two answers could be argued,
  rewrite the question.
- Wrong options must be plausible to someone who does not know, and clearly
  wrong to someone who does. No joke options, no "none of the above".
- No two questions in a category about the same person, event or work.
- Skip the most worn-out pub quiz questions.
- Keep each question on one line, ideally under 120 characters — it is read
  against a clock.
- The explanation is one sentence, and should be worth reading aloud — the
  reason the answer is what it is, or the fact that makes it stick.

OUTPUT FORMAT
Return ONLY the CSV. No preamble, no commentary, no markdown fences.
First line is exactly this header:

type,category,question,option1,option2,option3,option4,option5,option6,correctAnswer,explanation,image,margin,unit,timeLimit

One question per line. Every line has all 15 fields, so unused columns are
left empty (adjacent commas). Group all of a category's rows together; each
distinct category becomes one category the game's wheel can land on. The
order rows appear in does not matter — the host picks which categories to
play on import, and everything is shuffled after that. Leave image, margin,
unit and timeLimit empty unless a format below says to use them.

WHAT THE COLUMNS MEAN, PER FORMAT

MULTIPLE_CHOICE — option1-4 are the choices, option5-6 empty. correctAnswer
must repeat one option word for word.

MULTI_SELECT — a "which of these" question with more than one right answer.
option1-5 are the choices (4 or 5 of them), of which 2 or 3 are right.
correctAnswer lists every right option word for word, separated by pipes:
Helium|Argon. A wrong pick cancels a right one.

TRUE_FALSE — the question is a statement. option1=True, option2=False, the
rest empty. correctAnswer is True or False. Aim for about half False.

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
Bracket the true answer without giving it away. The step must be able to land
inside the correct window. correctAnswer is the real answer written out, e.g.
About 384,000 km. Put low in margin so a near miss earns a few points.

RANGE — players drag two handles to catch the answer; the tighter the range,
the more it pays. option1 = lowest value, option2 = highest value, option3 =
step, all numbers, on a scale wide enough that the answer is not obvious from
it. correctAnswer is the exact answer as a plain number. unit is what it
counts (m, km, years) or empty.

NUMBER — closest guess wins and no scale is shown. All options empty.
correctAnswer is the exact answer as a plain number. unit is what it counts
or empty. Only use numbers with one defensible value.

PIN — players drop a pin on a built-in map. image is world, or usa for the
lower 48 states only. option1 = latitude, option2 = longitude (decimal
degrees), option3 = how many km from the spot still counts — 300 to 800 on the
world map, 60 to 250 on the US map. correctAnswer is the place's name. Only
famous places with unambiguous coordinates. Phrase it as Drop a pin on ... or
as a clue to the place.

PUZZLE — players drag items into order. Put option1-4 in the CORRECT order;
the game shuffles them. Order by something unarguable, usually date. All four
must be right to score. correctAnswer repeats the four items in that same
order separated by pipes: First|Second|Third|Fourth

MATCH — players pair items up. option1-4 are four pairs, each written
item = partner, in the right pairs; the game shuffles the partners. Every
partner different, and never use = or | inside an item. correctAnswer is
See the pairs.

CATEGORIZE — players sort items into groups. option1-6 are six items, each
written item = group, using exactly 2 or 3 groups with at least 2 items each.
correctAnswer is See the groups. Put 40 in timeLimit.

SCRAMBLE — players rebuild a word from its shuffled letters. The question is
the clue. All options empty. correctAnswer is one word or a two-word name,
5 to 12 letters.

CSV RULES — the importer is strict about these
- Never put a line break inside a field. Every question is one line.
- Never use double-quote characters anywhere in the text. If you would quote
  something, use single quotes.
- If a field contains a comma, wrap that field in double quotes. That is the
  only place double quotes may appear.
- Do not leave category, question or correctAnswer empty — rows missing any
  of those are left out.

EXAMPLE OF EACH FORMAT (format only — write your own content)

MULTIPLE_CHOICE,Science,Which planet is known as the Red Planet?,Mars,Venus,Jupiter,Mercury,,,Mars,Iron oxide dust gives Mars its rusty colour.,,,,
MULTI_SELECT,Science,Which of these are noble gases?,Helium,Nitrogen,Argon,Oxygen,,,Helium|Argon,Noble gases barely react because their outer electron shells are full.,,,,
TRUE_FALSE,Science,Sound travels faster through water than through air.,True,False,,,,,True,"Water is far less compressible, so sound moves about four times faster in it.",,,,
TYPE_ANSWER,Music,Which Beatle was known as the quiet one?,George Harrison,Harrison,George,,,,George Harrison,"He wrote Something, which Sinatra called the best love song of the era.",,,,
SLIDER,History,In what year did Apollo 11 land on the Moon?,1960,1980,1,1968,1970,,1969,Armstrong stepped out six hours after touchdown because nobody could sleep.,,low,,
RANGE,Geography,How tall is Mount Everest in metres?,5000,10000,10,,,,8849,It was last surveyed at 8848.86 m in 2020.,,,m,
NUMBER,Science,How many bones are in the adult human body?,,,,,,,206,Babies start with closer to 300 and many fuse together as they grow.,,,,
PIN,Geography,Drop a pin on Mount Kilimanjaro.,-3.0674,37.3556,400,,,,Mount Kilimanjaro,Africa's highest peak sits just south of the equator.,world,,,
PUZZLE,Tech,"Put these gadgets in order of release, earliest first.",Sony Walkman,Nintendo Game Boy,Apple iPod,Amazon Kindle,,,Sony Walkman|Nintendo Game Boy|Apple iPod|Amazon Kindle,"1979, 1989, 2001 and 2007 - roughly a decade apart until the 2000s sped up.",,,,
MATCH,Science,Match each element to its chemical symbol.,Gold = Au,Silver = Ag,Iron = Fe,Sodium = Na,,,See the pairs,The symbols come from the Latin aurum and argentum and ferrum and natrium.,,,,
CATEGORIZE,Food,"Botanically speaking, fruit or vegetable?",Tomato = Fruit,Cucumber = Fruit,Carrot = Vegetable,Bell pepper = Fruit,Potato = Vegetable,Celery = Vegetable,See the groups,Anything that grows from a flower and carries seeds is a fruit to a botanist.,,,,40
SCRAMBLE,Music,Unscramble the instrument.,,,,,,,Saxophone,Adolphe Sax patented it in 1846.,,,,

Now write CATEGORIES × QUESTIONS PER CATEGORY questions using the settings above.
````

---

## Before you play it

The review screen after import is the last cheap place to catch a mistake. It
lists every round and marks the correct answer, so read it.

Worth checking specifically:

- **The round count and question count match what you asked for.** If a round
  is short, some rows were dropped for a missing required field.
- **The ✓ is on the right answer** in each multiple choice and select-all
  question. A `correctAnswer` that does not match any option leaves the
  question out, and the setup screen says how many were.
- **Slider ranges** make sense, and the correct window is not so narrow that
  nobody can land in it.
- **Puzzle items** are in the true order in the file. They are shuffled for
  players, so the file order is the answer key.
- **Typed answers** list every spelling you would accept out loud.
- **Pins** land where they should — the review screen draws the ring on the
  map. Coordinates from a model are usually right for famous places and
  worth a glance for anything smaller.
- **Matches and sorts** pair the right things up — the review lists them.

If a category shows as ❓ in grey on the wheel, the name simply is not one of
the ten built-ins. It still plays normally.

`QUESTION_FORMAT.md` is the full column reference, and
`questions.example.csv` is a working example with every format in it.

Nothing to write today? **HOST GAME → USE THE QUESTION BANK** loads several
hundred premade questions with no file and no key. This prompt is for when you
want a set that is yours.
