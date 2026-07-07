import type { UserProfile } from '../types';
import {
  loadCurrentSupabaseUserProfile,
  saveSupabaseUserProfile
} from './supabaseProfileService';

export function saveUserProfile(profile: UserProfile) {
  return saveSupabaseUserProfile(profile);
}

export function loadCurrentUserProfile(timeoutMs = 6000) {
  return loadCurrentSupabaseUserProfile(timeoutMs);
}
