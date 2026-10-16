# Pre-generating questions by category and difficulty

This is the prompt for building a question library ahead of a night: one run
per category per difficulty, saved as CSV, merged into a sheet you load with
**HOST GAME → IMPORT MY OWN QUESTIONS** (or as the question bank). It is the
same brief the app's own GENERATE & REVIEW sends, so a pre-generated set plays
at the same level as a generated one — but you get to read it first, keep the
good rows, and never pay for a question twice.

How to use it:

1. **One category, one difficulty, one run.** Copy the block, set `CATEGORY`,
   `DIFFICULTY` and `QUESTIONS`, paste it into Claude. A run of 20 to 30
   questions is the sweet spot — long enough to be worth reviewing, short
   enough that the model stays sharp on every row.
2. **Save the reply as a CSV** named `questions-<category>-<difficulty>.csv`
   (`questions-science-school.csv`). The reply is the file; nothing to edit.
3. **Review it** — the checklist at the bottom of this page, then the app's
   review screen after import.
4. **Merge** the files into one sheet. The `difficulty` column is yours: the
   game ignores it, so filter on it when you export a night's set.

The recommended model and settings are after the prompt.

The same brief is also a Claude skill, `.claude/skills/omnitrivia-questions/`,
for when you would rather say "30 high-school Space questions" than paste
this: it writes the file, validates it with `scripts/validate_csv.py`, and
ends with the import steps. The prompt below is for any assistant, or for a
claude.ai chat without the skill installed.

---

## The prompt

````text
You are writing trivia questions for a bar-night game played on phones by a
mixed room — friends, families, regulars, people who have had a drink. They
are not a quiz team. The game is head-to-head and scored on speed, so it does
not need hard questions to be competitive: it needs questions everybody in
the room knows the answer to and races to tap. I need the output as a CSV I
can import directly, so the format rules below are strict — a malformed row
is left out of the game.

SETTINGS — the only things I change between runs:
  CATEGORY: Science
  DIFFICULTY: HIGH SCHOOL        (EVERYDAY, HIGH SCHOOL or PUB QUIZ — see below)
  QUESTIONS: 24
  TYPED ANSWERS: off             (off = do not write any TYPE_ANSWER rows)
  TYPE MIX: about two thirds MULTIPLE_CHOICE, about one in five TRUE_FALSE,
            and the rest — at most one question in six — spread across the
            other formats, never two of the same format, and those are the
            EASIEST questions in the set, because the format itself is the
            work.

DIFFICULTY LEVELS — write every question at the level set above.

  EVERYDAY — Every question is something a typical 12-year-old knows, or that
  daily life makes obvious: colours, animals, the days and months, famous
  landmarks, the biggest films, the most famous people alive, what things are
  called. The test for every question: would a 12-year-old and their
  grandparent both know this instantly, without working anything out? If
  not, do not ask it — find an easier fact about the same category. Nearly
  everybody in the room should get nearly every question; the game is
  decided on speed, not knowledge. Right level: How many legs does a spider
  have? What colour do you get by mixing blue and yellow? Which planet do we
  live on? Too hard: What is the capital of Australia? Who painted The
  Starry Night? How many bones are in the adult human body?

  HIGH SCHOOL — Every question is something a typical high-school graduate
  who paid moderate attention would know without studying, or that everyday
  life makes obvious: the kind of fact in a school textbook, on a famous
  landmark, in a blockbuster film or a hit song everybody has heard. The test
  for every question: would an average 17-year-old, and an average adult who
  has not followed the subject since school, know this instantly, without
  looking it up or working anything out? If not, do not ask it — find an
  easier fact about the same category. About two thirds of the questions are
  ones nearly everybody gets, the rest ones about half the room gets. There
  are no stretch questions at this level: nothing that rewards a fan, a
  graduate in the subject or a pub-quiz regular. Right level: What is the
  capital of France? Which planet is closest to the Sun? Who painted the Mona
  Lisa? How many players does a basketball team have on the court? What gas
  do plants take in from the air? Which ocean is the largest? Too hard —
  never write questions like these: Who was the last emperor of the Western
  Roman Empire? Which element is most abundant in the Earth's crust by mass?
  Who played the saxophone on Baker Street? Which Bronte sister published as
  Currer Bell? What was the first item sold on eBay? Which African country
  borders the most others? If a question needs a date, a measurement or a
  name that only a fan knows, it is too hard.

  PUB QUIZ — About half the questions easy (most of the room gets them),
  about a third medium (half the room gets them), and at most one in six a
  stretch — one a person can still reason or eliminate their way to, never
  specialist knowledge. If you are not sure most people have heard of the
  answer, make the question easier. Right level for a stretch: Which country
  has the most time zones? Who wrote Pride and Prejudice? Too hard even here:
  Who was the last emperor of the Western Roman Empire? Who played the
  saxophone on Baker Street?

CATEGORY NOTES — what each category is about, at these levels. Stay inside
the note for the category set above.
  Science: everyday science — planets, the body, animals, weather, states of
    matter, famous inventions. School-lab facts, not research.
  History: the famous events and names everybody has heard of — world wars,
    presidents, ancient Egypt and Rome, the Moon landing, the Titanic.
    Centuries and decades, never exact years.
  Geography: capitals, countries, continents, oceans, famous landmarks and
    rivers, flags of big countries, US states.
  Pop Culture: the biggest films, TV shows, celebrities, memes and franchises
    of the last 40 years — the things that were everywhere, not deep cuts.
  Sports: the rules, equipment, famous teams, biggest events and most famous
    athletes of the major sports. No seasons, scores or stat lines.
  Tech: everyday technology — phones, apps, websites, famous companies and
    founders, what common things are called. No version numbers or specs.
  Art: the most famous paintings, sculptures, artists and styles — the ones
    on postcards and in every textbook — plus basic colour and craft terms.
  Literature: the most famous books, authors and characters — school reading
    lists, blockbusters, children's classics. Plots and characters, not
    publication dates.
  Music: the biggest artists, bands, songs, instruments and genres across
    the decades. Hits, not B-sides.
  Food: common dishes, ingredients, cuisines, drinks and kitchen basics.
    Things people cook, order and eat.
  Fitness: common gym knowledge — major muscles, classic exercises, basic
    training terms, famous athletes. Nothing that needs a certification.
  Nutrition: the basics people see on a label — macronutrients, vitamins,
    common foods and what they are known for. No dosages or study findings.
  Anatomy: the body as taught in school — major organs, bones, muscles and
    senses, and what they do.
  Supplements: the household names — protein, creatine, caffeine, vitamins —
    what they are and what they are famous for. No research claims.
  Movies: famous films, actors, directors, quotes and characters — box
    office hits and classics everybody has seen or heard of.
  Video Games: the biggest franchises, characters, consoles and companies.
    Mario, Pokemon, Minecraft, not patch notes.
  Space: planets, the Moon, the Sun, astronauts, famous missions and
    everyday sky facts.
  Animals: well-known animals and what makes them famous — the biggest, the
    fastest, where they live, what they eat, their babies.
  Mythology: the famous Greek, Roman and Norse gods, heroes and monsters, and
    the stories everybody half-remembers.
  Internet Culture: the sites, apps, memes and creators everybody has used
    or seen. Mainstream, not niche communities.

CONTENT RULES
- Apply the level's test to every single question before you write it. When
  in doubt, go easier: a question that is too easy costs nothing, a question
  that is too hard loses the room.
- Never ask for an exact year, a precise statistic, a minor character, a
  specific episode, a name only an enthusiast knows, or anything that takes
  two facts to work out.
- One defensibly correct answer per question. If two answers could be
  argued, rewrite the question.
- Wrong options must be plausible to someone who does not know, and clearly
  wrong to someone who does — and they are things the room has heard of, so
  the question is which of these, not have you heard of these. Keep options
  short, one to four words. No joke options, no none of the above.
- No two questions in the set about the same person, event or work. Spread
  the set across the whole category.
- Skipping worn-out pub-quiz questions is fine, but never by making a
  question harder: a fresh angle on a famous thing beats an obscure thing.
- Keep each question to one plain sentence, ideally under 90 characters,
  with no double negatives and no trick wording — it is read against a
  clock.
- The explanation is one sentence worth reading aloud — the reason the
  answer is what it is, or the fact that makes it stick.

OUTPUT FORMAT
Return ONLY the CSV. No preamble, no commentary, no markdown fences.
First line is exactly this header:

type,category,question,option1,option2,option3,option4,option5,option6,correctAnswer,explanation,image,margin,unit,timeLimit,difficulty

One question per line. Every line has all 16 fields, so unused columns are
left empty (adjacent commas). category is the CATEGORY set above on every
row, spelled exactly the same way. difficulty is the DIFFICULTY set above on
every row, written as everyday, school or quiz — the game ignores this column;
it is for sorting the sheet. Leave image, margin, unit and timeLimit empty
unless a format below says to use them.

WHAT THE COLUMNS MEAN, PER FORMAT

MULTIPLE_CHOICE — option1-4 are the choices, option5-6 empty. correctAnswer
must repeat one option word for word.

TRUE_FALSE — the question is a short statement that sounds plausible either
way. option1=True, option2=False, the rest empty. correctAnswer is True or
False. Aim for about half False, and make a false statement a believable
near miss, never nonsense.

MULTI_SELECT — a "which of these" question with more than one right answer.
option1-5 are well-known choices (4 or 5 of them), of which 2 or 3 are right,
and the right ones obviously right to anyone who knows the subject at all.
correctAnswer lists every right option word for word, separated by pipes:
Helium|Argon. A wrong pick cancels a right one.

SLIDER — players drag to a number people have a rough feel for (a famous
year, a height, a count), never a statistic. The options are positional, all
numbers:
  option1 = lowest value on the slider
  option2 = highest value on the slider
  option3 = step size
  option4 = lowest value that counts as correct
  option5 = highest value that counts as correct
Bracket the true answer without giving it away, and make the correct window
generous — a sensible guess should land in it. The step must be able to land
inside the correct window. correctAnswer is the real answer written out, e.g.
About 384,000 km. Put low in margin so a near miss earns a few points.

RANGE — players drag two handles to catch the answer; the tighter the range,
the more it pays. option1 = lowest value, option2 = highest value, option3 =
step, all numbers, on a scale wide enough that the answer is not obvious from
it. correctAnswer is the exact answer as a plain number. unit is what it
counts (m, km, years) or empty.

NUMBER — closest guess wins and no scale is shown, so the answer must be a
number most people roughly know (days in a year, states in the US, players
on a football team). All options empty. correctAnswer is the exact answer as
a plain number. unit is what it counts or empty. Only use numbers with one
defensible value.

PIN — players drop a pin on a built-in map. image is world, or usa for the
lower 48 states only. option1 = latitude, option2 = longitude (decimal
degrees), option3 = how many km from the spot still counts — be generous: 600
to 800 on the world map, 150 to 250 on the US map. correctAnswer is the
place's name. Only iconic places — famous cities, countries, landmarks — with
unambiguous coordinates. Phrase it as Drop a pin on ... or as a clue to the
place.

PUZZLE — players drag items into order. Put option1-4 in the CORRECT order;
the game shuffles them. Four famous items, ordered by something unarguable,
usually date, and far apart in it — decades between events, not years — so
nobody needs exact figures. All four must be right to score. correctAnswer
repeats the four items in that same order separated by pipes:
First|Second|Third|Fourth

MATCH — players pair items up. option1-4 are four famous pairs, each written
item = partner, in the right pairs; the game shuffles the partners. Every
partner plainly belongs to one item (country and capital, band and singer),
every partner different, and never use = or | inside an item. correctAnswer
is See the pairs.

CATEGORIZE — players sort items into groups. option1-6 are six everyday
items, each written item = group, using exactly 2 groups of 3 (3 groups only
if they are obvious), with every item plainly in one group and no borderline
cases. correctAnswer is See the groups.

SCRAMBLE — players rebuild a word from its shuffled letters. The question is
a clue that points straight at the word. All options empty. correctAnswer is
one common word of 5 to 8 letters that the whole room knows.

TYPE_ANSWER — only when TYPED ANSWERS is on. Players type an answer, so it is
a single word or a famous name everybody can spell. EVERY option is an
accepted spelling, so list the full name, the surname alone, and any common
variant or misspelling, one per option column. Matching ignores case and
extra spaces but is otherwise exact, so an answer you forgot to list is
marked wrong. correctAnswer repeats option1.

CSV RULES — the importer is strict about these
- Never put a line break inside a field. Every question is one line.
- Never use double-quote characters anywhere in the text. If you would quote
  something, use single quotes.
- If a field contains a comma, wrap that field in double quotes. That is the
  only place double quotes may appear.
- Do not leave category, question or correctAnswer empty — rows missing any
  of those are left out.

EXAMPLE OF EACH FORMAT (format only — write your own content, at the level
set above)

MULTIPLE_CHOICE,Science,Which planet is known as the Red Planet?,Mars,Venus,Jupiter,Mercury,,,Mars,Iron oxide dust gives Mars its rusty colour.,,,,,school
TRUE_FALSE,Science,Sound travels faster through water than through air.,True,False,,,,,True,"Water is far less compressible, so sound moves about four times faster in it.",,,,,school
MULTI_SELECT,Science,Which of these are planets?,Mars,The Moon,Jupiter,The Sun,,,Mars|Jupiter,The Moon and the Sun are in the sky every day but neither orbits a star as a planet does.,,,,,school
SLIDER,History,In what year did Apollo 11 land on the Moon?,1940,1980,1,1968,1970,,1969,Armstrong stepped out six hours after touchdown because nobody could sleep.,,low,,,school
RANGE,Geography,How tall is Mount Everest in metres?,5000,10000,10,,,,8849,It was last surveyed at 8848.86 m in 2020.,,,m,,school
NUMBER,Science,How many bones are in the adult human body?,,,,,,,206,Babies start with closer to 300 and many fuse together as they grow.,,,,,quiz
PIN,Geography,Drop a pin on Paris.,48.8566,2.3522,700,,,,Paris,The Eiffel Tower was meant to be torn down after twenty years.,world,,,,school
PUZZLE,Tech,"Put these gadgets in order of release, earliest first.",Sony Walkman,Nintendo Game Boy,Apple iPod,Amazon Kindle,,,Sony Walkman|Nintendo Game Boy|Apple iPod|Amazon Kindle,"1979, 1989, 2001 and 2007 - roughly a decade apart until the 2000s sped up.",,,,,school
MATCH,Geography,Match each country to its capital.,France = Paris,Japan = Tokyo,Italy = Rome,Egypt = Cairo,,,See the pairs,All four capitals are also their country's biggest city.,,,,,school
CATEGORIZE,Food,"Botanically speaking, fruit or vegetable?",Tomato = Fruit,Cucumber = Fruit,Carrot = Vegetable,Bell pepper = Fruit,Potato = Vegetable,Celery = Vegetable,See the groups,Anything that grows from a flower and carries seeds is a fruit to a botanist.,,,,,quiz
SCRAMBLE,Music,Unscramble the instrument.,,,,,,,Guitar,Six strings and the most-played instrument in the world.,,,,,everyday
TYPE_ANSWER,Music,Which Beatle was known as the quiet one?,George Harrison,Harrison,George,,,,George Harrison,"He wrote Something, which Sinatra called the best love song of the era.",,,,,quiz

Now write QUESTIONS questions about CATEGORY at the DIFFICULTY set above.
````

---

## Model, effort and settings

| Where you run it | Model | Thinking / effort | Why |
|---|---|---|---|
| **claude.ai** (your Max plan, no API cost) | The newest **Opus** in the model picker | **Extended thinking on** | Opus holds the level and the format rules across 30 rows; Sonnet drifts harder and drops columns more often |
| **Claude API** (the app, the script, or your own call) | `claude-opus-5-5` | Adaptive thinking, `effort: "high"` | The current Opus at the lower Opus price; `high` is the sweet spot for this job, `xhigh` and `max` buy nothing on trivia |
| **A cheap bulk run** (hundreds of rows you will cut down) | `claude-sonnet-5-5` | `effort: "high"` | Fine for EVERYDAY; review HIGH SCHOOL sets from it more carefully |

Settings that matter at every level:

- **One category per run.** Twenty categories in one message produces one
  category's worth of attention spread over twenty. Twenty messages of one
  category each produce twenty sets that each got all of it.
- **20 to 30 questions per run.** Under 20 and the format examples outweigh
  the content; over 30 and the model repeats itself by the bottom of the
  file. For a category you want 60 of, run it three times and ask the later
  runs to avoid the subjects already covered (paste the earlier questions).
- **Structured output beats prose.** In claude.ai, the CSV instruction above
  is enough. Through the API, use `output_config.format` with a schema (the
  app does this in `src/services/claudeService.ts`) and let the importer's
  converter build the rows — it is stricter than any CSV rule in a prompt.
- **`max_tokens` 16000** for a 30-row run through the API, non-streaming.
  A 24-row high-school set is roughly 3,000 output tokens plus thinking.
- **Temperature and the like are not available** with thinking on; vary the
  set by varying the prompt (a different `QUESTIONS` count, or the
  avoid-list above), not the sampling.
- **Cost.** At `claude-opus-5-5` rates a 24-question run is a few cents.
  Pre-generating all 20 categories at all three levels is well under five
  dollars, and within the monthly API credit a Max plan includes once a
  Console organization is linked to it.

The Node script runs the same brief with the same defaults, and writes the
CSV for you:

```bash
npm run generate-questions -- --categories Science --difficulty school --out science-school.csv
npm run generate-questions -- --categories "Pop Culture,Movies" --difficulty everyday --out easy-night.csv
```

It takes `everyday`, `school` (the default) or `quiz`, needs an API key in
`.env`, and names the ten built-in categories; for the other ten, use the
prompt above in claude.ai.

## Building the library

- **File per run:** `questions-<category>-<difficulty>.csv`, in a folder per
  night or per season. Nothing in the file says which run it came from
  except the `difficulty` column, so keep the name honest.
- **One sheet, one tab, every row.** Paste every file into one Google Sheet
  under the same header. That tab is your bank: share it as "anyone with the
  link can view" and point `DEFAULT_QUESTION_BANK` at it, or export it to
  CSV for a venue with bad Wi-Fi.
- **Filter on export.** A HIGH SCHOOL night is the rows where `difficulty` is
  `school`; an easy family night is `everyday`. The game ignores the column,
  so a mixed file plays as a mix.
- **Typed answers stay out** unless you turn the TYPED ANSWERS switch on at
  game setup; a `TYPE_ANSWER` row in the file is left out otherwise, and the
  review screen says how many.
- **Regenerate the weak rows, not the file.** The review screen's regenerate
  button rewrites one question at the night's difficulty setting, in the same
  format. For a file, delete the row and run the category again with an
  avoid-list.

## Before you play it

The review screen after import is the last cheap place to catch a mistake. It
lists every round and marks the correct answer, so read it.

Worth checking specifically:

- **Every question passes the level's test.** Read the set as the room, not
  as the host. If you would have to think, it is a PUB QUIZ row that slipped
  into a HIGH SCHOOL file — delete it or move it.
- **The round count and question count match what you asked for.** If a round
  is short, some rows were dropped for a missing required field.
- **The ✓ is on the right answer** in each multiple choice and select-all
  question. A `correctAnswer` that does not match any option leaves the
  question out, and the review screen says how many were.
- **Slider ranges** make sense, and the correct window is not so narrow that
  nobody can land in it.
- **Puzzle items** are in the true order in the file. They are shuffled for
  players, so the file order is the answer key.
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
