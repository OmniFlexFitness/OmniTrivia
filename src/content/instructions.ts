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
    term: "Matchup",
    definition:
      "One pairing for one round: you against one other player. Round one is drawn at random; after that you are paired on who won, so the bracket decides who you face.",
  },
  {
    term: "Match",
    definition:
      "A matchup actually being played: the round's questions, answered by the two people in it. Every match runs on its own clock — no match waits for another, and inside a match neither player waits for the other.",
  },
  {
    term: "Bracket",
    definition:
      "Single elimination. The higher round score in a matchup advances, the other player is out. A bye advances whoever is left over when the numbers are odd.",
  },
  {
    term: "Category pool",
    definition:
      "The host's own list of categories. The end-of-round vote draws its options from it, and the host can add to it, edit it or prune it at any time.",
  },
];

export const SCORING_RULES: string[] = [
  "100 points for a correct answer.",
  "10 more for every second still on your clock — answering fast is worth real points.",
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
      "Everything in a game is scored head-to-head. Win your matchup and you are in the next round; lose it and you are out.",
    ],
  },

  hostConfig: {
    title: "Setting the game up",
    lead: "Rounds and questions per round are the shape of the whole night — one round is one spin of the wheel.",
    points: [
      "Rounds: how many times the wheel is spun. Each round also halves the field, so five rounds is enough for a room of about thirty.",
      "Questions per round: how many questions each match works through. Five keeps a round to a few minutes.",
      "The game name is what the room sees on the big screen. The PIN is only the code players type to get in.",
      "GENERATE & REVIEW writes the questions with Claude; IMPORT MY OWN takes a CSV or a Google Sheet.",
    ],
  },

  import: {
    title: "Importing your own questions",
    lead: "One category per round: the importer groups rows by their category column and makes each group a round.",
    points: [
      "Required columns: category, question, option1–option4, correctAnswer. An explanation column is optional and shows on the reveal.",
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
      "You can only join while the lobby is open — once the first round is drawn, the bracket is set.",
      "If your phone locks or reloads, you come back to the same seat with the same score.",
      "You will be paired against one other player each round. Beat them and you go through.",
    ],
  },

  lobby: {
    title: "The lobby",
    lead: "Everyone who is in when the game starts is drawn into the round-one matchups.",
    points: [
      "Players join by scanning the QR code or typing the PIN.",
      "Open the broadcast display and drag it onto the projector before you start — it is the only screen the room should be looking at.",
      "ADD BOT fills the room out so a bracket can be tested; the host is always seated as a player.",
      "START GAME closes the lobby and draws the first round's matchups at random.",
    ],
  },

  categorySelect: {
    title: "Round start",
    lead: "The wheel picks this round's category, then every match is dealt the same questions.",
    points: [
      "One spin, one category, one round. The spin genuinely decides it — whichever slice stops under the pointer is what you play.",
      "The wheel only carries the categories still to be played, so it loses a slice every round and the last round is a wheel of one.",
      "The matchups for this round are on the big screen — that is who you are playing.",
      "START ROUND deals every match its questions and stops coordinating them. From there, nobody waits for anybody.",
    ],
  },

  playing: {
    title: "Playing your match",
    lead: "This is your match against one opponent. Your clock is yours alone.",
    points: [
      "Answer, see whether you got it, and take the next question straight away — you never wait for your opponent.",
      "Points are 100 for a correct answer plus 10 for every second left on your clock. Fast is worth more.",
      "You and your opponent answer the same questions; whoever has more points at the end of the round wins the matchup.",
      "The big screen is behind you on purpose. It only moves when the slowest player in the room is through a question, so it can never spoil yours.",
    ],
  },

  hostPlaying: {
    title: "Running the round",
    lead: "Every match is a card on the board, and every player in it has their own clock.",
    points: [
      "Pause, +10s and Reveal act on one table. The 'every table' buttons are for when you really do mean the whole room.",
      "A player's question closes the moment they answer it — that is the format, not a bug. Their opponent may be three questions behind.",
      "The projector holds whichever question the slowest player is still on and only shows the answer once everyone is through it.",
      "Your own matchup is beside the board. 'Answering off' takes you out of it so nothing waits on you while you run the show.",
    ],
  },

  roundEnd: {
    title: "End of the round",
    lead: "Matchups are settled on this round's points, and the winners are paired for the next one.",
    points: [
      "Every matchup is decided on the round just played, not on the running total — so every round starts level.",
      "Losers stay on the leaderboard with their score; they are just out of the bracket.",
      "Vote on what you want to play in future: the options are the same on every screen, and the host keeps the results.",
      "Liking the category you have just played tells the host to write more of it.",
    ],
  },

  gameOver: {
    title: "End of the game",
    lead: "The last player standing takes it — or the highest score among those still in, if the rounds run out first.",
    points: [
      "PLAY AGAIN replays the same questions with the scores reset and the bracket redrawn.",
      "The category data — likes and votes — is kept between games, so it is worth checking after a few nights rather than one.",
    ],
  },

  broadcast: {
    title: "On the big screen",
    lead: "The room's screen follows the field; it never sets its pace.",
    points: [
      "It holds whichever question the slowest player is still working on.",
      "The answer only goes up once every player has been through that question.",
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
