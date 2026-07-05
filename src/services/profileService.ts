import { shouldUseSupabase } from './backendConfig';
import {
  loadCurrentFirebaseUserProfile,
  saveFirebaseUserProfile
} from './firebaseProfileService';
import type { UserProfile } from '../types';

export async function saveUserProfile(profile: UserProfile) {
  if (!shouldUseSupabase()) {
    return saveFirebaseUserProfile(profile);
  }

  const { saveSupabaseUserProfile } = await import('./supabaseProfileService');
  return saveSupabaseUserProfile(profile);
}

export async function loadCurrentUserProfile(timeoutMs = 6000) {
  if (!shouldUseSupabase()) {
    return loadCurrentFirebaseUserProfile(timeoutMs);
  }

  const { loadCurrentSupabaseUserProfile } = await import('./supabaseProfileService');
  return loadCurrentSupabaseUserProfile(timeoutMs);
}
