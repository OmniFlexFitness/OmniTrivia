# The OmniTrivia CSV format

The importer reads a CSV with a header row and one question per row. A row
that breaks the rules is left out of the game and counted on the review
screen; it does not fail the import. Write the file so that nothing is left
out.

## The header

The first line is exactly this, in this order:

```text
type,category,question,option1,option2,option3,option4,option5,option6,correctAnswer,explanation,image,margin,unit,timeLimit,difficulty
```

Every row has all 16 fields. Unused fields are left empty, so adjacent commas
are normal. The game only knows the first 15 columns; `difficulty` is ignored
by the importer and exists so a library can be filtered. Write it on every
row anyway, as `everyday`, `school` or `quiz`.

## Columns that are the same for every format

| Column | Rule |
| --- | --- |
| `type` | One of the twelve format names below, upper case with underscores. |
| `category` | The category name, spelled the same way on every row. Required. |
| `question` | One plain sentence. Required. |
| `correctAnswer` | What the format below says. Required. |
| `explanation` | One sentence read aloud after the answer. Strongly recommended, never empty in a set from this skill. |
| `image` | Empty, except `world` or `usa` for PIN. |
| `margin` | Empty, except for SLIDER where it is `low`, `medium` or `high`. |
| `unit` | Empty, except RANGE and NUMBER where it names what is counted (`m`, `km`, `years`) or stays empty. |
| `timeLimit` | Empty. The game gives each format its own clock (15 s multiple choice, 12 s true/false, 25 s select-all, slider, range and number, 35 s pin and unscramble, 45 s puzzle, match and sort) plus reading time for long questions. Only set it to override that. |
| `difficulty` | `everyday`, `school` or `quiz`, the level the file was written at. |

## What each format puts in the option columns

### MULTIPLE_CHOICE

`option1` to `option4` are the four choices, `option5` and `option6` empty.
`correctAnswer` repeats one of the four word for word, same capitals, same
spelling. Options distinct, one to four words each.

### TRUE_FALSE

The question is a short statement that sounds plausible either way.
`option1` is `True`, `option2` is `False`, the rest empty. `correctAnswer` is
`True` or `False`. About half of them false, and a false statement is a
believable near miss.

### MULTI_SELECT

A "which of these" question with more than one right answer. `option1` to
`option5` hold four or five well-known choices, of which two or three are
right, and the right ones are obviously right to anyone who knows the subject
at all. `correctAnswer` lists every right option word for word, separated by
pipes: `Helium|Argon`. A wrong pick cancels a right one, so there is no room
for a borderline option.

### SLIDER

Players drag to a number people have a rough feel for (a famous year, a
height, a count), never a statistic. The options are positional and all
numbers:

| Column | Holds |
| --- | --- |
| `option1` | lowest value on the slider |
| `option2` | highest value on the slider |
| `option3` | step size |
| `option4` | lowest value that counts as correct |
| `option5` | highest value that counts as correct |

Bracket the true answer without giving it away, make the correct window
generous enough that a sensible guess lands in it, and make sure a step from
the bottom of the slider can land inside the window. `correctAnswer` is the
real answer written out (`1969`, `About 384,000 km`). Put `low` in `margin`
so a near miss earns a few points.

### RANGE

Players drag two handles to catch the answer; the tighter the range, the more
it pays. `option1` lowest value, `option2` highest value, `option3` step, all
numbers, on a scale wide enough that the answer is not obvious from it.
`correctAnswer` is the exact answer as a plain number. `unit` is what it
counts or empty.

### NUMBER

Closest guess wins and no scale is shown, so the answer must be a number most
people roughly know (days in a year, US states, players on a football team).
All options empty. `correctAnswer` is the exact answer as a plain number with
one defensible value. `unit` is what it counts or empty.

### PIN

Players drop a pin on a built-in map. `image` is `world`, or `usa` for the
lower 48 states only. `option1` latitude, `option2` longitude, both decimal
degrees with no thousands separators, `option3` how many km from the spot
still counts; be generous: 600 to 800 on the world map, 150 to 250 on the US
map. `correctAnswer` is the place's name. Only iconic places with unambiguous
coordinates. Phrase it as "Drop a pin on ..." or as a clue to the place.

### PUZZLE

Players drag items into order. Put `option1` to `option4` in the CORRECT
order; the game shuffles them. Four famous items ordered by something
unarguable, usually date, and far apart in it (decades between events, not
years) so nobody needs exact figures. All four must be right to score.
`correctAnswer` repeats the four items in that order separated by pipes:
`First|Second|Third|Fourth`.

### MATCH

Players pair items up. `option1` to `option4` are four famous pairs, each
written `item = partner`, in the right pairs; the game shuffles the partners.
Every partner plainly belongs to one item (country and capital, band and
singer), every partner different, and never `=` or `|` inside an item.
`correctAnswer` is `See the pairs`.

### CATEGORIZE

Players sort items into groups. `option1` to `option6` are six everyday
items, each written `item = group`, using exactly two groups of three (three
groups only if they are obvious), every item plainly in one group, no
borderline cases. `correctAnswer` is `See the groups`.

### SCRAMBLE

Players rebuild a word from its shuffled letters. The question is a clue that
points straight at the word. All options empty. `correctAnswer` is one common
word of 5 to 8 letters that the whole room knows, letters only.

### TYPE_ANSWER (only when typed answers are on)

Players type an answer, so it is a single word or a famous name everybody can
spell. EVERY option is an accepted spelling: list the full name, the surname
alone, and any common variant or misspelling, one per option column. Matching
ignores case and extra spaces but is otherwise exact, so an answer you forgot
to list is marked wrong. `correctAnswer` repeats `option1`. The game drops
these rows unless the host turned the TYPED ANSWERS switch on, so leave them
out of a file unless the request says typed answers are on.

## CSV rules the importer is strict about

- Never put a line break inside a field. Every question is one line.
- Never use double-quote characters inside the text. If you would quote
  something, use single quotes.
- If a field contains a comma, wrap that whole field in double quotes. That
  is the only place double quotes may appear.
- Numbers with no thousands separators: `384000`, not `384,000`, in any
  option column that holds a number. (`correctAnswer` on a SLIDER may be
  written out, since the game reads the first number in it.)
- Never leave `category`, `question` or `correctAnswer` empty; the row is
  dropped.
- A `correctAnswer` that does not match any option on a MULTIPLE_CHOICE or
  MULTI_SELECT row leaves that row out.
- UTF-8, no byte-order mark, Unix line endings.

## One example of every format

Format only; write your own content at the level asked. The `difficulty`
value at the end of each row is the level each example happens to be.

```text
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
```
