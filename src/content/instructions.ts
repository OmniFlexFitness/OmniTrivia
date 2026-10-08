/**
 * The rules of OmniTrivia, in the app's own words.
 *
 * Every screen shows the part of this that applies to it, so a player who has
 * never heard of the format can work out what is being asked of them without
 * anyone explaining it from the front of the room. The same words are in the
 * README under "Rules and terminology" — if one changes, change both.
 *
 * The vocabulary is exact and worth keeping exact, because four things that
 * sound alike are four different objects in this game:
 *
 *   Game     the whole night: a set of rounds, one host, one PIN.
 *   Round    one spin of the wheel — a category, and everybody paired off.
 *   Matchup  one pairing: you against one other player, for that round.
 *   Match    the actual playing-out of a matchup: its questions, at its pace.
 */

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: "Game",
    definition:
      "The whole night. One host, one PIN, and the set of rounds they have loaded.",
  },
  {
    term: "Round",
    definition:
      "One spin of the wheel. The wheel picks the category — really picks it, from the categories not yet played — and then every player still in the bracket is paired off into matchups.",
  },
  {
    term: "Qualifying round",
    definition:
      "The first rounds of the night, as many as the host sets. Nobody goes out. Beat your opponent and that round's points count ×1.5 on your total. Round one is drawn at random; after that you meet the player next to you in the standings.",
  },
  {
    term: "Seeding",
    definition:
      "After qualifying, the bracket is drawn on total score: the highest total meets the lowest, second meets second-lowest. It is drawn the same way again every round, so the totals keep counting. With odd numbers the top seed is owed the spare seat.",
  },
  {
    term: "Final series",
    definition:
      "The final is best of 3. Each game is its own spin of the wheel and its own round; the first to win two takes the night. Everybody else keeps playing on the Redemption Table while it is on.",
  },
  {
    term: "Close",
    definition:
      "A near miss that still scored. Sliders, pins and closest-number questions pay part of the points for an answer just off the target — how far off still counts is the question's margin — and a match or sort pays for the pairs it got right beyond guessing. It shows as ≈ rather than ✓, and does not keep a streak going.",
  },
  {
    term: "Matchup",
    definition:
      "One pairing for one round: you against one other player. Qualifying rounds pair you with somebody near you in the standings; bracket rounds pair the highest total left against the lowest.",
  },
  {
    term: "Match",
    definition:
      "A matchup actually being played: the round's questions, answered by the two people in it. Every match runs on its own clock — no match waits for another, and inside a match neither player waits for the other.",
  },
  {
    term: "Bracket",
    definition:
      "Single elimination by default: the higher round score in a matchup advances, the other player is out — of the bracket, not of the game. When the numbers are odd, the spare seat goes to a wildcard from the Redemption Table, or to a bye if nobody there has earned one.",
  },
  {
    term: "Loser's bracket",
    definition:
      "Optional, chosen by the host at setup. A first loss drops you into the loser's bracket instead of out; a second loss there puts you on the Redemption Table. Both sides play every round on the same category, and the last player on each side meets in a grand final for the title.",
  },
  {
    term: "Redemption Table",
    definition:
      "Where you play once you are out of the bracket. Same spin, same category, same questions, your own clock and nobody across from you. Every point you bank there counts towards the redemption prize — and the earlier you went out, the more rounds you have to build it.",
  },
  {
    term: "Wildcard",
    definition:
      "When the bracket has an odd seat, the best round score on the Redemption Table takes it instead of somebody getting a free bye. You are back in, against the player who was owed the bye. One comeback per player per game, and a round of zero earns nothing.",
  },
  {
    term: "Remote",
    definition:
      "A second screen for the host — a tablet or phone that runs the round from anywhere in the room once it has the PIN and the host password. The host's own window still runs the game; the remote drives it.",
  },
  {
    term: "Rejoin code",
    definition:
      "Four digits dealt to a player when they join — keep them or change them. Their name and that code get them back into the same seat — score, streak and place in the bracket — from any phone, at any point in the game. A phone that only reloads comes back on its own and never needs it.",
  },
  {
    term: "Host password",
    definition:
      "What the host sets when they open the game. With the PIN it takes the running game back on any device if the host's window closes, reloads or dies. The room waits half an hour for them.",
  },
  {
    term: "Category pool",
    definition:
      "The host's own list of categories. The end-of-round vote draws its options from it, and the host can add to it, edit it or prune it at any time.",
  },
];

export const SCORING_RULES: string[] = [
  "100 points for a correct answer.",
  "Up to 150 more for speed — 10 a second on a 15-second question, scaled so a full clock is worth the same on every format, from a 12-second true/false to a 30-second puzzle.",
  "Close counts on some formats: a slider, a pin or a closest-number guess just off the answer still earns part of the points, a range earns more the tighter it is, and a match or sort pays for what you got right beyond guessing.",
  "Beat your opponent and the round's points count ×1.5 on your total — the total is what seeds the bracket.",
  "The last question of every round counts double — nobody is out of a match until it is over.",
  "Each round is scored on its own. Every matchup starts level at zero, so the round you are in is the only one that decides it.",
  "A tie in a matchup is settled on total score, then on the draw. Never on a coin flip.",
];

export interface ScreenGuide {
  /** Heading on the panel. */
  title: string;
  /** One line that says what this screen is for. */
  lead: string;
  points: string[];
}

export type GuideKey =
  | "start"
  | "hostConfig"
  | "import"
  | "importSelect"
  | "review"
  | "join"
  | "hostResume"
  | "lobby"
  | "categorySelect"
  | "playing"
  | "hostPlaying"
  | "roundEnd"
  | "gameOver"
  | "broadcast"
  | "categoryPool"
  | "insights";

export const GUIDES: Record<GuideKey, ScreenGuide> = {
  start: {
    title: "How OmniTrivia works",
    lead: "A game is a set of rounds. A round pairs everyone off, and each pair plays their own match at their own pace.",
    points: [
      "HOST GAME runs the night from this machine: you load the questions, spin the wheel and drive the big screen.",
      "JOIN GAME takes a seat in somebody else's game with their four-digit PIN.",
      "RESUME HOSTING is for a host whose window went away mid-game — the PIN and the host password put you back at the controls.",
      "The night opens with qualifying rounds that nobody goes out of: beat your opponent and the round counts ×1.5 on your total. The totals seed the bracket.",
      "In the bracket, win your matchup and you are in the next round; lose it and you are out of the bracket — or, if the host turned on the loser's bracket, you drop into it and get a second life. The final is best of 3.",
      "Out of the bracket is not out of the game: you keep playing every round on the Redemption Table, for the redemption prize and a shot at coming back in as a wildcard.",
    ],
  },

  hostConfig: {
    title: "Setting the game up",
    lead: "Rounds and questions per round are the shape of the whole night — one round is one spin of the wheel.",
    points: [
      "Rounds: how many times the wheel is spun. Qualifying rounds come first, then each bracket round halves the field, then the final can take up to three. The lobby says exactly how many the room needs.",
      "Qualifying rounds: how many rounds nobody goes out of before the bracket is drawn on the totals. Two is a good night; zero is the old game, elimination from round one.",
      "Questions per round: how many questions each match works through. Five keeps a round to a few minutes.",
      "The game name is what the room sees on the big screen. The PIN is only the code players type to get in.",
      "GENERATE & REVIEW writes the questions with Claude; USE THE QUESTION BANK takes the premade set, which needs no API key and nothing written; IMPORT MY OWN takes a CSV or a Google Sheet.",
      "The host password is your way back in. If this window closes, reloads or the laptop dies, that password and the PIN take the running game back on any device — so write it down before you open the lobby. It is also what lets a tablet run the round as a remote.",
      "Bots fill the lobby for a host testing alone. Switch them off for a real night — they can still be switched off in the lobby, and on round one's wheel before START ROUND.",
      "Loser's bracket turns the night into double elimination: a first loss drops a player into it rather than out. It needs roughly twice as many rounds to settle, and the lobby tells you exactly how many for the players who turn up.",
    ],
  },

  import: {
    title: "Where the questions come from",
    lead: "One category per round: the importer groups rows by their category column and makes each group a round, whichever of these three you take.",
    points: [
      "LOAD THE QUESTION BANK is the premade set — hundreds of questions, thirty-odd categories, no API key and nothing to write. Everything below is for bringing your own.",
      "Required columns: category, question, correctAnswer. Optional: type, option1, option2 … (as many as you need), explanation, image, margin, unit, timeLimit.",
      "Twelve formats: multiple choice, select-all, true/false, typed answer, slider, range, closest number, pin answer on a picture or a built-in world or US map, and four puzzles — order, match, sort and unscramble. The question template at the bottom of this screen has one of each, ready to overwrite.",
      "Leave the option columns empty and the row is read as a typed answer, or as true/false when correctAnswer says True or False. A row whose correctAnswer matches none of its options is dropped rather than guessed at, and so is any question with placeholder answers (\"Placeholder 1\", \"Option A\") or nothing to choose between.",
      "A Google Sheet has to be shared as 'anyone with the link can view' before it can be read.",
      "Bring the whole file. You choose how much of it to play on the next screen, so a library of twenty categories is fine for a three-round night.",
      "You review everything before a single player sees it.",
    ],
  },

  importSelect: {
    title: "Cutting the file down to a game",
    lead: "A question file is usually a library. This is where it becomes the night you set up.",
    points: [
      "Keep the categories you want and drop the ones you do not — each kept category is one possible round.",
      "Rounds and questions per round are ceilings. Keep more categories than rounds and the extras are drawn out at random, so the same file gives a different game each time.",
      "A category with fewer questions than the ceiling just plays a shorter round. Nothing is padded and no question is repeated.",
      "Which round is played when is still the wheel's decision, not this screen's.",
    ],
  },

  review: {
    title: "Before you open the lobby",
    lead: "This is the last look at the questions before a room is in front of you.",
    points: [
      "Each block is one category the wheel can land on. Which one comes up in which round is decided by the spin, so these are not in playing order.",
      "The ↻ on a question writes a different one for that slot; the bin drops it. Rounds are allowed to end up different lengths.",
      "'Drop category' takes a whole category out of the game — that is also how you get rid of a round you do not want.",
      "Questions, answers and categories were all shuffled on the way in, so a regular never meets them in the order they were written.",
      "APPROVE & OPEN LOBBY gets you a PIN and a QR code, and seats you as a player.",
    ],
  },

  join: {
    title: "Taking a seat",
    lead: "The PIN is on the big screen. Type it, pick a name and a face, and you are in the host's game.",
    points: [
      "Your rejoin code is filled in for you — keep it, reroll it, or type your own. Your name and that code get you back into this exact seat — same score, same place in the bracket — from any phone, even mid-game. It stays on your screen once you are in, and the host can look it up if you lose it.",
      "Already playing and got knocked out of the game? Come back to this same screen, type the same name and the same code, and you will land back in your seat rather than a new one.",
      "You can only take a *new* seat while the lobby is open — once the first round is drawn, the bracket is set. Coming back to a seat you already had works at any point.",
      "If your phone just locks or reloads, you come back automatically without typing anything.",
      "You will be paired against one other player each round. Beat them and you go through.",
    ],
  },

  hostResume: {
    title: "Taking a game back",
    lead: "The room is still there and the scores are still real. Two things get you back at the controls: the game's PIN and the host password you set when you opened it.",
    points: [
      "This works from any device — the laptop that lost the game, another laptop, or a phone. The password is what proves the game is yours.",
      "The game comes back as it was: every score, the bracket, the round in progress and the clock where it stopped. Players' phones reconnect on their own within a few seconds.",
      "A game nobody comes back to is cleared about half an hour after its host disappears, and a game the host ended on purpose is gone for good.",
      "No password to hand, or a game opened before you set one? Then the game cannot be taken back — start a new one, and the room will need the new PIN.",
    ],
  },

  lobby: {
    title: "The lobby",
    lead: "Everyone who is in when the game starts is drawn into the round-one matchups.",
    points: [
      "Players join by scanning the QR code or typing the PIN.",
      "Open the broadcast display and drag it onto the projector before you start — it is the only screen the room should be looking at.",
      "ADD BOT fills the room out so a bracket can be tested; the host is always seated as a player. Switch bots off (here, at setup, or on round one's wheel) for a room of real players only.",
      "START GAME closes the lobby and draws the first round's matchups at random — a qualifying round, if there are any.",
      "Qualifying rounds can still be changed here, up until START GAME.",
      "The loser's bracket can still be switched on or off here, up until START GAME. The panel says how many rounds the bracket needs for the players in the room.",
      "Hosting from more than one screen: CAST shows a link and QR code for putting the broadcast on any device, and REMOTE shows one for running the round from a tablet with the host password.",
      "The host password on this screen is what takes this game back if this window goes away. It is shown here and nowhere else — note it down now.",
    ],
  },

  categorySelect: {
    title: "Round start",
    lead: "The wheel picks this round's category, then every match is dealt the same questions.",
    points: [
      "One spin, one category, one round. The spin genuinely decides it — whichever slice stops under the pointer is what you play.",
      "The wheel only carries the categories still to be played, so it loses a slice every round and the last round is a wheel of one.",
      "The host spins it, and the big screen and every phone in the room turn the same wheel alongside them. The slices show only icons and colours — the category's name is announced once the wheel stops.",
      "Your phone opens on your matchup — you, VS, your opponent — before the wheel turns. The big screen shows every pairing.",
      "START ROUND deals every match its questions and stops coordinating them. From there, nobody waits for anybody.",
    ],
  },

  playing: {
    title: "Playing your match",
    lead: "This is your match against one opponent. Your clock is yours alone.",
    points: [
      "Answer, lock it in, and take the next question straight away — you never wait for your opponent.",
      "You are not told whether an answer was right until your match is over. Then the whole round lands at once, and the answer key goes up when every match has finished.",
      "Points are 100 for a correct answer plus up to 150 for speed. Fast is worth more.",
      "Every format has its own clock: a true/false is quick, a puzzle or a pin gets longer. Sliders, pins and closest-number guesses pay part of the points for a near miss — shown as ≈ close when your results land.",
      "The last question of the round counts double. However the match has gone, it is not over until that one is in.",
      "You and your opponent answer the same questions; whoever has more points at the end of the round wins the matchup — and in every round, the winner's points count ×1.5 on their total.",
      "Out of the bracket? You are on the Redemption Table: the same questions, no opponent, and every point counts towards the redemption prize. The best round there can earn a wildcard back into the bracket.",
      "The big screen is behind you on purpose. It only moves when the slowest player in the room is through a question, and it never shows an answer mid-round.",
    ],
  },

  hostPlaying: {
    title: "Running the round",
    lead: "Every match is a card on the board, and every player in it has their own clock.",
    points: [
      "Pause, +10s and Close Q act on one table. The 'every table' buttons are for when you really do mean the whole room.",
      "A player's question closes the moment they answer it — that is the format, not a bug. Their opponent may be three questions behind.",
      "Players are not told whether they were right until their match is over. The board here shows you the points as they land; nobody else sees them mid-match.",
      "The projector holds whichever question the slowest player is still on, marks it once everyone is locked in, and shows the answer key only when the round is over.",
      "END ROUND NOW stops the whole round wherever it has got to and settles it on the scores as they stand. Nothing is lost by it: points are banked as each answer is given, and a question nobody reached is simply not played.",
      "Your own matchup is beside the board. 'Answering off' takes you out of it so nothing waits on you while you run the show.",
      "Players knocked out of the bracket are on the board too, on Redemption Table cards of their own: same questions, no opponent. The round waits for them like any table, and END ROUND NOW stops them with everyone else.",
    ],
  },

  roundEnd: {
    title: "End of the round",
    lead: "Matchups are settled on this round's points, and the winners are paired for the next one.",
    points: [
      "Every matchup is decided on the round just played, not on the running total — so every round starts level. The winner's round then counts ×1.5 on their total.",
      "In qualifying nobody goes out. After the last qualifying round the bracket is drawn on the totals — highest against lowest — and re-drawn the same way every round.",
      "Losers stay on the leaderboard with their score and move to the Redemption Table, where they keep playing every round. With a loser's bracket, a first loss drops a player into it instead, and only a second loss puts them on the table.",
      "When the next round has an odd seat, the best round on the Redemption Table takes it as a wildcard — knocked out this round included. It is marked WILDCARD on the pairings.",
      "The next round's pairings are drawn as soon as this one is settled, so who you play next is on your screen before the wheel is spun for it.",
      "Vote on what you want to play in future: the options are the same on every screen, and the host keeps the results.",
      "Liking the category you have just played tells the host to write more of it.",
    ],
  },

  gameOver: {
    title: "End of the game",
    lead: "Whoever wins the best-of-3 final takes it — or, if the rounds run out first, whoever leads the final series, else the highest score still in, with anyone unbeaten ranked ahead of the loser's bracket.",
    points: [
      "Three places are called: the champion, the runner-up, and the redemption winner — the most points banked on the Redemption Table by anybody not already on the podium.",
      "PLAY AGAIN replays the same questions with the scores reset and the bracket redrawn.",
      "The category data — likes and votes — is kept between games, so it is worth checking after a few nights rather than one.",
    ],
  },

  broadcast: {
    title: "On the big screen",
    lead: "The room's screen follows the field; it never sets its pace.",
    points: [
      "It holds whichever question the slowest player is still working on.",
      "No answers mid-round: the answer key goes up once every match is finished.",
      "The last question of every round is marked DOUBLE POINTS.",
      "The field board shows how far ahead each player is in their own match.",
    ],
  },

  categoryPool: {
    title: "The category pool",
    lead: "The list the end-of-round vote draws its options from. It is yours to shape.",
    points: [
      "Add anything you would consider writing a round about — the pool is a wish list, not a promise.",
      "Four options are drawn at random for each vote, skipping categories this game has already played.",
      "Editing a category keeps the likes and votes already recorded against it.",
      "The pool lives in this browser, on this machine, the same as the rest of the game.",
    ],
  },

  insights: {
    title: "What the room keeps asking for",
    lead: "Likes and votes, added up across every game hosted from this browser.",
    points: [
      "Likes come from categories people have actually played — a like means that round was good.",
      "Votes come from the end-of-round ballot and are a request for something they have not played yet.",
      "Ballots is how many times a category has been offered; a category with few votes and many ballots is being passed over.",
      "Bots never like or vote, so every number here came from a person.",
    ],
  },
};
