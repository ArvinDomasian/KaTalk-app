import Constants from 'expo-constants';
import { Platform } from 'react-native';
import mobileAds, {
  AdEventType,
  RewardedAd,
  RewardedAdEventType,
  TestIds
} from 'react-native-google-mobile-ads';
import type { UserProfile } from '../types';
import {
  normalizeUserEconomy,
  REWARDED_AD_LIKES,
  withNormalizedFeatures,
  type UserFeatureResult
} from './userFeatureService';

const REWARDED_AD_TIMEOUT_MS = 35000;

let isShowingRewardedAd = false;
let initializePromise: Promise<void> | null = null;

function getAdMobExtra() {
  const extra = Constants.expoConfig?.extra as
    | {
        adMob?: {
          androidRewardedAdUnitId?: string;
          iosRewardedAdUnitId?: string;
        };
      }
    | undefined;

  return extra?.adMob ?? {};
}

function getRewardedAdUnitId() {
  const adMob = getAdMobExtra();

  if (Platform.OS === 'android') {
    return adMob.androidRewardedAdUnitId || TestIds.REWARDED;
  }

  if (Platform.OS === 'ios') {
    return adMob.iosRewardedAdUnitId || TestIds.REWARDED;
  }

  return TestIds.REWARDED;
}

async function initializeGoogleMobileAds() {
  if (!initializePromise) {
    initializePromise = mobileAds().initialize().then(() => undefined);
  }

  await initializePromise;
}

function rewardedLikesProfile(profile: UserProfile) {
  const economy = normalizeUserEconomy(profile.economy);
  const maxRewardedLikes = 25;
  const nextLikes = Math.min(maxRewardedLikes, economy.dailyLikesRemaining + REWARDED_AD_LIKES);

  return {
    ...profile,
    economy: {
      ...economy,
      dailyLikesRemaining: nextLikes
    }
  };
}

function adErrorMessage(error: unknown) {
  const maybeError = error as { code?: string; message?: string };
  return maybeError?.message || maybeError?.code || 'Rewarded ad could not be shown.';
}

export async function showRewardedLikeAd(profile: UserProfile): Promise<UserFeatureResult> {
  if (profile.subscription?.isActive) {
    return {
      ok: false,
      profile: withNormalizedFeatures(profile),
      message: 'Your membership removes ads, so rewarded ads are only shown to free accounts.'
    };
  }

  if (isShowingRewardedAd) {
    return {
      ok: false,
      profile: withNormalizedFeatures(profile),
      message: 'A rewarded ad is already loading. Please wait.'
    };
  }

  isShowingRewardedAd = true;

  try {
    await initializeGoogleMobileAds();
  } catch (error) {
    isShowingRewardedAd = false;
    return {
      ok: false,
      profile: withNormalizedFeatures(profile),
      message: `Google Mobile Ads could not initialize: ${adErrorMessage(error)}`
    };
  }

  return new Promise((resolve) => {
    const rewardedAd = RewardedAd.createForAdRequest(getRewardedAdUnitId(), {
      keywords: ['dating', 'relationships', 'social'],
      serverSideVerificationOptions: {
        userId: profile.id,
        customData: 'daily_likes_reward'
      }
    });
    const unsubscribers: Array<() => void> = [];
    let earnedReward = false;
    let settled = false;

    function cleanup() {
      clearTimeout(timeout);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      rewardedAd.removeAllListeners();
      isShowingRewardedAd = false;
    }

    function finish(result: UserFeatureResult) {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(result);
    }

    const timeout = setTimeout(() => {
      finish({
        ok: false,
        profile: withNormalizedFeatures(profile),
        message: 'Rewarded ad took too long to load. Check your connection, then try again.'
      });
    }, REWARDED_AD_TIMEOUT_MS);

    unsubscribers.push(
      rewardedAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
        rewardedAd.show().catch((error: unknown) => {
          finish({
            ok: false,
            profile: withNormalizedFeatures(profile),
            message: `Rewarded ad could not open: ${adErrorMessage(error)}`
          });
        });
      })
    );

    unsubscribers.push(
      rewardedAd.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        earnedReward = true;
      })
    );

    unsubscribers.push(
      rewardedAd.addAdEventListener(AdEventType.CLOSED, () => {
        if (!earnedReward) {
          finish({
            ok: false,
            profile: withNormalizedFeatures(profile),
            message: 'Ad closed before the reward was earned.'
          });
          return;
        }

        finish({
          ok: true,
          profile: rewardedLikesProfile(profile),
          message: `Reward earned. ${REWARDED_AD_LIKES} free likes were added for today.`
        });
      })
    );

    unsubscribers.push(
      rewardedAd.addAdEventListener(AdEventType.ERROR, (error) => {
        finish({
          ok: false,
          profile: withNormalizedFeatures(profile),
          message: `Rewarded ad failed: ${adErrorMessage(error)}`
        });
      })
    );

    rewardedAd.load();
  });
}
