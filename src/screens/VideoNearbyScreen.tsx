import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/PrimaryButton';
import { PressableScale } from '../components/PressableScale';
import { ScreenHeader } from '../components/ScreenHeader';
import { appServices } from '../services/localAppServices';
import type { VideoSession } from '../services/contracts';
import { colors } from '../theme';
import type { Candidate, UserProfile } from '../types';

type Props = {
  profile: UserProfile;
};

export function VideoNearbyScreen({ profile }: Props) {
  const [inVideo, setInVideo] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [microphoneMuted, setMicrophoneMuted] = useState(true);
  const [activeCandidate, setActiveCandidate] = useState<Candidate | null>(null);
  const [nearbyMembers, setNearbyMembers] = useState<Candidate[]>([]);

  useEffect(() => {
    void refreshNearby();
  }, [profile]);

  async function refreshNearby() {
    const members = await appServices.nearby.list(profile);
    setNearbyMembers(members);
  }

  async function startVideo() {
    let session: VideoSession;

    try {
      session = await appServices.video.start(profile);
    } catch {
      Alert.alert('No video matches available', 'There are no visible video matches right now.');
      return;
    }

    setActiveCandidate(session.candidate);
    setInVideo(true);
    setCameraEnabled(session.cameraStartsEnabled);
    setMicrophoneMuted(session.microphoneStartsMuted);
  }

  function endVideo() {
    setInVideo(false);
    setActiveCandidate(null);
    setCameraEnabled(false);
    setMicrophoneMuted(true);
  }

  function reportVideo() {
    if (activeCandidate) {
      void appServices.safety.record({
        source: 'video',
        action: 'report',
        targetId: activeCandidate.id,
        actorId: profile.id
      });
    }
    Alert.alert('Report submitted', 'This video session was sent to moderation.');
    endVideo();
  }

  function blockVideo() {
    if (activeCandidate) {
      void appServices.safety.record({
        source: 'video',
        action: 'block',
        targetId: activeCandidate.id,
        actorId: profile.id
      });
    }
    Alert.alert('Member blocked', 'This member will not appear for you again.');
    void refreshNearby();
    endVideo();
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

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Video + Nearby"
        subtitle={`${profile.nickname}, video is optional. Nearby discovery has no chat actions.`}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.videoPanel}>
          <View style={styles.videoCanvas}>
            {inVideo && activeCandidate ? (
              <>
                <View style={[styles.videoAvatar, { backgroundColor: activeCandidate.avatarColor }]}>
                  <AppText style={styles.videoInitial}>
                    {activeCandidate.nickname.charAt(0)}
                  </AppText>
                </View>
                <AppText style={styles.videoTitle}>Anonymous video match</AppText>
                <AppText style={styles.videoCopy}>
                  Camera starts off. Turn it on only when you feel ready.
                </AppText>
              </>
            ) : (
              <>
                <Ionicons name="videocam-outline" size={54} color={colors.accent} />
                <AppText style={styles.videoTitle}>Start optional video</AppText>
                <AppText style={styles.videoCopy}>
                  Camera and microphone permissions are used only inside video matches.
                </AppText>
              </>
            )}
          </View>

          {inVideo ? (
            <View style={styles.videoControls}>
              <PrimaryButton
                label={cameraEnabled ? 'Camera On' : 'Camera Off'}
                icon={cameraEnabled ? 'videocam-outline' : 'videocam-off-outline'}
                variant="secondary"
                onPress={() => setCameraEnabled((value) => !value)}
                style={styles.videoControl}
              />
              <PrimaryButton
                label={microphoneMuted ? 'Muted' : 'Mic On'}
                icon={microphoneMuted ? 'mic-off-outline' : 'mic-outline'}
                variant="secondary"
                onPress={() => setMicrophoneMuted((value) => !value)}
                style={styles.videoControl}
              />
              <PrimaryButton
                label="Leave"
                icon="exit-outline"
                variant="danger"
                onPress={endVideo}
                style={styles.videoControl}
              />
              <PressableScale accessibilityRole="button" onPress={blockVideo} style={styles.reportButton}>
                <Ionicons name="ban-outline" size={20} color={colors.danger} />
              </PressableScale>
              <PressableScale accessibilityRole="button" onPress={reportVideo} style={styles.reportButton}>
                <Ionicons name="flag-outline" size={20} color={colors.danger} />
              </PressableScale>
            </View>
          ) : (
            <PrimaryButton label="Find Video Match" icon="videocam-outline" onPress={startVideo} />
          )}
        </View>

        <View style={styles.nearbyHeader}>
          <View>
            <AppText style={styles.nearbyTitle}>Nearby members</AppText>
            <AppText style={styles.nearbySubtitle}>Distance only. No map pins, no live tracking.</AppText>
          </View>
          <View style={styles.locationPill}>
            <Ionicons name="location-outline" size={16} color={colors.accent} />
            <AppText style={styles.locationText}>On</AppText>
          </View>
        </View>

        {nearbyMembers.map((member) => (
            <View key={member.id} style={styles.memberCard}>
              <View style={[styles.memberAvatar, { backgroundColor: member.avatarColor }]}>
                <AppText style={styles.memberInitial}>{member.nickname.charAt(0)}</AppText>
              </View>
              <View style={styles.memberInfo}>
                <AppText style={styles.memberName}>Anonymous member, {member.age}</AppText>
                <AppText style={styles.memberMeta}>
                  {member.distanceMiles.toFixed(1)} miles away • {member.interests.join(', ')}
                </AppText>
              </View>
              <View style={styles.nearbyActions}>
                <PressableScale
                  accessibilityRole="button"
                  onPress={() => Alert.alert('Profile preview', member.prompt)}
                  style={styles.profileButton}
                >
                  <Ionicons name="person-outline" size={19} color={colors.ink} />
                </PressableScale>
                <PressableScale
                  accessibilityRole="button"
                  onPress={() => handleNearbySafety('report', member)}
                  style={styles.profileButton}
                >
                  <Ionicons name="flag-outline" size={18} color={colors.danger} />
                </PressableScale>
                <PressableScale
                  accessibilityRole="button"
                  onPress={() => handleNearbySafety('block', member)}
                  style={styles.profileButton}
                >
                  <Ionicons name="ban-outline" size={18} color={colors.danger} />
                </PressableScale>
              </View>
            </View>
          ))}

        <View style={styles.noChatCard}>
          <Ionicons name="chatbubble-ellipses-outline" size={21} color={colors.muted} />
          <AppText style={styles.noChatText}>
            This tab intentionally has no chat, intro messages, or chat requests.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 28
  },
  videoPanel: {
    gap: 12
  },
  videoCanvas: {
    minHeight: 260,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    gap: 10,
    backgroundColor: colors.ink
  },
  videoAvatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: 'center',
    justifyContent: 'center'
  },
  videoInitial: {
    fontSize: 36,
    fontWeight: '900'
  },
  videoTitle: {
    color: colors.surface,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center'
  },
  videoCopy: {
    color: '#DADBD6',
    textAlign: 'center'
  },
  videoControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center'
  },
  videoControl: {
    flex: 1
  },
  reportButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F6DADD'
  },
  nearbyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12
  },
  nearbyTitle: {
    fontSize: 21,
    fontWeight: '900'
  },
  nearbySubtitle: {
    color: colors.muted
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.accentSoft
  },
  locationText: {
    fontWeight: '900',
    color: colors.accent
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  memberInitial: {
    fontWeight: '900',
    fontSize: 19
  },
  memberInfo: {
    flex: 1
  },
  memberName: {
    fontWeight: '900'
  },
  memberMeta: {
    color: colors.muted,
    fontSize: 13
  },
  profileButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted
  },
  nearbyActions: {
    flexDirection: 'row',
    gap: 6
  },
  noChatCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    padding: 14,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted
  },
  noChatText: {
    flex: 1,
    color: colors.muted,
    fontWeight: '700'
  }
});
