import type { ThemeMode, UserProfile } from '../types';

const PROFILE_STORAGE_KEY = 'katalk.profile.v1';
const THEME_MODE_STORAGE_KEY = 'katalk.themeMode.v1';

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

function isStoredProfile(value: unknown): value is UserProfile {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const profile = value as Partial<UserProfile>;

  return Boolean(
    profile.id &&
      profile.nickname &&
      profile.dateOfBirth &&
      profile.gender &&
      profile.preference &&
      profile.ageRange &&
      Array.isArray(profile.interests) &&
      profile.acceptedTerms &&
      profile.acceptedPrivacy &&
      profile.acceptedRules
  );
}

export function loadStoredProfile() {
  const storage = getBrowserStorage();

  if (!storage) {
    return null;
  }

  try {
    const rawProfile = storage.getItem(PROFILE_STORAGE_KEY);

    if (!rawProfile) {
      return null;
    }

    const parsedProfile = JSON.parse(rawProfile);
    return isStoredProfile(parsedProfile) ? parsedProfile : null;
  } catch {
    return null;
  }
}

export function saveStoredProfile(profile: UserProfile) {
  const storage = getBrowserStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Storage can fail in private browser modes; the app can still run in memory.
  }
}

export function clearStoredProfile() {
  const storage = getBrowserStorage();

  if (!storage) {
    return;
  }

  try {
    storage.removeItem(PROFILE_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function loadStoredThemeMode(): ThemeMode {
  const storage = getBrowserStorage();

  if (!storage) {
    return 'dark';
  }

  try {
    const storedTheme = storage.getItem(THEME_MODE_STORAGE_KEY);
    return storedTheme === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function saveStoredThemeMode(themeMode: ThemeMode) {
  const storage = getBrowserStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(THEME_MODE_STORAGE_KEY, themeMode);
  } catch {
    // Ignore theme persistence failures; the in-memory setting still works.
  }
}
