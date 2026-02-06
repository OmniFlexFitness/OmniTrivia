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