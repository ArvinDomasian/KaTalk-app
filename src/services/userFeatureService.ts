import type { ProfileVerification, SubscriptionAccess, UserEconomy, UserProfile } from '../types';

const FREE_DAILY_LIKES = 20;
export const REWARDED_AD_LIKES = 5;
export const BASE_REWARD_XP_GOAL = 2000;

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

function clampLevel(value: unknown) {
  return Math.max(1, Math.floor(typeof value === 'number' && Number.isFinite(value) ? value : 1));
}

function cleanClaimedMissionIds(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function sameLocalDate(a?: string, b = new Date()) {
  if (!a) {
    return false;
  }

  const parsed = new Date(a);

  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.getFullYear() === b.getFullYear()
    && parsed.getMonth() === b.getMonth()
    && parsed.getDate() === b.getDate();
}

export function rewardXpGoalForLevel(level: number) {
  return BASE_REWARD_XP_GOAL + Math.max(0, level - 1) * 250;
}

function applyRewardXp(economy: UserEconomy, xp: number): UserEconomy {
  let rewardLevel = clampLevel(economy.rewardLevel);
  let rewardXp = clampCount(economy.rewardXp) + Math.max(0, Math.floor(xp));
  let coins = clampCount(economy.coins);

  while (rewardXp >= rewardXpGoalForLevel(rewardLevel)) {
    rewardXp -= rewardXpGoalForLevel(rewardLevel);
    rewardLevel += 1;
    coins += 50;
  }

  return {
    ...economy,
    coins,
    rewardLevel,
    rewardXp
  };
}

function withRewardXp(profile: UserProfile, xp: number, economyPatch?: Partial<UserEconomy>): UserProfile {
  const economy = normalizeUserEconomy(profile.economy);

  return {
    ...profile,
    economy: applyRewardXp({ ...economy, ...economyPatch }, xp)
  };
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
    undoSwipes: clampCount(economy?.undoSwipes),
    rewardLevel: clampLevel(economy?.rewardLevel),
    rewardXp: clampCount(economy?.rewardXp),
    dailyRewardStreak: clampCount(economy?.dailyRewardStreak),
    dailyRewardClaimedAt: economy?.dailyRewardClaimedAt,
    missionLikes: clampCount(economy?.missionLikes),
    conversationsStarted: clampCount(economy?.conversationsStarted),
    videosWatched: clampCount(economy?.videosWatched),
    claimedMissionIds: cleanClaimedMissionIds(economy?.claimedMissionIds),
    profileViews: clampCount(economy?.profileViews)
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
    const nextProfile = withRewardXp(profile, 12, {
      missionLikes: economy.missionLikes + 1
    });

    return {
      ok: true,
      profile: nextProfile,
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
    dailyLikesRemaining: economy.dailyLikesRemaining - 1,
    missionLikes: economy.missionLikes + 1
  };

  return {
    ok: true,
    profile: { ...profile, economy: applyRewardXp(nextEconomy, 12) },
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
    superLikes: economy.superLikes - 1,
    missionLikes: economy.missionLikes + 1
  };

  return {
    ok: true,
    profile: { ...profile, economy: applyRewardXp(nextEconomy, 24) },
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
    profile: { ...profile, economy: applyRewardXp(nextEconomy, 35) },
    message: `Boost active. ${nextEconomy.boosts} boosts left.`
  };
}

export function recordConversationStarted(profile: UserProfile): UserProfile {
  const economy = normalizeUserEconomy(profile.economy);

  return withRewardXp(profile, 30, {
    conversationsStarted: economy.conversationsStarted + 1
  });
}

export function recordVideoWatched(profile: UserProfile): UserProfile {
  const economy = normalizeUserEconomy(profile.economy);

  return withRewardXp(profile, 15, {
    videosWatched: economy.videosWatched + 1
  });
}

export function claimDailyReward(profile: UserProfile): UserFeatureResult {
  const economy = normalizeUserEconomy(profile.economy);

  if (sameLocalDate(economy.dailyRewardClaimedAt)) {
    return {
      ok: false,
      profile: { ...profile, economy },
      message: 'Daily reward already claimed today. Come back tomorrow.'
    };
  }

  const nextEconomy = {
    ...economy,
    coins: economy.coins + 20,
    gifts: economy.gifts + 1,
    dailyRewardStreak: economy.dailyRewardStreak + 1,
    dailyRewardClaimedAt: new Date().toISOString()
  };

  return {
    ok: true,
    profile: { ...profile, economy: applyRewardXp(nextEconomy, 120) },
    message: 'Daily reward claimed: +20 coins and +120 XP.'
  };
}

export function claimMissionReward(
  profile: UserProfile,
  missionId: string,
  rewardCoins: number,
  rewardXp: number
): UserFeatureResult {
  const economy = normalizeUserEconomy(profile.economy);

  if (economy.claimedMissionIds.includes(missionId)) {
    return {
      ok: false,
      profile: { ...profile, economy },
      message: 'Mission reward already claimed.'
    };
  }

  const nextEconomy = {
    ...economy,
    coins: economy.coins + rewardCoins,
    claimedMissionIds: [...economy.claimedMissionIds, missionId]
  };

  return {
    ok: true,
    profile: { ...profile, economy: applyRewardXp(nextEconomy, rewardXp) },
    message: `Mission complete: +${rewardCoins} coins and +${rewardXp} XP.`
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
