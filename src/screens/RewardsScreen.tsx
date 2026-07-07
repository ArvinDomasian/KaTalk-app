import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../components/AppText';
import { PressableScale } from '../components/PressableScale';
import {
  claimDailyReward,
  claimMissionReward,
  hasPaidMembership,
  normalizeUserEconomy,
  rewardXpGoalForLevel
} from '../services/userFeatureService';
import { colors } from '../theme';
import type { UserProfile } from '../types';

type Props = {
  profile: UserProfile;
  darkMode?: boolean;
  onProfileUpdate: (profile: UserProfile) => void;
  onOpenPremium?: () => void;
};

type Mission = {
  id: string;
  title: string;
  caption: string;
  icon: keyof typeof Ionicons.glyphMap;
  progress: number;
  target: number;
  coins: number;
  xp: number;
};

function isSameLocalDate(value?: string) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const now = new Date();

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function levelTitle(level: number) {
  if (level >= 20) {
    return 'Heart Legend';
  }

  if (level >= 12) {
    return 'Love Explorer';
  }

  if (level >= 6) {
    return 'Connection Builder';
  }

  return 'New Explorer';
}

export function RewardsScreen({
  profile,
  darkMode = true,
  onProfileUpdate,
  onOpenPremium
}: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const economy = normalizeUserEconomy(profile.economy);
  const xpGoal = rewardXpGoalForLevel(economy.rewardLevel);
  const xpPercent = Math.min(100, Math.round((economy.rewardXp / xpGoal) * 100));
  const dailyClaimed = isSameLocalDate(economy.dailyRewardClaimedAt);
  const paidMember = hasPaidMembership(profile.subscription);
  const missions = useMemo<Mission[]>(
    () => [
      {
        id: 'like-10-profiles',
        title: 'Like 10 profiles',
        caption: 'Use Discover likes to show interest.',
        icon: 'heart',
        progress: Math.min(10, economy.missionLikes),
        target: 10,
        coins: 20,
        xp: 100
      },
      {
        id: 'start-3-conversations',
        title: 'Start 3 conversations',
        caption: 'Real message matches count here.',
        icon: 'chatbubbles',
        progress: Math.min(3, economy.conversationsStarted),
        target: 3,
        coins: 30,
        xp: 140
      },
      {
        id: 'watch-5-videos',
        title: 'Watch 5 videos',
        caption: 'Video discovery progress unlocks this.',
        icon: 'play-circle',
        progress: Math.min(5, economy.videosWatched),
        target: 5,
        coins: 15,
        xp: 80
      }
    ],
    [economy.conversationsStarted, economy.missionLikes, economy.videosWatched]
  );

  function applyRewardResult(result: ReturnType<typeof claimDailyReward>) {
    onProfileUpdate(result.profile);
    setStatus(result.message);
  }

  function handleDailyReward() {
    applyRewardResult(claimDailyReward(profile));
  }

  function handleMissionClaim(mission: Mission) {
    if (mission.progress < mission.target) {
      setStatus(`${mission.title}: ${mission.progress}/${mission.target} complete.`);
      return;
    }

    applyRewardResult(claimMissionReward(profile, mission.id, mission.coins, mission.xp));
  }

  return (
    <View style={[styles.root, !darkMode && styles.root]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View>
            <AppText style={styles.brand}>KaTalk</AppText>
            <AppText style={styles.screenTitle}>Rewards</AppText>
          </View>
          <View style={styles.coinPill}>
            <Ionicons name="ellipse" size={14} color={colors.warn} />
            <AppText style={styles.coinText}>{economy.coins.toLocaleString()}</AppText>
          </View>
        </View>

        <View style={styles.levelCard}>
          <View style={styles.levelHeader}>
            <View style={styles.levelIcon}>
              <Ionicons name="trophy" size={30} color={colors.onAccent} />
            </View>
            <View style={styles.levelCopy}>
              <AppText style={styles.levelTitle}>Level {economy.rewardLevel}</AppText>
              <AppText style={styles.levelSubtitle}>{levelTitle(economy.rewardLevel)}</AppText>
            </View>
            <View style={styles.levelBadge}>
              <Ionicons name="sparkles" size={18} color={colors.onAccent} />
            </View>
          </View>
          <View style={styles.xpBarTrack}>
            <View style={[styles.xpBarFill, { width: `${xpPercent}%` }]} />
          </View>
          <AppText style={styles.xpText}>
            {economy.rewardXp.toLocaleString()} / {xpGoal.toLocaleString()} XP
          </AppText>
        </View>

        <View style={styles.dailyCard}>
          <View style={styles.sectionHeader}>
            <View>
              <AppText style={styles.sectionTitle}>Daily Rewards</AppText>
              <AppText style={styles.sectionMeta}>
                Come back tomorrow to keep your streak.
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </View>
          <View style={styles.rewardDays}>
            {Array.from({ length: 7 }, (_, index) => {
              const day = index + 1;
              const active = day <= Math.max(1, economy.dailyRewardStreak);
              const today = day === Math.min(7, Math.max(1, economy.dailyRewardStreak + (dailyClaimed ? 0 : 1)));

              return (
                <View key={day} style={[styles.rewardDay, active && styles.rewardDayActive, today && styles.rewardDayToday]}>
                  <Ionicons name={active ? 'gift' : 'gift-outline'} size={15} color={active ? colors.onAccent : colors.muted} />
                  <AppText style={[styles.rewardDayText, active && styles.rewardDayTextActive]}>Day {day}</AppText>
                </View>
              );
            })}
          </View>
          <PressableScale
            accessibilityRole="button"
            disabled={dailyClaimed}
            onPress={handleDailyReward}
            style={[styles.claimButton, dailyClaimed && styles.claimButtonDisabled]}
          >
            <AppText style={[styles.claimButtonText, dailyClaimed && styles.claimButtonTextDisabled]}>
              {dailyClaimed ? 'Claimed Today' : 'Claim Daily Reward'}
            </AppText>
          </PressableScale>
        </View>

        <View style={styles.missionCard}>
          <AppText style={styles.sectionTitle}>Today Missions</AppText>
          <View style={styles.missionList}>
            {missions.map((mission) => {
              const completed = mission.progress >= mission.target;
              const claimed = economy.claimedMissionIds.includes(mission.id);
              const progressPercent = Math.min(100, (mission.progress / mission.target) * 100);

              return (
                <View key={mission.id} style={styles.missionRow}>
                  <View style={styles.missionIcon}>
                    <Ionicons name={mission.icon} size={18} color={colors.onAccent} />
                  </View>
                  <View style={styles.missionBody}>
                    <View style={styles.missionTitleRow}>
                      <AppText style={styles.missionTitle}>{mission.title}</AppText>
                      <AppText style={styles.missionProgress}>{mission.progress}/{mission.target}</AppText>
                    </View>
                    <AppText style={styles.missionCaption}>{mission.caption}</AppText>
                    <View style={styles.missionTrack}>
                      <View style={[styles.missionFill, { width: `${progressPercent}%` }]} />
                    </View>
                  </View>
                  <PressableScale
                    accessibilityRole="button"
                    disabled={claimed}
                    onPress={() => handleMissionClaim(mission)}
                    style={[
                      styles.missionClaim,
                      completed && styles.missionClaimReady,
                      claimed && styles.missionClaimed
                    ]}
                  >
                    <Ionicons name="ellipse" size={10} color={colors.warn} />
                    <AppText style={styles.missionClaimText}>
                      {claimed ? 'Done' : `+${mission.coins}`}
                    </AppText>
                  </PressableScale>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.statsGrid}>
          <RewardStat icon="heart" label="Matches" value={String(Math.max(0, economy.conversationsStarted * 2))} />
          <RewardStat icon="thumbs-up" label="Likes" value={String(economy.missionLikes)} />
          <RewardStat icon="chatbubble-ellipses" label="Conversations" value={String(economy.conversationsStarted)} />
          <RewardStat icon="eye" label="Profile Views" value={economy.profileViews > 999 ? '1K+' : String(economy.profileViews)} />
        </View>

        <View style={styles.achievementCard}>
          <View style={styles.sectionHeader}>
            <AppText style={styles.sectionTitle}>Achievements</AppText>
            <AppText style={styles.viewAllText}>View all</AppText>
          </View>
          <View style={styles.achievementRow}>
            <Achievement icon="flame" label="Streak" active={economy.dailyRewardStreak > 0} />
            <Achievement icon="chatbox-ellipses" label="Opener" active={economy.conversationsStarted >= 1} />
            <Achievement icon="star" label="Explorer" active={economy.missionLikes >= 5} />
          </View>
        </View>

        <View style={styles.premiumCard}>
          <Ionicons name="diamond" size={28} color={colors.lavender} />
          <AppText style={styles.premiumTitle}>
            {paidMember ? 'Premium Active' : 'Go Premium'}
          </AppText>
          <AppText style={styles.premiumCopy}>
            {paidMember
              ? 'Your premium perks are connected to this account.'
              : 'Unlock unlimited likes, advanced filters, read receipts, and top picks.'}
          </AppText>
          <PressableScale
            accessibilityRole="button"
            onPress={onOpenPremium}
            style={styles.premiumButton}
          >
            <AppText style={styles.premiumButtonText}>
              {paidMember ? 'Manage Membership' : 'Try 3 Days Free'}
            </AppText>
          </PressableScale>
        </View>

        {status ? (
          <View style={styles.statusCard}>
            <AppText style={styles.statusText}>{status}</AppText>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function RewardStat({
  icon,
  label,
  value
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <AppText style={styles.statValue}>{value}</AppText>
      <AppText style={styles.statLabel}>{label}</AppText>
    </View>
  );
}

function Achievement({
  icon,
  label,
  active
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
}) {
  return (
    <View style={[styles.achievement, active && styles.achievementActive]}>
      <Ionicons name={icon} size={22} color={active ? colors.onAccent : colors.muted} />
      <AppText style={[styles.achievementText, active && styles.achievementTextActive]}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 14
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  brand: {
    color: colors.accent,
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '900'
  },
  screenTitle: {
    color: colors.ink,
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '900'
  },
  coinPill: {
    minHeight: 36,
    borderRadius: 18,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface
  },
  coinText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900'
  },
  levelCard: {
    borderRadius: 20,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: '#3B1742',
    backgroundColor: '#181021'
  },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  levelIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  levelCopy: {
    flex: 1
  },
  levelTitle: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900'
  },
  levelSubtitle: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800'
  },
  levelBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lavender
  },
  xpBarTrack: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#2D2039'
  },
  xpBarFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: colors.accent
  },
  xpText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800'
  },
  dailyCard: {
    borderRadius: 20,
    padding: 14,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '900'
  },
  sectionMeta: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  rewardDays: {
    flexDirection: 'row',
    gap: 6
  },
  rewardDay: {
    flex: 1,
    minHeight: 58,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.surfaceMuted
  },
  rewardDayActive: {
    backgroundColor: '#2C1640'
  },
  rewardDayToday: {
    borderWidth: 1,
    borderColor: colors.accent
  },
  rewardDayText: {
    color: colors.muted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900'
  },
  rewardDayTextActive: {
    color: colors.onAccent
  },
  claimButton: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  claimButtonDisabled: {
    backgroundColor: colors.surfaceMuted
  },
  claimButtonText: {
    color: colors.onAccent,
    fontWeight: '900'
  },
  claimButtonTextDisabled: {
    color: colors.muted
  },
  missionCard: {
    borderRadius: 20,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface
  },
  missionList: {
    gap: 10
  },
  missionRow: {
    minHeight: 78,
    borderRadius: 16,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceMuted
  },
  missionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lavender
  },
  missionBody: {
    flex: 1,
    minWidth: 0,
    gap: 4
  },
  missionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  missionTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900'
  },
  missionProgress: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900'
  },
  missionCaption: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700'
  },
  missionTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: '#30263B'
  },
  missionFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.lavender
  },
  missionClaim: {
    minWidth: 54,
    minHeight: 34,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#241C2F'
  },
  missionClaimReady: {
    backgroundColor: colors.accent
  },
  missionClaimed: {
    backgroundColor: '#223328'
  },
  missionClaimText: {
    color: colors.onAccent,
    fontSize: 11,
    fontWeight: '900'
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  statCard: {
    width: '48%',
    minHeight: 104,
    borderRadius: 18,
    padding: 14,
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.surface
  },
  statValue: {
    color: colors.ink,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900'
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800'
  },
  achievementCard: {
    borderRadius: 20,
    padding: 14,
    gap: 12,
    backgroundColor: colors.surface
  },
  viewAllText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800'
  },
  achievementRow: {
    flexDirection: 'row',
    gap: 10
  },
  achievement: {
    flex: 1,
    minHeight: 74,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surfaceMuted
  },
  achievementActive: {
    backgroundColor: '#3B1840'
  },
  achievementText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900'
  },
  achievementTextActive: {
    color: colors.onAccent
  },
  premiumCard: {
    borderRadius: 22,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: '#3A1A54',
    backgroundColor: '#130D20'
  },
  premiumTitle: {
    color: colors.ink,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900'
  },
  premiumCopy: {
    color: colors.muted,
    lineHeight: 20,
    fontWeight: '700'
  },
  premiumButton: {
    marginTop: 4,
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  premiumButtonText: {
    color: colors.onAccent,
    fontWeight: '900'
  },
  statusCard: {
    borderRadius: 16,
    padding: 12,
    backgroundColor: colors.surfaceMuted
  },
  statusText: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    textAlign: 'center'
  }
});
