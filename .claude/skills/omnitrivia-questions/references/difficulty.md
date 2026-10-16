# The three difficulty levels

Every question in a file is written at one level, and the level is written
into the `difficulty` column of every row as `everyday`, `school` or `quiz`.
The game ignores that column; it exists so a library can be filtered.

The levels are the same ones the game's own generator uses, so a file written
here plays at the same level as a set generated inside the app.

## Reading the level from the request

| Words in the request | Level |
| --- | --- |
| easy, easiest, family, kids, all ages, anyone, warm-up, "everybody gets it" | `everyday` |
| normal, regular, standard, default, high school, bar night, mixed crowd, or nothing said | `school` |
| hard, harder, competitive, challenge, pub quiz, "for the regulars", "make them think" | `quiz` |

When in doubt, `school`. When a request asks for "hard" questions, still read
the `quiz` brief below: it is gettable-with-a-stretch, not specialist.

## EVERYDAY

**Who it is for:** a family night, a mixed-age crowd, a room that has had a
few. Nearly everybody should get nearly every question; the game is decided on
speed, not knowledge.

**The test for every question:** would a 12-year-old and their grandparent
both know this instantly, without working anything out? If not, do not ask
it. Find an easier fact about the same subject.

**What it draws on:** colours, animals, the days and months, famous landmarks,
the biggest films, the most famous people alive, what everyday things are
called, facts that daily life makes obvious.

- Right level: How many legs does a spider have? What colour do you get by
  mixing blue and yellow? Which planet do we live on? What animal says moo?
- Too hard: What is the capital of Australia? Who painted The Starry Night?
  How many bones are in the adult human body?

## HIGH SCHOOL (`school`, the default)

**Who it is for:** a bar crowd of friends, regulars and walk-ins. The
reference reader is an average 17-year-old who paid moderate attention, and an
average adult who has not followed the subject since school.

**The test for every question:** would that 17-year-old, and that adult, know
this instantly, without looking it up or working anything out? If not, do not
ask it. Find an easier fact about the same subject.

**The shape of the set:** about two thirds of the questions are ones nearly
everybody gets, the rest ones about half the room gets. There are no stretch
questions at this level: nothing that rewards a fan, a graduate in the subject
or a pub-quiz regular. If a question needs a date, a measurement or a name
that only a fan knows, it is too hard.

**What it draws on:** the kind of fact in a school textbook, on a famous
landmark, in a blockbuster film or a hit song everybody has heard.

- Right level: What is the capital of France? Which planet is closest to the
  Sun? Who painted the Mona Lisa? How many players does a basketball team
  have on the court? What gas do plants take in from the air? Which ocean is
  the largest?
- Too hard, never write questions like these: Who was the last emperor of the
  Western Roman Empire? Which element is most abundant in the Earth's crust by
  mass? Who played the saxophone on Baker Street? Which Bronte sister
  published as Currer Bell? What was the first item sold on eBay? Which
  African country borders the most others?

Those too-hard examples are real questions from the game's first nights. They
are exactly the mistake this level exists to prevent: each one is a true,
interesting fact that almost nobody in a bar knows.

## PUB QUIZ (`quiz`)

**Who it is for:** a room that came to compete and expects to lose a few.

**The shape of the set:** about half the questions easy (most of the room gets
them), about a third medium (half the room gets them), and at most one in six
a stretch.

**What a stretch is:** a question a person can still reason or eliminate
their way to. Never specialist knowledge. If you are not sure most people have
heard of the answer, make the question easier.

- Right level for a stretch: Which country has the most time zones? Who wrote
  Pride and Prejudice? Which planet has the most moons?
- Too hard even here: Who was the last emperor of the Western Roman Empire?
  Who played the saxophone on Baker Street?

## Re-pitching an existing set

To move a set to a different level, do not just swap the `difficulty` value.
Re-read every row against the new level's test, rewrite the ones that fail,
and only then relabel the column. Going easier usually means asking a more
famous fact about the same subject; going harder means a less obvious angle
on the same famous thing, never a more obscure thing.
