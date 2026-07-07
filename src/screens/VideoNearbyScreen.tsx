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
type MemberDecision = 'liked' | 'passed' | 'super_liked';

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
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <AppText style={[styles.screenTitle, darkMode && styles.textOnDark]}>Nearby you</AppText>
          <Ionicons name="ellipsis-horizontal" size={24} color={colors.muted} />
        </View>

        <View style={[styles.videoPanel, darkMode && styles.cardDark]}>
          <View style={styles.videoIntro}>
            <View style={styles.videoIcon}>
              <Ionicons name="videocam" size={24} color={colors.onAccent} />
            </View>
            <View style={styles.videoText}>
              <AppText style={[styles.videoTitle, darkMode && styles.textOnDark]}>
                One-to-one video match
              </AppText>
              <AppText style={[styles.videoCopy, darkMode && styles.mutedOnDark]}>
                Match with a real verified member. Camera starts off and you control when to reveal.
              </AppText>
            </View>
          </View>
          <View style={styles.safetyRow}>
            <SafetyItem icon="videocam-off-outline" label="Camera off first" />
            <SafetyItem icon="shield-checkmark-outline" label="Report or block" />
            <SafetyItem icon="exit-outline" label="Leave anytime" />
          </View>
          <PrimaryButton label="Find Video Match" icon="videocam-outline" onPress={startVideo} />
          {Platform.OS === 'web' ? (
            <AppText style={styles.mobileOnlyText}>
              Live video is available in the installed Android and iOS app.
            </AppText>
          ) : null}
        </View>

        <View style={styles.sectionHeader}>
          <AppText style={[styles.sectionTitle, darkMode && styles.textOnDark]}>Registered members</AppText>
          <AppText style={[styles.sectionCopy, darkMode && styles.mutedOnDark]}>
            Profiles only. This tab has no chat requests.
          </AppText>
        </View>

        <View style={[styles.discoveryStatus, darkMode && styles.cardDark]}>
          <View>
            <AppText style={[styles.discoveryStatusTitle, darkMode && styles.textOnDark]}>
              Discovery actions
            </AppText>
            <AppText style={[styles.discoveryStatusCopy, darkMode && styles.mutedOnDark]}>
              {profile.subscription?.isActive
                ? 'Membership active: likes are unlimited.'
                : `${economy.dailyLikesRemaining} free likes left today.`}
            </AppText>
          </View>
          <View style={styles.superLikePill}>
            <AppText style={styles.superLikePillText}>{economy.superLikes} Super Likes</AppText>
          </View>
        </View>

        {actionNotice ? (
          <View style={[styles.actionNotice, darkMode && styles.softSurfaceDark]}>
            <AppText style={[styles.actionNoticeText, darkMode && styles.textOnDark]}>{actionNotice}</AppText>
          </View>
        ) : null}

        <View style={styles.memberGrid}>
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
                {memberLoadNotice}
              </AppText>
            </View>
          ) : null}
          {!isLoadingMembers && !memberLoadNotice && nearbyMembers.length === 0 ? (
            <View style={[styles.fullWidthEmpty, darkMode && styles.cardDark]}>
              <AppText style={[styles.emptyTitle, darkMode && styles.textOnDark]}>
                No registered members yet
              </AppText>
              <AppText style={[styles.emptyText, darkMode && styles.mutedOnDark]}>
                Real profiles will appear here after other users register and complete their profile.
              </AppText>
            </View>
          ) : null}
          {nearbyMembers.map((member) => (
            <View key={member.id} style={[styles.memberTile, darkMode && styles.cardDark]}>
              {member.photoUrl ? (
                <ImageBackground
                  source={{ uri: member.photoUrl }}
                  imageStyle={styles.memberImage}
                  style={styles.memberPhoto}
                >
                  <MemberPhotoOverlay member={member} onReport={() => handleNearbySafety('report', member)} onBlock={() => handleNearbySafety('block', member)} />
                </ImageBackground>
              ) : (
                <View style={[styles.memberPhoto, styles.memberPhotoFallback]}>
                  <MemberPhotoOverlay member={member} onReport={() => handleNearbySafety('report', member)} onBlock={() => handleNearbySafety('block', member)} />
                  <MemberAvatar
                    name={member.nickname}
                    color={member.avatarColor}
                    size={78}
                    borderColor="rgba(255,255,255,0.72)"
                  />
                </View>
              )}
              <View style={styles.memberCaption}>
                <AppText style={[styles.memberName, darkMode && styles.textOnDark]}>
                  {member.nickname}, {member.age}
                </AppText>
                {memberDecisions[member.id] ? (
                  <View style={styles.decisionBadge}>
                    <AppText style={styles.decisionBadgeText}>
                      {memberDecisions[member.id] === 'super_liked'
                        ? 'Super'
                        : memberDecisions[member.id] === 'liked'
                          ? 'Liked'
                          : 'Passed'}
                    </AppText>
                  </View>
                ) : null}
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`View ${member.nickname}'s profile`}
                  onPress={() => Alert.alert(member.nickname, member.prompt)}
                  style={[styles.profileButton, darkMode && styles.softSurfaceDark]}
                >
                  <Ionicons
                    name="person-outline"
                    size={16}
                    color={darkMode ? colors.onAccent : colors.ink}
                  />
                </PressableScale>
              </View>
              <View style={styles.discoveryActions}>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Pass ${member.nickname}`}
                  onPress={() => passMember(member)}
                  style={[styles.discoveryActionButton, styles.passButton]}
                >
                  <AppText style={styles.passButtonText}>Pass</AppText>
                </PressableScale>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Like ${member.nickname}`}
                  onPress={() => likeMember(member)}
                  style={[styles.discoveryActionButton, styles.likeButton]}
                >
                  <AppText style={styles.likeButtonText}>Like</AppText>
                </PressableScale>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Super Like ${member.nickname}`}
                  onPress={() => superLikeMember(member)}
                  style={[styles.discoveryActionButton, styles.superButton]}
                >
                  <AppText style={styles.superButtonText}>Super</AppText>
                </PressableScale>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
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
    backgroundColor: colors.surface
  },
  rootDark: {
    backgroundColor: '#101217'
  },
  textOnDark: {
    color: colors.onAccent
  },
  mutedOnDark: {
    color: '#BBC1CC'
  },
  cardDark: {
    borderColor: '#2A2E38',
    backgroundColor: '#171A22'
  },
  softSurfaceDark: {
    backgroundColor: '#222735'
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 28
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  screenTitle: {
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900'
  },
  videoPanel: {
    padding: 14,
    gap: 14,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line
  },
  videoIntro: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start'
  },
  videoIcon: {
    width: 46,
    height: 46,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  videoText: {
    flex: 1,
    gap: 4
  },
  videoTitle: {
    fontSize: 18,
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
    borderRadius: 8,
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
    borderRadius: 8,
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
    borderRadius: 8,
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
    borderRadius: 8,
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
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8
  },
  distanceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    minHeight: 26,
    borderRadius: 8,
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
    borderRadius: 8,
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
    borderRadius: 8,
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
    backgroundColor: colors.surface
  },
  searchPulseOuter: {
    width: 174,
    height: 174,
    borderRadius: 87,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F3FF'
  },
  searchPulseMiddle: {
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B9DBFF'
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
