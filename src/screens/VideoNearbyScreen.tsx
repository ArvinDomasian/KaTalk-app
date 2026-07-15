import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Platform,
  ScrollView,
  StyleSheet,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../components/AppText';
import { MemberAvatar } from '../components/MemberAvatar';
import { PrimaryButton } from '../components/PrimaryButton';
import { PressableScale } from '../components/PressableScale';
import { VideoCallStage } from '../components/VideoCallStage';
import { appServices } from '../services/localAppServices';
import {
  normalizeUserEconomy,
  recordVideoWatched,
  spendDailyLike,
  spendSuperLike
} from '../services/userFeatureService';
import { registeredMemberErrorMessage } from '../services/registeredUserService';
import {
  getAgoraSetupError,
  leaveLiveVideoMatch,
  recordLiveVideoSafety,
  startLiveVideoMatching,
  subscribeLiveVideoMatchState,
  type LiveVideoSession
} from '../services/liveVideoMatchService';
import { colors } from '../theme';
import type { Candidate, UserProfile } from '../types';

type Props = {
  profile: UserProfile;
  darkMode?: boolean;
  onProfileUpdate?: (profile: UserProfile) => void;
  onCallStateChange?: (active: boolean) => void;
};

type VideoState = 'idle' | 'searching' | 'matched' | 'calling';
type DiscoverFeed = 'forYou' | 'following' | 'new';
type MemberDecision = 'liked' | 'passed' | 'super_liked' | 'followed';

function friendlyDiscoverNotice(message: string) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('permission denied') || lowerMessage.includes('row level security')) {
    return 'Discover is still syncing real profiles. Members will appear here after app database access is ready.';
  }

  return message;
}

export function VideoNearbyScreen({
  profile,
  darkMode = false,
  onProfileUpdate,
  onCallStateChange
}: Props) {
  const [videoState, setVideoState] = useState<VideoState>('idle');
  const [searchMessage, setSearchMessage] = useState('Looking for someone compatible');
  const [activeSession, setActiveSession] = useState<LiveVideoSession | null>(null);
  const [nearbyMembers, setNearbyMembers] = useState<Candidate[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [memberLoadNotice, setMemberLoadNotice] = useState<string | null>(null);
  const [memberDecisions, setMemberDecisions] = useState<Record<string, MemberDecision>>({});
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [discoverFeed, setDiscoverFeed] = useState<DiscoverFeed>('forYou');
  const cancelSearchRef = useRef<(() => void) | null>(null);
  const matchedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFinishingRef = useRef(false);
  const economy = normalizeUserEconomy(profile.economy);

  useEffect(() => {
    void refreshNearby();
  }, [profile]);

  useEffect(() => {
    onCallStateChange?.(videoState !== 'idle');
  }, [onCallStateChange, videoState]);

  useEffect(() => {
    if (!activeSession || videoState === 'idle') {
      return;
    }

    return subscribeLiveVideoMatchState(
      activeSession.id,
      (state) => {
        if (state.status === 'active' || isFinishingRef.current) {
          return;
        }

        isFinishingRef.current = true;
        resetVideoState();
        Alert.alert(
          state.status === 'blocked' ? 'Call ended' : 'The other person left',
          state.status === 'blocked'
            ? 'This video match is no longer available.'
            : 'You can find another video match whenever you are ready.'
        );
      },
      (message) => {
        Alert.alert('Call status unavailable', message);
      }
    );
  }, [activeSession, videoState]);

  useEffect(() => {
    return () => {
      cancelSearchRef.current?.();

      if (matchedTimerRef.current) {
        clearTimeout(matchedTimerRef.current);
      }

      onCallStateChange?.(false);
    };
  }, [onCallStateChange]);

  async function refreshNearby() {
    setIsLoadingMembers(true);
    setMemberLoadNotice(null);

    try {
      const members = await appServices.nearby.list(profile);
      setNearbyMembers(members);
    } catch (error) {
      setNearbyMembers([]);
      setMemberLoadNotice(registeredMemberErrorMessage(error));
    } finally {
      setIsLoadingMembers(false);
    }
  }

  function resetVideoState() {
    cancelSearchRef.current?.();
    cancelSearchRef.current = null;

    if (matchedTimerRef.current) {
      clearTimeout(matchedTimerRef.current);
      matchedTimerRef.current = null;
    }

    setActiveSession(null);
    setVideoState('idle');
    setSearchMessage('Looking for someone compatible');
  }

  function startVideo() {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Use the installed mobile app',
        'Real camera-to-camera calling uses Agora and runs in the Android or iOS build, not the browser preview.'
      );
      return;
    }

    const setupError = getAgoraSetupError();

    if (setupError) {
      Alert.alert('Video calling needs setup', setupError);
      return;
    }

    isFinishingRef.current = false;
    cancelSearchRef.current?.();
    setVideoState('searching');
    setSearchMessage('Looking for someone compatible');

    cancelSearchRef.current = startLiveVideoMatching(profile, {
      onSearching: setSearchMessage,
      onMatched: (session) => {
        cancelSearchRef.current = null;
        setActiveSession(session);
        setVideoState('matched');
        onProfileUpdate?.(recordVideoWatched(profile));
        matchedTimerRef.current = setTimeout(() => {
          setVideoState('calling');
        }, 1200);
      },
      onError: (message) => {
        resetVideoState();
        Alert.alert('Video match unavailable', message);
      }
    });
  }

  function cancelSearch() {
    isFinishingRef.current = false;
    resetVideoState();
  }

  async function endVideo(notifyMatch = true) {
    if (isFinishingRef.current) {
      return;
    }

    isFinishingRef.current = true;
    const matchId = activeSession?.id;

    resetVideoState();

    if (notifyMatch && matchId) {
      await leaveLiveVideoMatch(matchId);
    }
  }

  function reportVideo() {
    if (!activeSession) {
      return;
    }

    Alert.alert(
      'Report this video match?',
      'The call will end and the report will be sent for moderation.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: () => {
            const matchId = activeSession.id;
            isFinishingRef.current = true;
            resetVideoState();
            void recordLiveVideoSafety(matchId, 'report').then(() => {
              Alert.alert('Report submitted', 'This video session was sent to moderation.');
            });
          }
        }
      ]
    );
  }

  function blockVideo() {
    if (!activeSession) {
      return;
    }

    Alert.alert(
      `Block ${activeSession.candidate.nickname}?`,
      'The call will end and you will not be matched with this person again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            const matchId = activeSession.id;
            isFinishingRef.current = true;
            resetVideoState();
            void recordLiveVideoSafety(matchId, 'block').then(() => {
              void refreshNearby();
              Alert.alert('Member blocked', 'This member will no longer appear for you.');
            });
          }
        }
      ]
    );
  }

  function handleCallError(message: string) {
    Alert.alert('Video call problem', message, [
      {
        text: 'Close call',
        onPress: () => void endVideo()
      }
    ]);
  }

  function handleNearbySafety(action: 'report' | 'block', member: Candidate) {
    void appServices.safety.record({
      source: 'nearby_profile',
      action,
      targetId: member.id,
      actorId: profile.id
    });
    Alert.alert(
      action === 'report' ? 'Report submitted' : 'Member blocked',
      action === 'report'
        ? 'This nearby profile was sent to moderation.'
        : 'This member will be hidden from your discovery results.'
    );

    if (action === 'block') {
      void refreshNearby();
    }
  }

  const availableMembers = nearbyMembers.filter((member) => memberDecisions[member.id] !== 'passed');
  const followingMembers = nearbyMembers.filter((member) => {
    const decision = memberDecisions[member.id];
    return decision === 'liked' || decision === 'super_liked' || decision === 'followed';
  });
  const newMembers = [...availableMembers].reverse();
  const discoverMembers =
    discoverFeed === 'following'
      ? followingMembers
      : discoverFeed === 'new'
        ? newMembers
        : availableMembers;
  const featuredMember = !isLoadingMembers && !memberLoadNotice ? discoverMembers[0] ?? null : null;

  function applyProfileAction(result: ReturnType<typeof spendDailyLike>) {
    onProfileUpdate?.(result.profile);
    setActionNotice(result.message);
  }

  function likeMember(member: Candidate) {
    if (memberDecisions[member.id] === 'liked' || memberDecisions[member.id] === 'super_liked') {
      setActionNotice(`${member.nickname} is already in your liked list.`);
      return;
    }

    const result = spendDailyLike(profile, member.nickname);
    applyProfileAction(result);

    if (result.ok) {
      setMemberDecisions((current) => ({ ...current, [member.id]: 'liked' }));
    }
  }

  function passMember(member: Candidate) {
    setMemberDecisions((current) => ({ ...current, [member.id]: 'passed' }));
    setActionNotice(`${member.nickname} marked as passed.`);
  }

  function followMember(member: Candidate) {
    const decision = memberDecisions[member.id];

    if (decision === 'followed' || decision === 'liked' || decision === 'super_liked') {
      setActionNotice(`${member.nickname} is already in Following.`);
      setDiscoverFeed('following');
      return;
    }

    setMemberDecisions((current) => ({ ...current, [member.id]: 'followed' }));
    setDiscoverFeed('following');
    setActionNotice(`${member.nickname} added to Following.`);
  }

  function superLikeMember(member: Candidate) {
    if (memberDecisions[member.id] === 'super_liked') {
      setActionNotice(`${member.nickname} already has your Super Like.`);
      return;
    }

    const result = spendSuperLike(profile, member.nickname);
    applyProfileAction(result);

    if (result.ok) {
      setMemberDecisions((current) => ({ ...current, [member.id]: 'super_liked' }));
    }
  }

  if (videoState === 'calling' && activeSession) {
    return (
      <VideoCallStage
        session={activeSession}
        profile={profile}
        darkMode={darkMode}
        onLeave={() => void endVideo()}
        onReport={reportVideo}
        onBlock={blockVideo}
        onFatalError={handleCallError}
      />
    );
  }

  if (videoState === 'searching') {
    return (
      <View style={[styles.matchingRoot, darkMode && styles.rootDark]}>
        <View style={styles.searchPulseOuter}>
          <View style={styles.searchPulseMiddle}>
            <View style={styles.searchPulseInner}>
              <Ionicons name="videocam" size={42} color={colors.onAccent} />
            </View>
          </View>
        </View>
        <ActivityIndicator size="large" color={colors.accent} />
        <AppText style={[styles.matchingTitle, darkMode && styles.textOnDark]}>
          Finding someone
        </AppText>
        <AppText style={[styles.matchingCopy, darkMode && styles.mutedOnDark]}>
          {searchMessage}
        </AppText>
        <PrimaryButton
          label="Cancel"
          icon="close-outline"
          variant="secondary"
          onPress={cancelSearch}
          style={styles.cancelButton}
        />
      </View>
    );
  }

  if (videoState === 'matched' && activeSession) {
    return (
      <View style={[styles.matchingRoot, darkMode && styles.rootDark]}>
        <View style={styles.matchedAvatarFrame}>
          <MemberAvatar
            name={activeSession.candidate.nickname}
            photoUrl={activeSession.candidate.photoUrl}
            color={activeSession.candidate.avatarColor}
            size={142}
            borderColor={colors.accent}
          />
          <View style={styles.matchedBadge}>
            <Ionicons name="checkmark" size={20} color={colors.onAccent} />
          </View>
        </View>
        <AppText style={[styles.matchingTitle, darkMode && styles.textOnDark]}>
          You found a match
        </AppText>
        <AppText style={[styles.matchedName, darkMode && styles.textOnDark]}>
          {activeSession.candidate.nickname}, {activeSession.candidate.age}
        </AppText>
        <AppText style={[styles.matchingCopy, darkMode && styles.mutedOnDark]}>
          Connecting your private video call. Your camera starts off.
        </AppText>
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.root, darkMode && styles.rootDark]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <AppText style={[styles.screenTitle, darkMode && styles.textOnDark]}>Discover</AppText>
          <View style={styles.coinPill}>
            <Ionicons name="ellipse" size={13} color={colors.gold} />
            <AppText style={styles.coinPillText}>{economy.coins.toLocaleString()}</AppText>
          </View>
        </View>

        <View style={styles.discoverTabs}>
          <DiscoverTabButton
            label="For You"
            active={discoverFeed === 'forYou'}
            onPress={() => setDiscoverFeed('forYou')}
          />
          <DiscoverTabButton
            label="Following"
            active={discoverFeed === 'following'}
            onPress={() => setDiscoverFeed('following')}
          />
          <DiscoverTabButton
            label="New"
            active={discoverFeed === 'new'}
            onPress={() => setDiscoverFeed('new')}
          />
        </View>

        {actionNotice ? (
          <View style={[styles.actionNotice, darkMode && styles.softSurfaceDark]}>
            <AppText style={[styles.actionNoticeText, darkMode && styles.textOnDark]}>{actionNotice}</AppText>
          </View>
        ) : null}

        {featuredMember ? (
          <FeaturedMemberCard
            member={featuredMember}
            decision={memberDecisions[featuredMember.id]}
            feed={discoverFeed}
            onPass={() => passMember(featuredMember)}
            onLike={() => likeMember(featuredMember)}
            onFollow={() => followMember(featuredMember)}
            onMessage={startVideo}
            onShare={() => Alert.alert('Share profile', `${featuredMember.nickname}'s profile is ready to share inside KaTalk.`)}
          />
        ) : null}

        {isLoadingMembers ? (
          <View style={[styles.fullWidthEmpty, darkMode && styles.cardDark]}>
            <ActivityIndicator size="small" color={colors.accent} />
            <AppText style={[styles.emptyText, darkMode && styles.mutedOnDark]}>
              Loading real registered members...
            </AppText>
          </View>
        ) : null}
        {!isLoadingMembers && memberLoadNotice ? (
          <View style={[styles.fullWidthEmpty, darkMode && styles.cardDark]}>
            <AppText style={[styles.emptyText, darkMode && styles.mutedOnDark]}>
              {friendlyDiscoverNotice(memberLoadNotice)}
            </AppText>
          </View>
        ) : null}
        {!isLoadingMembers && !memberLoadNotice && !featuredMember ? (
          <View style={[styles.fullWidthEmpty, darkMode && styles.cardDark]}>
            <AppText style={[styles.emptyTitle, darkMode && styles.textOnDark]}>
              {discoverFeed === 'following' ? 'No followed profiles yet' : 'No people in Discover yet'}
            </AppText>
            <AppText style={[styles.emptyText, darkMode && styles.mutedOnDark]}>
              {discoverFeed === 'following'
                ? 'Tap the bookmark button on a profile to add them here.'
                : 'Real registered profiles will appear here as soon as members complete their profiles.'}
            </AppText>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function DiscoverTabButton({
  label,
  active,
  onPress
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.discoverTab, active && styles.discoverTabActive]}
    >
      <AppText style={active ? styles.discoverTabActiveText : styles.discoverTabText}>
        {label}
      </AppText>
    </PressableScale>
  );
}

function FeaturedMemberCard({
  member,
  decision,
  feed,
  onPass,
  onLike,
  onFollow,
  onMessage,
  onShare
}: {
  member: Candidate;
  decision?: MemberDecision;
  feed: DiscoverFeed;
  onPass: () => void;
  onLike: () => void;
  onFollow: () => void;
  onMessage: () => void;
  onShare: () => void;
}) {
  const badgeLabel = feed === 'following' ? 'Following' : 'New here';
  const followIcon = decision === 'followed' || decision === 'liked' || decision === 'super_liked'
    ? 'bookmark'
    : 'bookmark-outline';

  const content = (
    <>
      <View style={styles.featureShade} />
      <View style={styles.featureTopRow}>
        <View style={styles.featureNameBadge}>
          <AppText style={styles.featureBadgeText}>{badgeLabel}</AppText>
        </View>
        <PressableScale accessibilityRole="button" onPress={onPass} style={styles.featureCloseButton}>
          <Ionicons name="close" size={16} color={colors.onAccent} />
        </PressableScale>
      </View>
      <View style={styles.featureSideActions}>
        <PressableScale accessibilityRole="button" onPress={onLike} style={[styles.featureAction, styles.featureHeart]}>
          <Ionicons name="heart" size={21} color={colors.onAccent} />
        </PressableScale>
        <PressableScale accessibilityRole="button" onPress={onMessage} style={styles.featureAction}>
          <Ionicons name="chatbubble-ellipses" size={18} color={colors.onAccent} />
        </PressableScale>
        <PressableScale accessibilityRole="button" onPress={onFollow} style={styles.featureAction}>
          <Ionicons name={followIcon} size={18} color={colors.onAccent} />
        </PressableScale>
        <PressableScale accessibilityRole="button" onPress={onShare} style={styles.featureAction}>
          <Ionicons name="arrow-redo" size={18} color={colors.onAccent} />
        </PressableScale>
      </View>
      <View style={styles.featureBottom}>
        <View style={styles.featureNameLine}>
          <AppText style={styles.featureMemberName}>
            {member.nickname}, {member.age}
          </AppText>
          <View style={styles.featureVerifiedBadge}>
            <Ionicons name="checkmark" size={11} color={colors.onAccent} />
          </View>
        </View>
        <View style={styles.featureMetaRow}>
          <Ionicons name="person-circle-outline" size={12} color="#E3DEEA" />
          <AppText style={styles.featureMemberMeta}>Digital Creator</AppText>
        </View>
        <View style={styles.featureMetaRow}>
          <Ionicons name="location-outline" size={12} color="#E3DEEA" />
          <AppText style={styles.featureMemberMeta}>
            {member.distanceMiles > 0 ? `${member.distanceMiles.toFixed(1)} km away` : 'Registered KaTalk member'}
          </AppText>
        </View>
        <View style={styles.featureInterestRow}>
          {member.interests.slice(0, 3).map((interest) => (
            <View key={interest} style={styles.featureInterestChip}>
              <AppText style={styles.featureInterestText}>{interest}</AppText>
            </View>
          ))}
        </View>
      </View>
    </>
  );

  if (member.photoUrl) {
    return (
      <ImageBackground source={{ uri: member.photoUrl }} imageStyle={styles.featureImage} style={styles.featureCard}>
        {content}
      </ImageBackground>
    );
  }

  return (
    <View style={[styles.featureCard, styles.featureFallback]}>
      <MemberAvatar name={member.nickname} color={member.avatarColor} size={104} borderColor="rgba(255,255,255,0.4)" />
      {content}
    </View>
  );
}

function SafetyItem({
  icon,
  label
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.safetyItem}>
      <Ionicons name={icon} size={16} color={colors.accent} />
      <AppText style={styles.safetyLabel}>{label}</AppText>
    </View>
  );
}

function MemberPhotoOverlay({
  member,
  onReport,
  onBlock
}: {
  member: Candidate;
  onReport: () => void;
  onBlock: () => void;
}) {
  return (
    <>
      <View style={styles.distanceBadge}>
        <AppText style={styles.distanceBadgeText}>
          {member.distanceMiles > 0 ? `${member.distanceMiles.toFixed(1)} Km` : 'Registered'}
        </AppText>
      </View>
      <View style={styles.photoActions}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`Report ${member.nickname}`}
          onPress={onReport}
          style={styles.photoIcon}
        >
          <Ionicons name="flag" size={15} color={colors.onAccent} />
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`Block ${member.nickname}`}
          onPress={onBlock}
          style={styles.photoIcon}
        >
          <Ionicons name="ban" size={15} color={colors.onAccent} />
        </PressableScale>
      </View>
      <AppText style={styles.photoLocation}>Registered member</AppText>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background
  },
  rootDark: {
    backgroundColor: colors.background
  },
  textOnDark: {
    color: colors.onAccent
  },
  mutedOnDark: {
    color: '#BBC1CC'
  },
  cardDark: {
    borderColor: '#332241',
    backgroundColor: colors.surface
  },
  softSurfaceDark: {
    backgroundColor: colors.surfaceMuted
  },
  content: {
    paddingTop: 16,
    paddingHorizontal: 14,
    gap: 10,
    paddingBottom: 30,
    backgroundColor: colors.background
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  screenTitle: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '800'
  },
  coinPill: {
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#171421',
    borderWidth: 1,
    borderColor: '#3B2941'
  },
  coinPillText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '900'
  },
  discoverTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
    marginBottom: 2
  },
  discoverTab: {
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)'
  },
  discoverTabActive: {
    backgroundColor: 'rgba(255, 107, 157, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 157, 0.34)'
  },
  discoverTabText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700'
  },
  discoverTabActiveText: {
    color: colors.onAccent,
    fontSize: 11,
    fontWeight: '800'
  },
  featureCard: {
    minHeight: 590,
    borderRadius: 24,
    overflow: 'hidden',
    padding: 12,
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 157, 0.36)'
  },
  featureFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    backgroundColor: '#1A1728'
  },
  featureImage: {
    borderRadius: 24
  },
  featureShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.16)',
    borderRadius: 24
  },
  featureTopRow: {
    zIndex: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  featureNameBadge: {
    minHeight: 24,
    borderRadius: 12,
    paddingHorizontal: 9,
    justifyContent: 'center',
    backgroundColor: 'rgba(11,13,24,0.64)'
  },
  featureBadgeText: {
    color: colors.onAccent,
    fontSize: 10,
    fontWeight: '800'
  },
  featureCloseButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,13,24,0.6)'
  },
  featureSideActions: {
    position: 'absolute',
    right: 12,
    top: 250,
    gap: 10,
    zIndex: 3
  },
  featureAction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20, 18, 30, 0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)'
  },
  featureHeart: {
    backgroundColor: colors.accent
  },
  featureBottom: {
    zIndex: 2,
    gap: 5,
    paddingRight: 54,
    paddingBottom: 2
  },
  featureNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  featureMemberName: {
    color: colors.onAccent,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '800'
  },
  featureVerifiedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  featureMemberMeta: {
    color: '#E3DEEA',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600'
  },
  featureMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  featureInterestRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  featureInterestChip: {
    minHeight: 22,
    borderRadius: 11,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)'
  },
  featureInterestText: {
    color: colors.onAccent,
    fontSize: 9,
    fontWeight: '700'
  },
  featureActionRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center'
  },
  featurePassButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted
  },
  featureLikeButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  featureLikeText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '900'
  },
  featureSuperButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lavender
  },
  videoPanel: {
    padding: 16,
    gap: 14,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#4A2847'
  },
  videoIntro: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start'
  },
  videoIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  videoText: {
    flex: 1,
    gap: 4
  },
  videoTitle: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900'
  },
  videoCopy: {
    color: colors.muted,
    lineHeight: 19
  },
  safetyRow: {
    flexDirection: 'row',
    gap: 6
  },
  safetyItem: {
    flex: 1,
    minHeight: 54,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 14,
    backgroundColor: colors.accentSoft
  },
  safetyLabel: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center'
  },
  mobileOnlyText: {
    color: colors.muted,
    fontSize: 11,
    textAlign: 'center'
  },
  sectionHeader: {
    gap: 2
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900'
  },
  sectionCopy: {
    color: colors.muted,
    fontSize: 12
  },
  discoveryStatus: {
    minHeight: 70,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: colors.surface
  },
  discoveryStatusTitle: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '900'
  },
  discoveryStatusCopy: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  superLikePill: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft
  },
  superLikePillText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900'
  },
  actionNotice: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#EAF8F0'
  },
  actionNoticeText: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800'
  },
  memberGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  fullWidthEmpty: {
    width: '100%',
    minHeight: 122,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.surface
  },
  emptyTitle: {
    color: colors.ink,
    fontWeight: '900',
    textAlign: 'center'
  },
  emptyText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    textAlign: 'center'
  },
  memberTile: {
    width: '48%',
    borderRadius: 18,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line
  },
  memberPhoto: {
    height: 180,
    padding: 8,
    justifyContent: 'space-between'
  },
  memberPhotoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DDEBFA'
  },
  memberImage: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18
  },
  distanceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    minHeight: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface
  },
  distanceBadgeText: {
    fontSize: 11,
    fontWeight: '900'
  },
  photoActions: {
    position: 'absolute',
    right: 8,
    top: 8,
    gap: 8
  },
  photoIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)'
  },
  photoLocation: {
    color: colors.onAccent,
    fontSize: 10,
    fontWeight: '800'
  },
  memberCaption: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10
  },
  memberName: {
    flex: 1,
    fontWeight: '800',
    fontSize: 12
  },
  decisionBadge: {
    minHeight: 24,
    borderRadius: 12,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft
  },
  decisionBadgeText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '900'
  },
  profileButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted
  },
  discoveryActions: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
    paddingBottom: 10
  },
  discoveryActionButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  passButton: {
    backgroundColor: colors.surfaceMuted
  },
  likeButton: {
    backgroundColor: colors.accent
  },
  superButton: {
    backgroundColor: '#8B6AF2'
  },
  passButtonText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900'
  },
  likeButtonText: {
    color: colors.onAccent,
    fontSize: 11,
    fontWeight: '900'
  },
  superButtonText: {
    color: colors.onAccent,
    fontSize: 11,
    fontWeight: '900'
  },
  matchingRoot: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background
  },
  searchPulseOuter: {
    width: 174,
    height: 174,
    borderRadius: 87,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A1533'
  },
  searchPulseMiddle: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B1742'
  },
  searchPulseInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  matchingTitle: {
    marginTop: 18,
    fontSize: 25,
    fontWeight: '900',
    textAlign: 'center'
  },
  matchingCopy: {
    maxWidth: 320,
    marginTop: 8,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20
  },
  cancelButton: {
    width: 180,
    marginTop: 22
  },
  matchedAvatarFrame: {
    position: 'relative'
  },
  matchedAvatar: {
    width: 142,
    height: 142,
    borderRadius: 71,
    borderWidth: 4,
    borderColor: colors.accent
  },
  matchedBadge: {
    position: 'absolute',
    right: 4,
    bottom: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.success
  },
  matchedName: {
    marginTop: 7,
    fontSize: 18,
    fontWeight: '800'
  }
});
