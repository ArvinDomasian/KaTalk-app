import React, { useEffect, useState } from 'react';
import { Alert, ImageBackground, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/PrimaryButton';
import { PressableScale } from '../components/PressableScale';
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
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <AppText style={styles.screenTitle}>Nearby you</AppText>
          <Ionicons name="ellipsis-horizontal" size={24} color={colors.muted} />
        </View>

        <View style={styles.videoPanel}>
          <View style={styles.videoText}>
            <AppText style={styles.videoTitle}>
              {inVideo && activeCandidate ? 'Video match active' : 'Optional video match'}
            </AppText>
            <AppText style={styles.videoCopy}>
              {inVideo && activeCandidate
                ? 'Camera starts off. You control reveal, mute, report, and leave.'
                : 'Start a one-to-one video match without opening chat.'}
            </AppText>
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

        <View style={styles.memberGrid}>
          {nearbyMembers.map((member) => (
            <View key={member.id} style={styles.memberTile}>
              <ImageBackground
                source={{ uri: member.photoUrl }}
                imageStyle={styles.memberImage}
                style={styles.memberPhoto}
              >
                <View style={styles.distanceBadge}>
                  <AppText style={styles.distanceBadgeText}>
                    {member.distanceMiles.toFixed(1)} Km
                  </AppText>
                </View>
                <View style={styles.photoActions}>
                  <PressableScale
                    accessibilityRole="button"
                    onPress={() => handleNearbySafety('report', member)}
                    style={styles.photoIcon}
                  >
                    <Ionicons name="flag" size={15} color={colors.onAccent} />
                  </PressableScale>
                  <PressableScale
                    accessibilityRole="button"
                    onPress={() => handleNearbySafety('block', member)}
                    style={styles.photoIcon}
                  >
                    <Ionicons name="ban" size={15} color={colors.onAccent} />
                  </PressableScale>
                </View>
                <AppText style={styles.photoLocation}>Los Angeles, CA</AppText>
              </ImageBackground>
              <View style={styles.memberCaption}>
                <AppText style={styles.memberName}>{member.nickname}, {member.age}</AppText>
                <PressableScale
                  accessibilityRole="button"
                  onPress={() => Alert.alert('Profile preview', member.prompt)}
                  style={styles.profileButton}
                >
                  <Ionicons name="person-outline" size={16} color={colors.ink} />
                </PressableScale>
              </View>
            </View>
          ))}
        </View>

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
    flex: 1,
    backgroundColor: colors.surface
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
    gap: 12,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line
  },
  videoText: {
    gap: 4
  },
  videoTitle: {
    fontSize: 18,
    fontWeight: '900'
  },
  videoCopy: {
    color: colors.muted
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
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft
  },
  memberGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  memberTile: {
    width: '48%',
    borderRadius: 16,
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
  memberImage: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16
  },
  distanceBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    minHeight: 26,
    borderRadius: 10,
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
  profileButton: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted
  },
  noChatCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted
  },
  noChatText: {
    flex: 1,
    color: colors.muted,
    fontWeight: '700'
  }
});
