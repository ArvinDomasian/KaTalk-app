import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe
} from 'firebase/firestore';
import type { UserProfile } from '../types';
import { shouldUseSupabase, supabaseMissingConfigMessage } from './backendConfig';
import { getConfiguredFirebaseApp } from './firebaseAuthService';

const PUBLIC_STORY_COLLECTION = 'publicStories';
const PUBLIC_STORY_STORAGE_KEY = 'katalk.publicStories.v1';
const STORY_TTL_MS = 24 * 60 * 60 * 1000;

export type PublicStory = {
  id: string;
  authorId: string;
  nickname: string;
  photoUrl?: string;
  text: string;
  createdAt: Date;
  expiresAt: Date;
  mine?: boolean;
};

type StoredPublicStory = Omit<PublicStory, 'createdAt' | 'expiresAt'> & {
  createdAtMs: number;
  expiresAtMs: number;
};

function getBrowserStorage() {
  try {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
      return null;
    }

    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function isStoredPublicStory(value: unknown): value is StoredPublicStory {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const story = value as Partial<StoredPublicStory>;

  return Boolean(
    story.id &&
      story.authorId &&
      story.nickname &&
      typeof story.text === 'string' &&
      typeof story.createdAtMs === 'number'
  );
}

function isActiveStory(story: PublicStory) {
  return story.expiresAt.getTime() > Date.now();
}

function loadStoredStories() {
  const storage = getBrowserStorage();

  if (!storage) {
    return [];
  }

  try {
    const rawStories = storage.getItem(PUBLIC_STORY_STORAGE_KEY);

    if (!rawStories) {
      return [];
    }

    const parsedStories = JSON.parse(rawStories);

    if (!Array.isArray(parsedStories)) {
      return [];
    }

    return parsedStories
      .filter(isStoredPublicStory)
      .map((story) => ({
        ...story,
        createdAt: new Date(story.createdAtMs),
        expiresAt: new Date(story.expiresAtMs || story.createdAtMs + STORY_TTL_MS)
      }))
      .filter(isActiveStory);
  } catch {
    return [];
  }
}

const localStories: PublicStory[] = loadStoredStories();

function saveStoredStories() {
  const storage = getBrowserStorage();

  if (!storage) {
    return;
  }

  try {
    const storableStories: StoredPublicStory[] = visibleLocalStories().slice(0, 100).map((story) => ({
      ...story,
      createdAtMs: story.createdAt.getTime(),
      expiresAtMs: story.expiresAt.getTime()
    }));

    storage.setItem(PUBLIC_STORY_STORAGE_KEY, JSON.stringify(storableStories));
  } catch {
    // Stories stay visible in memory if browser storage is unavailable.
  }
}

function upsertLocalStory(story: PublicStory) {
  const existingIndex = localStories.findIndex((item) => item.id === story.id);

  if (existingIndex >= 0) {
    localStories[existingIndex] = story;
  } else {
    localStories.unshift(story);
  }

  localStories.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  saveStoredStories();
}

function mergeStoredStoriesIntoMemory() {
  loadStoredStories().forEach(upsertLocalStory);
}

function visibleLocalStories() {
  const now = Date.now();

  for (let index = localStories.length - 1; index >= 0; index -= 1) {
    if (localStories[index].expiresAt.getTime() <= now) {
      localStories.splice(index, 1);
    }
  }

  return localStories.slice().sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

function storyDb() {
  const app = getConfiguredFirebaseApp();
  return app ? getFirestore(app) : null;
}

function publicStoriesCollection() {
  const db = storyDb();
  return db ? collection(db, PUBLIC_STORY_COLLECTION) : null;
}

function markMine(stories: PublicStory[], currentUserId: string) {
  return stories.map((story) => ({
    ...story,
    mine: story.authorId === currentUserId
  }));
}

function storyFromSnapshot(id: string, data: Record<string, unknown>): PublicStory {
  const createdAtMs = typeof data.createdAtMs === 'number' ? data.createdAtMs : Date.now();
  const expiresAtMs = typeof data.expiresAtMs === 'number' ? data.expiresAtMs : createdAtMs + STORY_TTL_MS;

  return {
    id,
    authorId: String(data.authorId ?? ''),
    nickname: String(data.nickname ?? 'KaTalk member'),
    photoUrl: data.photoUrl ? String(data.photoUrl) : undefined,
    text: String(data.text ?? ''),
    createdAt: new Date(createdAtMs),
    expiresAt: new Date(expiresAtMs)
  };
}

function storyFromSupabaseRow(row: Record<string, unknown>): PublicStory {
  const createdAtMs = typeof row.created_at_ms === 'number' ? row.created_at_ms : Date.now();
  const expiresAtMs = typeof row.expires_at_ms === 'number' ? row.expires_at_ms : createdAtMs + STORY_TTL_MS;

  return {
    id: String(row.id ?? ''),
    authorId: String(row.profile_id ?? ''),
    nickname: String(row.author_nickname ?? 'KaTalk member'),
    photoUrl: row.photo_url ? String(row.photo_url) : undefined,
    text: String(row.body ?? ''),
    createdAt: new Date(createdAtMs),
    expiresAt: new Date(expiresAtMs)
  };
}

export function subscribePublicStories(
  profile: UserProfile,
  onStories: (stories: PublicStory[]) => void,
  onError: (message: string) => void
) {
  mergeStoredStoriesIntoMemory();
  onStories(markMine(visibleLocalStories(), profile.id));

  if (shouldUseSupabase()) {
    let cleanup = () => undefined;
    let disposed = false;

    void import('./supabaseClient').then(async ({ getCurrentSupabaseUser, getSupabaseClient }) => {
      if (disposed) {
        return;
      }

      const supabase = getSupabaseClient();
      const user = await getCurrentSupabaseUser();
      const currentUserId = user?.id ?? profile.id;

      if (!supabase) {
        onError(supabaseMissingConfigMessage());
        return;
      }

      const supabaseClient = supabase;

      async function loadSupabaseStories() {
        const { data, error } = await supabaseClient
          .from('public_stories')
          .select('*')
          .gt('expires_at_ms', Date.now())
          .order('created_at_ms', { ascending: false })
          .limit(80);

        if (error) {
          onError(error.message || 'Supabase stories could not load yet.');
          return;
        }

        const remoteStories = ((data ?? []) as Record<string, unknown>[])
          .map(storyFromSupabaseRow)
          .filter(isActiveStory);

        remoteStories.forEach(upsertLocalStory);

        onStories(markMine(remoteStories, currentUserId));
      }

      void loadSupabaseStories();

      const channel = supabaseClient
        .channel('public-stories')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'public_stories' }, () => {
          void loadSupabaseStories();
        })
        .subscribe();

      cleanup = () => {
        void supabaseClient.removeChannel(channel);
      };
    });

    return (() => {
      disposed = true;
      cleanup();
    }) as Unsubscribe;
  }

  const storiesCollection = publicStoriesCollection();

  if (!storiesCollection) {
    return (() => undefined) as Unsubscribe;
  }

  return onSnapshot(
    query(storiesCollection, orderBy('createdAtMs', 'desc')),
    (snapshot) => {
      const remoteStories = snapshot.docs
        .map((item) => storyFromSnapshot(item.id, item.data()))
        .filter(isActiveStory);

      remoteStories.forEach(upsertLocalStory);
      onStories(markMine(remoteStories, profile.id));
    },
    (error) => {
      onStories(markMine(visibleLocalStories(), profile.id));
      onError(error.message || 'Stories could not load yet.');
    }
  );
}

export async function createPublicStory(profile: UserProfile, text: string) {
  const cleanText = text.trim();

  if (!cleanText) {
    throw new Error('Write a short story first.');
  }

  const createdAtMs = Date.now();
  const expiresAtMs = createdAtMs + STORY_TTL_MS;
  const storyId = `story-${profile.id}-${createdAtMs}`;

  if (shouldUseSupabase()) {
    const { getCurrentSupabaseUser, getSupabaseClient } = await import('./supabaseClient');
    const supabase = getSupabaseClient();
    const user = await getCurrentSupabaseUser();

    if (!supabase || !user) {
      throw new Error(supabaseMissingConfigMessage());
    }

    const remoteStory: PublicStory = {
      id: `story-${user.id}-${createdAtMs}`,
      authorId: user.id,
      nickname: profile.nickname || 'KaTalk member',
      photoUrl: profile.avatarUrl,
      text: cleanText,
      createdAt: new Date(createdAtMs),
      expiresAt: new Date(expiresAtMs),
      mine: true
    };

    const { error } = await supabase.from('public_stories').insert({
      id: remoteStory.id,
      profile_id: user.id,
      author_nickname: remoteStory.nickname,
      photo_url: remoteStory.photoUrl ?? null,
      body: remoteStory.text,
      created_at_ms: createdAtMs,
      expires_at_ms: expiresAtMs,
      created_at: new Date(createdAtMs).toISOString(),
      updated_at: new Date(createdAtMs).toISOString()
    });

    if (error) {
      throw new Error(error.message || 'Story could not be posted yet.');
    }

    upsertLocalStory(remoteStory);

    return remoteStory;
  }

  const story: PublicStory = {
    id: storyId,
    authorId: profile.id,
    nickname: profile.nickname || 'KaTalk member',
    photoUrl: profile.avatarUrl,
    text: cleanText,
    createdAt: new Date(createdAtMs),
    expiresAt: new Date(expiresAtMs),
    mine: true
  };

  upsertLocalStory(story);

  const storiesCollection = publicStoriesCollection();

  if (storiesCollection) {
    void setDoc(doc(storiesCollection, story.id), {
      authorId: story.authorId,
      nickname: story.nickname,
      photoUrl: story.photoUrl ?? null,
      text: story.text,
      createdAtMs,
      expiresAtMs,
      createdAt: serverTimestamp()
    }).catch(() => undefined);
  }

  return story;
}

export function storyErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Story could not be posted yet.';
}
