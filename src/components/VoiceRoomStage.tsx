import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { colors } from '../theme';
import type { UserProfile, VoiceRoom } from '../types';

type Props = {
  room: VoiceRoom;
  profile: UserProfile;
  darkMode: boolean;
  muted: boolean;
  handRaised: boolean;
  onMutedChange: (muted: boolean) => void;
  onHandRaisedChange: (raised: boolean) => void;
  onLeave: () => void;
  onReportRoom: () => void;
  onBlockHost: () => void;
};

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function VoiceRoomStage({
  room,
  profile,
  darkMode,
  muted,
  handRaised,
  onMutedChange,
  onHandRaisedChange,
  onLeave,
  onReportRoom,
  onBlockHost
}: Props) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentSpeakers = handRaised
    ? [...room.speakers, profile.nickname]
    : room.speakers;

  return (
    <View style={[styles.root, darkMode && styles.rootDark]}>
      <View style={styles.header}>
        <PressableScale accessibilityRole="button" onPress={onLeave} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color={colors.onAccent} />
        </PressableScale>
        <View style={styles.headerCopy}>
          <AppText style={styles.roomTitle}>{room.title}</AppText>
          <AppText style={styles.roomMeta}>
            Browser preview room - {formatDuration(seconds)}
          </AppText>
        </View>
        <PressableScale accessibilityRole="button" onPress={onReportRoom} style={styles.reportButton}>
          <Ionicons name="flag-outline" size={19} color={colors.danger} />
        </PressableScale>
      </View>

      <View style={styles.stageCard}>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <AppText style={styles.liveBadgeText}>Live room preview</AppText>
        </View>
        <AppText style={styles.topic}>{room.topic}</AppText>
        <AppText style={styles.previewCopy}>
          Real microphone room audio starts inside the installed Android or iOS app. This web view
          lets you test the room controls and layout.
        </AppText>
      </View>

      <View style={styles.section}>
        <AppText style={styles.sectionTitle}>Speakers</AppText>
        <View style={styles.speakerGrid}>
          {currentSpeakers.map((speaker, index) => (
            <View key={`${speaker}-${index}`} style={styles.speakerTile}>
              <View style={[styles.speakerAvatar, index === 0 && styles.hostAvatar]}>
                <AppText style={styles.speakerInitial}>{speaker.slice(0, 1).toUpperCase()}</AppText>
              </View>
              <AppText style={styles.speakerName}>{speaker}</AppText>
              <AppText style={styles.speakerRole}>{index === 0 ? 'Host' : 'Speaker'}</AppText>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.controls}>
        <RoomControl
          icon={muted ? 'mic-off' : 'mic'}
          label={muted ? 'Muted' : 'Speaking'}
          active={!muted}
          onPress={() => onMutedChange(!muted)}
        />
        <RoomControl
          icon={handRaised ? 'hand-left' : 'hand-left-outline'}
          label={handRaised ? 'Hand up' : 'Raise hand'}
          active={handRaised}
          onPress={() => onHandRaisedChange(!handRaised)}
        />
        <RoomControl icon="ban-outline" label="Block host" danger onPress={onBlockHost} />
        <RoomControl icon="call" label="Leave" danger onPress={onLeave} />
      </View>
    </View>
  );
}

function RoomControl({
  icon,
  label,
  active,
  danger,
  onPress
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.controlItem}>
      <PressableScale
        accessibilityRole="button"
        onPress={onPress}
        style={[
          styles.controlButton,
          active && styles.controlButtonActive,
          danger && styles.controlButtonDanger
        ]}
      >
        <Ionicons
          name={icon}
          size={22}
          color={active || danger ? colors.onAccent : colors.ink}
          style={icon === 'call' ? styles.leaveIcon : undefined}
        />
      </PressableScale>
      <AppText style={styles.controlLabel}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 16,
    gap: 16,
    backgroundColor: '#101217'
  },
  rootDark: {
    backgroundColor: '#101217'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)'
  },
  headerCopy: {
    flex: 1
  },
  roomTitle: {
    color: colors.onAccent,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '900'
  },
  roomMeta: {
    marginTop: 3,
    color: '#B9C1CE',
    fontWeight: '700'
  },
  reportButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft
  },
  stageCard: {
    borderRadius: 18,
    padding: 16,
    gap: 10,
    backgroundColor: '#171A22',
    borderWidth: 1,
    borderColor: '#2A2E38'
  },
  liveBadge: {
    alignSelf: 'flex-start',
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(46, 184, 114, 0.16)'
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success
  },
  liveBadgeText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '900'
  },
  topic: {
    color: colors.onAccent,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900'
  },
  previewCopy: {
    color: '#B9C1CE',
    lineHeight: 20,
    fontWeight: '700'
  },
  section: {
    gap: 10
  },
  sectionTitle: {
    color: colors.onAccent,
    fontSize: 17,
    fontWeight: '900'
  },
  speakerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  speakerTile: {
    width: '30%',
    minWidth: 92,
    alignItems: 'center',
    gap: 5,
    borderRadius: 16,
    padding: 10,
    backgroundColor: '#171A22',
    borderWidth: 1,
    borderColor: '#2A2E38'
  },
  speakerAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  hostAvatar: {
    backgroundColor: '#8B6AF2'
  },
  speakerInitial: {
    color: colors.onAccent,
    fontSize: 20,
    fontWeight: '900'
  },
  speakerName: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center'
  },
  speakerRole: {
    color: '#B9C1CE',
    fontSize: 10,
    fontWeight: '700'
  },
  controls: {
    marginTop: 'auto',
    minHeight: 96,
    borderRadius: 22,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(0,0,0,0.28)'
  },
  controlItem: {
    width: 76,
    alignItems: 'center',
    gap: 6
  },
  controlButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface
  },
  controlButtonActive: {
    backgroundColor: colors.accent
  },
  controlButtonDanger: {
    backgroundColor: colors.danger
  },
  leaveIcon: {
    transform: [{ rotate: '135deg' }]
  },
  controlLabel: {
    color: colors.onAccent,
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center'
  }
});
