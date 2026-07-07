import type { ProfilePost, UserProfile } from '../types';
import { supabaseMissingConfigMessage } from './backendConfig';
import { getCurrentSupabaseUser, getSupabaseClient } from './supabaseClient';

const PROFILE_POST_STORAGE_KEY = 'katalk.profilePosts.v1';

type Unsubscribe = () => void;

type CreateProfilePostOptions = {
  photoUrl?: string;
  emoji?: string;
  voiceUrl?: string;
  musicUrl?: string;
  musicTitle?: string;
  visibility?: ProfilePost['visibility'];
};

type StoredProfilePost = Omit<ProfilePost, 'createdAt'> & {
  createdAtMs: number;
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

function isStoredProfilePost(value: unknown): value is StoredProfilePost {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const post = value as Partial<StoredProfilePost>;

  return Boolean(
    post.id &&
      post.profileId &&
      post.authorNickname &&
      typeof post.body === 'string' &&
      (post.visibility === 'public' || post.visibility === 'private') &&
      typeof post.createdAtMs === 'number'
  );
}

function loadStoredPosts() {
  const storage = getBrowserStorage();

  if (!storage) {
    return [];
  }

  try {
    const rawPosts = storage.getItem(PROFILE_POST_STORAGE_KEY);

    if (!rawPosts) {
      return [];
    }

    const parsedPosts = JSON.parse(rawPosts);

    if (!Array.isArray(parsedPosts)) {
      return [];
    }

    return parsedPosts.filter(isStoredProfilePost).map((post) => ({
      ...post,
      createdAt: new Date(post.createdAtMs)
    }));
  } catch {
    return [];
  }
}

const localPosts: ProfilePost[] = loadStoredPosts();

function saveStoredPosts() {
  const storage = getBrowserStorage();

  if (!storage) {
    return;
  }

  try {
    const storablePosts: StoredProfilePost[] = localPosts.slice(0, 200).map((post) => ({
      ...post,
      createdAtMs: post.createdAt.getTime()
    }));

    storage.setItem(PROFILE_POST_STORAGE_KEY, JSON.stringify(storablePosts));
  } catch {
    // Posts still remain visible in memory if browser storage is unavailable.
  }
}

function upsertLocalPost(post: ProfilePost) {
  const existingIndex = localPosts.findIndex((item) => item.id === post.id);

  if (existingIndex >= 0) {
    localPosts[existingIndex] = post;
  } else {
    localPosts.unshift(post);
  }

  localPosts.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  saveStoredPosts();
}

function mergeStoredPostsIntoMemory() {
  loadStoredPosts().forEach((post) => {
    const existingIndex = localPosts.findIndex((item) => item.id === post.id);

    if (existingIndex >= 0) {
      localPosts[existingIndex] = post;
    } else {
      localPosts.push(post);
    }
  });

  localPosts.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

function visibleLocalPostsFor(profileId: string) {
  return localPosts.filter((post) => post.visibility === 'public' || post.profileId === profileId);
}

export function loadVisibleProfilePosts(profileId: string) {
  mergeStoredPostsIntoMemory();
  return visibleLocalPostsFor(profileId)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

function postFromSupabaseRow(row: Record<string, unknown>): ProfilePost {
  const visibility = row.visibility === 'private' ? 'private' : 'public';

  return {
    id: String(row.id ?? ''),
    profileId: String(row.profile_id ?? ''),
    authorNickname: String(row.author_nickname ?? 'KaTalk member'),
    body: String(row.body ?? ''),
    photoUrl: row.photo_url ? String(row.photo_url) : undefined,
    emoji: row.emoji ? String(row.emoji) : undefined,
    voiceUrl: row.voice_url ? String(row.voice_url) : undefined,
    musicUrl: row.music_url ? String(row.music_url) : undefined,
    musicTitle: row.music_title ? String(row.music_title) : undefined,
    visibility,
    createdAt: new Date(typeof row.created_at_ms === 'number' ? row.created_at_ms : Date.now())
  };
}

export function subscribeProfilePosts(
  profileId: string,
  onPosts: (posts: ProfilePost[]) => void,
  onError: (message: string) => void
) {
  mergeStoredPostsIntoMemory();
  onPosts(
    visibleLocalPostsFor(profileId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
  );

  const supabase = getSupabaseClient();

  if (!supabase) {
    onError(supabaseMissingConfigMessage());
    return (() => undefined) as Unsubscribe;
  }

  const supabaseClient = supabase;
  let disposed = false;

  async function loadSupabasePosts() {
    if (disposed) {
      return;
    }

    const { data, error } = await supabaseClient
      .from('profile_posts')
      .select('*')
      .order('created_at_ms', { ascending: false })
      .limit(200);

    if (error) {
      onError(error.message || 'Supabase profile posts could not load.');
      return;
    }

    const remotePosts = ((data ?? []) as Record<string, unknown>[])
      .map(postFromSupabaseRow)
      .filter((post) => post.visibility === 'public' || post.profileId === profileId);

    remotePosts.forEach(upsertLocalPost);

    const remotePostIds = new Set(remotePosts.map((post) => post.id));
    const localOnlyPosts = visibleLocalPostsFor(profileId).filter((post) => !remotePostIds.has(post.id));

    onPosts(
      [...localOnlyPosts, ...remotePosts].sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
      )
    );
  }

  void loadSupabasePosts();

  const channel = supabaseClient
    .channel(`profile-posts-${profileId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profile_posts' }, () => {
      void loadSupabasePosts();
    })
    .subscribe();

  return (() => {
    disposed = true;
    void supabaseClient.removeChannel(channel);
  }) as Unsubscribe;
}

export async function createProfilePost(
  profile: UserProfile,
  body: string,
  options: CreateProfilePostOptions = {}
) {
  const cleanBody = body.trim();
  const photoUrl = options.photoUrl?.trim();
  const emoji = options.emoji?.trim();
  const voiceUrl = options.voiceUrl?.trim();
  const musicUrl = options.musicUrl?.trim();
  const musicTitle = options.musicTitle?.trim();
  const visibility = options.visibility ?? 'public';

  if (!cleanBody && !photoUrl && !emoji && !voiceUrl && !musicUrl) {
    throw new Error('Write something, add a photo, or attach something first.');
  }

  const supabase = getSupabaseClient();
  const user = await getCurrentSupabaseUser();
  const profileId = user?.id ?? profile.id;
  const createdAtMs = Date.now();
  const createdAt = new Date(createdAtMs);
  const postId = `profile-post-${profileId}-${createdAtMs}`;
  const localPost: ProfilePost = {
    id: postId,
    profileId,
    authorNickname: profile.nickname,
    body: cleanBody,
    photoUrl: photoUrl || undefined,
    emoji: emoji || undefined,
    voiceUrl: voiceUrl || undefined,
    musicUrl: musicUrl || undefined,
    musicTitle: musicTitle || undefined,
    visibility,
    createdAt
  };

  upsertLocalPost(localPost);

  if (!supabase || !user) {
    return localPost;
  }

  void Promise.all([
    supabase
      .from('profiles')
      .upsert({
        id: profileId,
        nickname: profile.nickname,
        interests: profile.interests,
        updated_at_ms: Date.now(),
        updated_at: new Date().toISOString()
      }),
    supabase.from('profile_posts').upsert({
      id: postId,
      profile_id: profileId,
      author_nickname: profile.nickname,
      body: cleanBody,
      photo_url: photoUrl || null,
      emoji: emoji || null,
      voice_url: voiceUrl || null,
      music_url: musicUrl || null,
      music_title: musicTitle || null,
      visibility,
      created_at_ms: createdAtMs,
      created_at: new Date(createdAtMs).toISOString(),
      updated_at: new Date(createdAtMs).toISOString()
    })
  ]).catch(() => undefined);

  return localPost;
}

export function updateProfilePostBody(postId: string, body: string) {
  const cleanBody = body.trim();
  const existingIndex = localPosts.findIndex((post) => post.id === postId);

  if (existingIndex < 0) {
    throw new Error('Post was not found.');
  }

  const updatedPost = {
    ...localPosts[existingIndex],
    body: cleanBody
  };

  localPosts[existingIndex] = updatedPost;
  saveStoredPosts();

  const supabase = getSupabaseClient();

  if (supabase) {
    void supabase
      .from('profile_posts')
      .update({
        body: cleanBody,
        updated_at: new Date().toISOString()
      })
      .eq('id', postId)
      .then(() => undefined, () => undefined);
  }

  return updatedPost;
}

export function deleteProfilePost(postId: string) {
  const existingIndex = localPosts.findIndex((post) => post.id === postId);

  if (existingIndex >= 0) {
    localPosts.splice(existingIndex, 1);
    saveStoredPosts();
  }

  const supabase = getSupabaseClient();

  if (supabase) {
    void supabase
      .from('profile_posts')
      .delete()
      .eq('id', postId)
      .then(() => undefined, () => undefined);
  }
}

export function uploadProfilePostPhoto(profileId: string, file: Blob) {
  return uploadSupabaseProfileFile('profile-posts', profileId, file);
}

export function uploadProfileVoiceClip(profileId: string, file: Blob) {
  return uploadSupabaseProfileFile('profile-voice-posts', profileId, file);
}

export function uploadProfileAvatar(profileId: string, file: Blob) {
  return uploadSupabaseProfileFile('profile-avatars', profileId, file);
}

async function uploadSupabaseProfileFile(bucket: string, profileId: string, file: Blob) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    throw new Error(supabaseMissingConfigMessage());
  }

  const path = `${profileId}/${Date.now()}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false
  });

  if (error) {
    throw new Error(error.message || 'Supabase Storage could not upload this file.');
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export function profilePostErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Profile post failed.';
}
