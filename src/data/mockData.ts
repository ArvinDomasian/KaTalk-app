import type { Candidate, VoiceRoom } from '../types';
import { colors } from '../theme';

export const candidates: Candidate[] = [
  {
    id: 'mara',
    nickname: 'Mara',
    age: 24,
    distanceMiles: 1.2,
    interests: ['slow coffee', 'films', 'quiet walks'],
    prompt: 'Likes first messages that feel calm and specific.',
    avatarColor: colors.lavender,
    photoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'eli',
    nickname: 'Eli',
    age: 27,
    distanceMiles: 2.8,
    interests: ['indie games', 'books', 'night markets'],
    prompt: 'Usually shy at first, warmer after two good questions.',
    avatarColor: colors.sky,
    photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'noa',
    nickname: 'Noa',
    age: 23,
    distanceMiles: 4.4,
    interests: ['music', 'food trips', 'dogs'],
    prompt: 'Here for easy conversation, not pressure.',
    avatarColor: colors.accentSoft,
    photoUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=600&q=80'
  },
  {
    id: 'sana',
    nickname: 'Sana',
    age: 29,
    distanceMiles: 6.1,
    interests: ['photography', 'tea', 'anime'],
    prompt: 'Would rather trade small honest stories than pickup lines.',
    avatarColor: colors.cardDark,
    photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80'
  }
];

export const rooms: VoiceRoom[] = [
  {
    id: 'chill',
    title: 'Quiet Table',
    mood: 'Chill',
    topic: 'Easy introductions, soft voices, and no pressure to speak.',
    participants: 12,
    isJoined: false,
    host: 'Mina',
    speakers: ['Mina', 'Noa']
  },
  {
    id: 'shy',
    title: 'Shy Starters',
    mood: 'Shy',
    topic: 'A room for short answers, gentle prompts, and patient pauses.',
    participants: 8,
    isJoined: false,
    host: 'Arlo',
    speakers: ['Arlo']
  },
  {
    id: 'serious',
    title: 'Real Questions',
    mood: 'Serious',
    topic: 'Intentional dating questions without rushing into private chats.',
    participants: 18,
    isJoined: false,
    host: 'June',
    speakers: ['June', 'Mara', 'Eli']
  },
  {
    id: 'local',
    title: 'Nearby Voices',
    mood: 'Local',
    topic: 'Local plans, weekend ideas, and low-key hangout energy.',
    participants: 21,
    isJoined: false,
    host: 'Kai',
    speakers: ['Kai', 'Sana']
  }
];

export const openingMessages = [
  'What is a small thing that made your day better recently?',
  'What kind of place feels easiest for you to talk in?',
  'What is your comfort food after a long day?',
  'What is something you could talk about for 20 minutes?'
];
