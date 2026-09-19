import { Category } from './types';

export const AVATARS = [
  '🐼', '🦊', '🦁', '🐯', '🐸', '🐙', '🦄', '🐲', '🤖', '👽', '👻', '🤡',
  '🤠', '🥳', '😎', '🤓', '😺', '😸', '🙈', '🙉', '🙊', '🐵', '🐶', '🐺',
  '🐗', '🐴', '🦓', '🦒', '🐘', '🦏', '🦛', '🐭', '🐹', '🐰', '🐿️', '🦔',
  '🦇', '🐻', '🐨', '🦘', '🦡', '🦃', '🐔', '🐓', '🐣', '🐤', '🐥', '🐦',
  '🦉', '🦅', '🦆', '🦢', '🦜', '🦩', '🦚', '🦈', '🐬', '🐳', '🐋', '🐟',
  '🐠', '🐡', '🦐', '🦞', '🦀', '🦑', '🐌', '🦋', '🐛', '🐜', '🐝', '🐞'
];

export const AVATAR_COLORS = [
  'bg-slate-600', 'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500', 
  'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 
  'bg-sky-500', 'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 
  'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500'
];

export const AVATAR_ACCESSORIES = [
  '', // None
  '👓', '🕶️', '🎩', '🧢', '👑', '🎧', '🎀', '🌹', '⭐', '🌙', '🔥', '💡', '🎮', '🎸', 
  '🍕', '🍔', '🏆', '🥇', '💎', '🎈', '🪄', '📷', '📱', '💻', '💼', '☂️'
];

export const CATEGORIES: Category[] = [
  { id: 'science', name: 'Science', icon: '🧬', color: 'bg-green-500' },
  { id: 'history', name: 'History', icon: '📜', color: 'bg-yellow-500' },
  { id: 'geography', name: 'Geography', icon: '🌍', color: 'bg-blue-500' },
  { id: 'entertainment', name: 'Pop Culture', icon: '🎬', color: 'bg-pink-500' },
  { id: 'sports', name: 'Sports', icon: '⚽', color: 'bg-orange-500' },
  { id: 'tech', name: 'Tech', icon: '💻', color: 'bg-purple-500' },
  { id: 'art', name: 'Art', icon: '🎨', color: 'bg-red-500' },
  { id: 'literature', name: 'Literature', icon: '📚', color: 'bg-indigo-500' },
  { id: 'music', name: 'Music', icon: '🎵', color: 'bg-teal-500' },
  { id: 'food', name: 'Food', icon: '🍔', color: 'bg-amber-500' },
];

export const BOT_NAMES = [
  'QuizMaster99', 'TriviaTitan', 'BrainyBot', 'FastFinger', 'KnowItAll', 'Guesser', 'SmartyPants', 'QuizWiz'
];

export const TIMER_DURATION = 15; // seconds per question
// How long the answer stays on the broadcast before it moves to the next
// question. Long enough to read the explanation, short enough to keep a room
// of people moving.
export const REVEAL_DURATION = 6; // seconds

// Bots stand in for the players a real backend would carry. They answer at a
// believable spread of times so the "answered / still answering" counter on
// the broadcast means something during a question.
export const BOT_ACCURACY = 0.6;
export const BOT_MIN_THINK_SECONDS = 2;
export const BOT_MAX_THINK_SECONDS = TIMER_DURATION - 2;

/**
 * How many options an end-of-round category vote puts up. Four reads cleanly
 * on a phone and on a projector; a pool smaller than this offers what it has.
 */
export const CATEGORY_VOTE_OPTIONS = 4;

/**
 * The pool an end-of-round vote draws its options from, before the host has
 * edited one of their own.
 *
 * This is deliberately wider than `CATEGORIES` — that list is what a generated
 * game picks its rounds from, this one is what a room is asked what it wants
 * to play next time, and those are not the same question.
 */
export const DEFAULT_CATEGORY_POOL: Category[] = [
  ...CATEGORIES,
  { id: 'fitness', name: 'Fitness', icon: '🏋️', color: 'bg-lime-500' },
  { id: 'nutrition', name: 'Nutrition', icon: '🥗', color: 'bg-emerald-500' },
  { id: 'anatomy', name: 'Anatomy', icon: '🦴', color: 'bg-rose-500' },
  { id: 'supplements', name: 'Supplements', icon: '💊', color: 'bg-cyan-500' },
  { id: 'movies', name: 'Movies', icon: '🍿', color: 'bg-fuchsia-500' },
  { id: 'gaming', name: 'Video Games', icon: '🎮', color: 'bg-violet-500' },
  { id: 'space', name: 'Space', icon: '🚀', color: 'bg-sky-500' },
  { id: 'animals', name: 'Animals', icon: '🐘', color: 'bg-orange-500' },
  { id: 'mythology', name: 'Mythology', icon: '🏛️', color: 'bg-amber-500' },
  { id: 'internet', name: 'Internet Culture', icon: '📡', color: 'bg-pink-500' },
];
