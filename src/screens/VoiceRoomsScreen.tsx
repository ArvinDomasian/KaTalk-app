import React, { useEffect, useState } from 'react';
import { Alert, ImageBackground, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from '../components/PrimaryButton';
import { AppText } from '../components/AppText';
import { PressableScale } from '../components/PressableScale';
import { candidates } from '../data/mockData';
import { appServices } from '../services/localAppServices';
import { colors } from '../theme';
import type { UserProfile, VoiceRoom } from '../types';

type Props = {
  profile: UserProfile;
};

export function VoiceRoomsScreen({ profile }: Props) {
  const [rooms, setRooms] = useState<VoiceRoom[]>([]);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    void appServices.rooms.list().then(setRooms);
  }, []);

  function toggleJoin(roomId: string) {
    setRooms((current) =>
      current.map((room) => {
        if (room.id !== roomId) {
          return room;
        }

        const isJoining = !room.isJoined;
        return {
          ...room,
          isJoined: isJoining,
          participants: room.participants + (isJoining ? 1 : -1)
        };
      })
    );
  }

  function reportRoom(room: VoiceRoom) {
    void appServices.safety.record({
      source: 'voice_room',
      action: 'report',
      targetId: room.id,
      actorId: profile.id
    });
    Alert.alert('Report submitted', `${room.title} was sent to the moderation queue.`);
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <ImageBackground
          source={{ uri: candidates[2].photoUrl }}
          imageStyle={styles.heroImage}
          style={styles.hero}
        >
          <View style={styles.heroShade} />
          <View style={styles.heroTop}>
            <PressableScale accessibilityRole="button" style={styles.glassButton}>
              <Ionicons name="arrow-back" size={20} color={colors.onAccent} />
            </PressableScale>
            <View style={styles.locationPill}>
              <AppText style={styles.locationText}>Los Angeles, CA</AppText>
              <Ionicons name="location" size={14} color={colors.ink} />
            </View>
          </View>

          <View style={styles.heroSideActions}>
            <PressableScale accessibilityRole="button" style={styles.sideIcon}>
              <Ionicons name="heart" size={20} color={colors.onAccent} />
            </PressableScale>
            <PressableScale accessibilityRole="button" style={styles.sideIcon}>
              <Ionicons name="person" size={20} color={colors.onAccent} />
            </PressableScale>
            <PressableScale accessibilityRole="button" style={styles.sideIcon}>
              <Ionicons name="chatbubble" size={19} color={colors.onAccent} />
            </PressableScale>
          </View>

          <View style={styles.heroBottom}>
            <AppText style={styles.distanceText}>3.5 Km Away</AppText>
            <AppText style={styles.heroName}>Nearby Voice Rooms</AppText>
            <AppText style={styles.heroCopy}>
              Join low-pressure group conversations whenever you feel ready.
            </AppText>
          </View>
        </ImageBackground>

        <View style={styles.notice}>
          <Ionicons name="mic-outline" size={22} color={colors.accent} />
          <AppText style={styles.noticeText}>
            Microphone access is requested only when joining or speaking in a room.
          </AppText>
        </View>

        {rooms.map((room) => (
          <View key={room.id} style={styles.roomCard}>
            <View style={styles.roomTop}>
              <View style={styles.moodPill}>
                <AppText style={styles.moodText}>{room.mood}</AppText>
              </View>
              <AppText style={styles.count}>{room.participants} listening</AppText>
            </View>
            <AppText style={styles.roomTitle}>{room.title}</AppText>
            <AppText style={styles.host}>Hosted by {room.host}</AppText>

            {room.isJoined ? (
              <View style={styles.livePanel}>
                <View style={styles.liveDot} />
                <AppText style={styles.liveText}>You are in this room</AppText>
              </View>
            ) : null}

            <View style={styles.controls}>
              <PrimaryButton
                label={room.isJoined ? 'Leave' : 'Join'}
                icon={room.isJoined ? 'exit-outline' : 'enter-outline'}
                onPress={() => toggleJoin(room.id)}
                variant={room.isJoined ? 'secondary' : 'primary'}
                style={styles.controlButton}
              />
              <PrimaryButton
                label={muted ? 'Muted' : 'Mute'}
                icon={muted ? 'mic-off-outline' : 'mic-outline'}
                onPress={() => setMuted((value) => !value)}
                variant="secondary"
                disabled={!room.isJoined}
                style={styles.controlButton}
              />
              <PressableScale
                accessibilityRole="button"
                onPress={() => reportRoom(room)}
                style={styles.iconButton}
              >
                <Ionicons name="flag-outline" size={20} color={colors.danger} />
              </PressableScale>
            </View>
          </View>
        ))}

        <View style={styles.policyCard}>
          <AppText style={styles.policyTitle}>Room safety rules</AppText>
          <AppText style={styles.policyText}>
            Hosts can remove abusive users. Blocks apply across rooms, nearby discovery, message
            matching, and video.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 28
  },
  hero: {
    minHeight: 510,
    borderRadius: 34,
    overflow: 'hidden',
    justifyContent: 'space-between',
    padding: 18,
    backgroundColor: colors.cardDark
  },
  heroImage: {
    borderRadius: 34
  },
  heroShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)'
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  glassButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.34)'
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    minHeight: 38,
    borderRadius: 19,
    backgroundColor: colors.surface
  },
  locationText: {
    fontWeight: '800',
    fontSize: 12
  },
  heroSideActions: {
    alignSelf: 'flex-end',
    gap: 18
  },
  sideIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.24)'
  },
  heroBottom: {
    gap: 6,
    maxWidth: '92%'
  },
  distanceText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '800'
  },
  heroName: {
    color: colors.onAccent,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '900'
  },
  heroCopy: {
    color: colors.onAccent,
    fontSize: 13
  },
  notice: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: 8
  },
  noticeText: {
    flex: 1,
    fontWeight: '700',
    color: colors.ink
  },
  roomCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 10
  },
  roomTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  moodPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.sky
  },
  moodText: {
    fontWeight: '900',
    fontSize: 12
  },
  count: {
    color: colors.muted,
    fontSize: 13
  },
  roomTitle: {
    fontSize: 20,
    fontWeight: '900'
  },
  host: {
    color: colors.muted
  },
  livePanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted
  },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.success
  },
  liveText: {
    fontWeight: '800'
  },
  controls: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center'
  },
  controlButton: {
    flex: 1
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft
  },
  policyCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 6
  },
  policyTitle: {
    fontSize: 17,
    fontWeight: '900'
  },
  policyText: {
    color: colors.muted
  }
});
