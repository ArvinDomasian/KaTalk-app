import type { ProfileVerification, SubscriptionAccess, UserEconomy, UserProfile } from '../types';

const FREE_DAILY_LIKES = 20;
export const REWARDED_AD_LIKES = 5;

export type UserFeatureResult = {
  ok: boolean;
  profile: UserProfile;
  message: string;
};

function tomorrowIso(now = new Date()) {
  const reset = new Date(now);
  reset.setHours(24, 0, 0, 0);
  return reset.toISOString();
}

function clampCount(value: unknown, fallback = 0) {
  return Math.max(0, Math.floor(typeof value === 'number' && Number.isFinite(value) ? value : fallback));
}

export function normalizeUserEconomy(economy?: Partial<UserEconomy>, now = new Date()): UserEconomy {
  const resetAtMs = economy?.dailyLikesResetAt ? Date.parse(economy.dailyLikesResetAt) : 0;
  const shouldResetDailyLikes = !resetAtMs || resetAtMs <= now.getTime();

  return {
    dailyLikesRemaining: shouldResetDailyLikes
      ? FREE_DAILY_LIKES
      : Math.min(FREE_DAILY_LIKES + REWARDED_AD_LIKES, clampCount(economy?.dailyLikesRemaining, FREE_DAILY_LIKES)),
    dailyLikesResetAt: shouldResetDailyLikes ? tomorrowIso(now) : economy?.dailyLikesResetAt ?? tomorrowIso(now),
    boosts: clampCount(economy?.boosts),
    superLikes: clampCount(economy?.superLikes),
    coins: clampCount(economy?.coins),
    gifts: clampCount(economy?.gifts),
    profileSpotlights: clampCount(economy?.profileSpotlights),
    undoSwipes: clampCount(economy?.undoSwipes)
  };
}

export function normalizeProfileVerification(verification?: Partial<ProfileVerification>): ProfileVerification {
  return {
    status: verification?.status ?? 'not_started',
    badgeVisible: Boolean(verification?.badgeVisible),
    requestedAt: verification?.requestedAt,
    method: verification?.method
  };
}

export function hasPaidMembership(subscription?: SubscriptionAccess) {
  return Boolean(subscription?.isActive && subscription.tier !== 'free');
}

export function hasUnlimitedLikes(subscription?: SubscriptionAccess) {
  return hasPaidMembership(subscription);
}

export function withNormalizedFeatures(profile: UserProfile): UserProfile {
  return {
    ...profile,
    economy: normalizeUserEconomy(profile.economy),
    verification: normalizeProfileVerification(profile.verification)
  };
}

export function spendDailyLike(profile: UserProfile, targetName = 'this member'): UserFeatureResult {
  const economy = normalizeUserEconomy(profile.economy);

  if (hasUnlimitedLikes(profile.subscription)) {
    return {
      ok: true,
      profile: { ...profile, economy },
      message: `Liked ${targetName}. Your membership includes unlimited likes.`
    };
  }

  if (economy.dailyLikesRemaining <= 0) {
    return {
      ok: false,
      profile: { ...profile, economy },
      message: 'No free likes left today. They reset tomorrow.'
    };
  }

  const nextEconomy = {
    ...economy,
    dailyLikesRemaining: economy.dailyLikesRemaining - 1
  };

  return {
    ok: true,
    profile: { ...profile, economy: nextEconomy },
    message: `Liked ${targetName}. ${nextEconomy.dailyLikesRemaining} free likes left today.`
  };
}

export function spendSuperLike(profile: UserProfile, targetName = 'this member'): UserFeatureResult {
  const economy = normalizeUserEconomy(profile.economy);

  if (profile.subscription?.isActive && (profile.subscription.tier === 'premium_plus' || profile.subscription.tier === 'vip')) {
    return {
      ok: true,
      profile: { ...profile, economy },
      message: `Super Like sent to ${targetName}. Your membership includes unlimited Super Likes.`
    };
  }

  if (economy.superLikes <= 0) {
    return {
      ok: false,
      profile: { ...profile, economy },
      message: 'No Super Likes available. Add real Super Like products in RevenueCat before selling more.'
    };
  }

  const nextEconomy = {
    ...economy,
    superLikes: economy.superLikes - 1
  };

  return {
    ok: true,
    profile: { ...profile, economy: nextEconomy },
    message: `Super Like sent to ${targetName}. ${nextEconomy.superLikes} left.`
  };
}

export function spendBoost(profile: UserProfile): UserFeatureResult {
  const economy = normalizeUserEconomy(profile.economy);

  if (profile.subscription?.isActive && profile.subscription.tier === 'vip') {
    return {
      ok: true,
      profile: { ...profile, economy },
      message: 'VIP boost is active. Your profile is prioritized for a short time.'
    };
  }

  if (economy.boosts <= 0) {
    return {
      ok: false,
      profile: { ...profile, economy },
      message: 'No boosts available. Add real Boost products in RevenueCat before selling boosts.'
    };
  }

  const nextEconomy = {
    ...economy,
    boosts: economy.boosts - 1
  };

  return {
    ok: true,
    profile: { ...profile, economy: nextEconomy },
    message: `Boost active. ${nextEconomy.boosts} boosts left.`
  };
}

export function requestManualVerification(profile: UserProfile): UserFeatureResult {
  const verification = normalizeProfileVerification(profile.verification);

  if (verification.status === 'verified') {
    return {
      ok: true,
      profile: { ...profile, verification },
      message: 'Your profile is already verified.'
    };
  }

  const nextVerification: ProfileVerification = {
    status: 'manual_pending',
    badgeVisible: false,
    method: 'manual',
    requestedAt: new Date().toISOString()
  };

  return {
    ok: true,
    profile: { ...profile, verification: nextVerification },
    message: 'Manual verification requested. A moderator can review this profile next.'
  };
}

export function requestFastVerification(profile: UserProfile): UserFeatureResult {
  return {
    ok: false,
    profile: withNormalizedFeatures(profile),
    message: 'Fast Verification needs a real App Store / Google Play product first: katalk_fast_verification.'
  };
}

export function startRewardedAd(profile: UserProfile): UserFeatureResult {
  return {
    ok: false,
    profile: withNormalizedFeatures(profile),
    message: 'Rewarded ads need a real ad network setup first. Add AdMob or another rewarded ad provider before giving ad rewards.'
  };
}

export function openAiTools(profile: UserProfile): UserFeatureResult {
  if (!hasPaidMembership(profile.subscription)) {
    return {
      ok: false,
      profile: withNormalizedFeatures(profile),
      message: 'AI profile help is a Premium feature. Upgrade first, then connect an AI provider before launch.'
    };
  }

  return {
    ok: false,
    profile: withNormalizedFeatures(profile),
    message: 'AI profile help needs a real AI provider key before it can generate bios, openers, or coaching.'
  };
}
