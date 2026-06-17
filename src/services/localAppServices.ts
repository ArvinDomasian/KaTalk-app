import { candidates, openingMessages, rooms } from '../data/mockData';
import type { AppServices, SafetyEvent, SavedMatch } from './contracts';

function pickRandom<T>(items: T[]) {
  if (items.length === 0) {
    throw new Error('No visible candidates available.');
  }

  return items[Math.floor(Math.random() * items.length)];
}

export const safetyEvents: SafetyEvent[] = [];
export const savedMatches: SavedMatch[] = [];

function visibleCandidatesFor(userId: string) {
  const blockedIds = new Set(
    safetyEvents
      .filter((event) => event.actorId === userId && event.action === 'block')
      .map((event) => event.targetId)
  );
  return candidates.filter((candidate) => !blockedIds.has(candidate.id));
}

export const appServices: AppServices = {
  messageMatches: {
    async start(profile) {
      const startsAt = new Date();
      const durationSeconds = 120;
      const candidate = pickRandom(visibleCandidatesFor(profile.id));

      return {
        id: `message-match-${startsAt.getTime()}`,
        candidate,
        openingPrompt: pickRandom(openingMessages),
        durationSeconds,
        startsAt,
        endsAt: new Date(startsAt.getTime() + durationSeconds * 1000)
      };
    }
  },
  savedMatches: {
    async list(profile) {
      return savedMatches.filter((match) => match.userId === profile.id);
    },
    async save(profile, candidate) {
      const existing = savedMatches.find(
        (match) => match.userId === profile.id && match.candidate.id === candidate.id
      );

      if (existing) {
        return existing;
      }

      const match = {
        id: `saved-${profile.id}-${candidate.id}`,
        userId: profile.id,
        candidate,
        createdAt: new Date(),
        revealState: 'anonymous' as const
      };
      savedMatches.push(match);
      return match;
    }
  },
  rooms: {
    async list() {
      return rooms.map((room) => ({ ...room }));
    }
  },
  nearby: {
    async list(profile) {
      return visibleCandidatesFor(profile.id)
        .slice()
        .sort((left, right) => left.distanceMiles - right.distanceMiles);
    }
  },
  video: {
    async start(profile) {
      const candidate = pickRandom(visibleCandidatesFor(profile.id));
      const sessionId = `video-${Date.now()}`;

      return {
        id: sessionId,
        candidate,
        agoraChannelName: `katalk-${sessionId}`,
        cameraStartsEnabled: false,
        microphoneStartsMuted: true
      };
    }
  },
  safety: {
    async record(event) {
      const fullEvent = {
        ...event,
        createdAt: new Date()
      };
      safetyEvents.push(fullEvent);
      return fullEvent;
    }
  }
};
