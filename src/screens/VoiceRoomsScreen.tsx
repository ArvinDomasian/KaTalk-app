import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from '../components/PrimaryButton';
import { AppText } from '../components/AppText';
import { MemberAvatar } from '../components/MemberAvatar';
import { PressableScale } from '../components/PressableScale';
import { VoiceRoomStage } from '../components/VoiceRoomStage';
import { appServices } from '../services/localAppServices';
import { avatarColorForId } from '../services/registeredUserService';
import { colors } from '../theme';
import type { UserProfile, VoiceRoom } from '../types';

type Props = {
  profile: UserProfile;
  darkMode?: boolean;
};

export function VoiceRoomsScreen({ profile, darkMode = false }: Props) {
  const [rooms, setRooms] = useState<VoiceRoom[]>([]);
  const [muted, setMuted] = useState(true);
  const [handRaised, setHandRaised] = useState(false);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [roomLoadNotice, setRoomLoadNotice] = useState<string | null>(null);

  useEffect(() => {
    void refreshRooms();
  }, [profile.id]);

  const activeRoom = rooms.find((room) => room.isJoined) ?? null;

  async function refreshRooms() {
    setIsLoadingRooms(true);
    setRoomLoadNotice(null);

    try {
      setRooms(await appServices.rooms.list(profile));
    } catch {
      setRooms([]);
      setRoomLoadNotice('Registered voice members could not load yet. Check your backend setup and connection.');
    } finally {
      setIsLoadingRooms(false);
    }
  }

  function joinRoom(roomId: string) {
    setRooms((current) =>
      current.map((room) => ({
        ...room,
        isJoined: room.id === roomId,
        participants:
          room.id === roomId
            ? room.participants + (room.isJoined ? 0 : 1)
            : room.participants - (room.isJoined ? 1 : 0)
      }))
    );
    setMuted(true);
    setHandRaised(false);
  }

  function leaveRoom(roomId: string) {
    setRooms((current) =>
      current.map((room) =>
        room.id === roomId
          ? {
              ...room,
              isJoined: false,
              participants: Math.max(0, room.participants - 1)
            }
          : room
      )
    );
    setMuted(true);
    setHandRaised(false);
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

  function blockHost(room: VoiceRoom) {
    void appServices.safety.record({
      source: 'voice_room',
      action: 'block',
      targetId: room.hostId ?? `${room.id}:host:${room.host}`,
      actorId: profile.id
    });
    Alert.alert('Host blocked', `${room.host} will be hidden from future room interactions.`);
  }

  if (activeRoom) {
    return (
      <VoiceRoomStage
        room={activeRoom}
        profile={profile}
        darkMode={darkMode}
        muted={muted}
        handRaised={handRaised}
        onMutedChange={setMuted}
        onHandRaisedChange={setHandRaised}
        onLeave={() => leaveRoom(activeRoom.id)}
        onReportRoom={() => reportRoom(activeRoom)}
        onBlockHost={() => blockHost(activeRoom)}
      />
    );
  }

  return (
    <View style={[styles.root, darkMode && styles.rootDark]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <PressableScale accessibilityRole="button" style={styles.glassButton}>
              <Ionicons name="arrow-back" size={20} color={colors.onAccent} />
            </PressableScale>
            <View style={styles.locationPill}>
              <AppText style={styles.locationText}>Registered members</AppText>
              <Ionicons name="people" size={14} color={colors.ink} />
            </View>
          </View>

          <View style={styles.heroMemberRow}>
            {rooms.slice(0, 4).map((room) => (
              <MemberAvatar
                key={room.id}
                name={room.host}
                color={avatarColorForId(room.hostId ?? room.id)}
                size={58}
                borderColor="rgba(255,255,255,0.6)"
              />
            ))}
            {rooms.length === 0 ? (
              <View style={styles.heroEmptyAvatar}>
                <Ionicons name="mic-outline" size={28} color={colors.onAccent} />
              </View>
            ) : null}
          </View>

          <View style={styles.heroBottom}>
            <AppText style={styles.distanceText}>{rooms.length} registered voice rooms</AppText>
            <AppText style={styles.heroName}>Real Member Voice Rooms</AppText>
            <AppText style={styles.heroCopy}>
              Join low-pressure group conversations hosted by registered KaTalk members.
            </AppText>
          </View>
        </View>

        <View style={[styles.notice, darkMode && styles.cardDark]}>
          <Ionicons name="mic-outline" size={22} color={colors.accent} />
            <AppText style={[styles.noticeText, darkMode && styles.textOnDark]}>
            Android/iOS builds join a real Agora voice channel. Browser preview shows the same
            room controls without live audio.
          </AppText>
        </View>

        {isLoadingRooms ? (
          <View style={[styles.emptyState, darkMode && styles.cardDark]}>
            <ActivityIndicator size="small" color={colors.accent} />
            <AppText style={[styles.emptyStateText, darkMode && styles.mutedOnDark]}>
              Loading real registered voice rooms...
            </AppText>
          </View>
        ) : null}
        {!isLoadingRooms && roomLoadNotice ? (
          <View style={[styles.emptyState, darkMode && styles.cardDark]}>
            <AppText style={[styles.emptyStateText, darkMode && styles.mutedOnDark]}>
              {roomLoadNotice}
            </AppText>
          </View>
        ) : null}
        {!isLoadingRooms && !roomLoadNotice && rooms.length === 0 ? (
          <View style={[styles.emptyState, darkMode && styles.cardDark]}>
            <AppText style={[styles.emptyStateTitle, darkMode && styles.textOnDark]}>
              No real voice rooms yet
            </AppText>
            <AppText style={[styles.emptyStateText, darkMode && styles.mutedOnDark]}>
              Voice rooms will appear here after other registered users complete their profiles.
            </AppText>
          </View>
        ) : null}

        {rooms.map((room) => (
          <View key={room.id} style={[styles.roomCard, darkMode && styles.cardDark]}>
            <View style={styles.roomTop}>
              <View style={styles.moodPill}>
                <AppText style={styles.moodText}>{room.mood}</AppText>
              </View>
              <AppText style={styles.count}>{room.participants} registered</AppText>
            </View>
            <AppText style={[styles.roomTitle, darkMode && styles.textOnDark]}>{room.title}</AppText>
            <AppText style={styles.host}>Hosted by {room.host}</AppText>
            <AppText style={[styles.roomTopic, darkMode && styles.mutedOnDark]}>{room.topic}</AppText>

            <View style={styles.speakerRow}>
              {room.speakers.slice(0, 4).map((speaker, index) => (
                <View key={`${room.id}-${speaker}`} style={[styles.speakerChip, darkMode && styles.softSurfaceDark]}>
                  <View style={[styles.speakerDot, index === 0 && styles.hostDot]} />
                  <AppText style={[styles.speakerText, darkMode && styles.textOnDark]}>
                    {speaker}
                  </AppText>
                </View>
              ))}
            </View>

            {room.isJoined ? (
              <View style={[styles.livePanel, darkMode && styles.softSurfaceDark]}>
                <View style={styles.liveDot} />
                <AppText style={[styles.liveText, darkMode && styles.textOnDark]}>You are in this room</AppText>
              </View>
            ) : null}

            <View style={styles.controls}>
              <PrimaryButton
                label="Join room"
                icon="enter-outline"
                onPress={() => joinRoom(room.id)}
                variant="primary"
                style={styles.controlButton}
              />
              <PrimaryButton
                label="Preview"
                icon="people-outline"
                onPress={() =>
                  Alert.alert(room.title, `${room.topic}\n\nSpeakers: ${room.speakers.join(', ')}`)
                }
                variant="secondary"
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

        <View style={[styles.policyCard, darkMode && styles.cardDark]}>
          <AppText style={[styles.policyTitle, darkMode && styles.textOnDark]}>Room safety rules</AppText>
          <AppText style={[styles.policyText, darkMode && styles.mutedOnDark]}>
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
    gap: 12,
    paddingBottom: 28
  },
  hero: {
    minHeight: 280,
    borderRadius: 24,
    overflow: 'hidden',
    justifyContent: 'space-between',
    padding: 18,
    backgroundColor: colors.cardDark
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
  heroMemberRow: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  heroEmptyAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
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
  emptyState: {
    minHeight: 118,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.surface
  },
  emptyStateTitle: {
    color: colors.ink,
    fontWeight: '900',
    textAlign: 'center'
  },
  emptyStateText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    textAlign: 'center'
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
  roomTopic: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700'
  },
  speakerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  speakerChip: {
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceMuted
  },
  speakerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent
  },
  hostDot: {
    backgroundColor: '#8B6AF2'
  },
  speakerText: {
    fontSize: 11,
    fontWeight: '900'
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
