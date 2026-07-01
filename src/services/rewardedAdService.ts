import type { UserProfile } from '../types';
import { withNormalizedFeatures, type UserFeatureResult } from './userFeatureService';

export async function showRewardedLikeAd(profile: UserProfile): Promise<UserFeatureResult> {
  return {
    ok: false,
    profile: withNormalizedFeatures(profile),
    message: 'Rewarded ads run inside the installed Android or iOS app, not the browser preview.'
  };
}
