import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from '../components/PrimaryButton';
import { AppText } from '../components/AppText';
import { MemberAvatar } from '../components/MemberAvatar';
import { PressableScale } from '../components/PressableScale';
import { VoiceRoomStage } from '../components/VoiceRoomStage';
import { appServices } from '../services/localAppServices';
import { avatarColorForId, registeredMemberErrorMessage } from '../services/registeredUserService';
import { colors } from '../theme';
import type { SavedMatch } from '../services/contracts';
import type { UserProfile, VoiceRoom } from '../types';

type Props = {
  profile: UserProfile;
  darkMode?: boolean;
  onOpenMessageMatch?: () => void;
};

export function VoiceRoomsScreen({ profile, darkMode = false, onOpenMessageMatch }: Props) {
  const [rooms, setRooms] = useState<VoiceRoom[]>([]);
  const [savedConnections, setSavedConnections] = useState<SavedMatch[]>([]);
  const [muted, setMuted] = useState(true);
  const [handRaised, setHandRaised] = useState(false);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [roomLoadNotice, setRoomLoadNotice] = useState<string | null>(null);

  useEffect(() => {
    void refreshConnections();
  }, [profile.id]);

  const activeRoom = rooms.find((room) => room.isJoined) ?? null;

  async function refreshConnections() {
    setIsLoadingRooms(true);
    setRoomLoadNotice(null);

    const [roomResult, savedResult] = await Promise.allSettled([
      appServices.rooms.list(profile),
      appServices.savedMatches.list(profile)
    ]);

    if (roomResult.status === 'fulfilled') {
      setRooms(roomResult.value);
    } else {
      setRooms([]);
      setRoomLoadNotice(registeredMemberErrorMessage(roomResult.reason));
    }

    if (savedResult.status === 'fulfilled') {
      setSavedConnections(savedResult.value);
    } else {
      setSavedConnections([]);
    }

    setIsLoadingRooms(false);
  }

  function openSavedConnection(match: SavedMatch) {
    if (onOpenMessageMatch) {
      onOpenMessageMatch();
      return;
    }

    Alert.alert(
      'Saved conversation',
      `${match.candidate.nickname}'s saved chat is available from the Home tab saved matches area.`
    );
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
        <View style={styles.topBar}>
          <View style={styles.titleBlock}>
            <AppText style={[styles.screenTitle, darkMode && styles.textOnDark]}>
              Chat & Connection
            </AppText>
            <AppText style={[styles.screenSubtitle, darkMode && styles.mutedOnDark]}>
              Saved chats and live voice spaces from real KaTalk members.
            </AppText>
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Refresh chat and connection list"
            onPress={() => void refreshConnections()}
            style={styles.refreshButton}
          >
            <Ionicons name="refresh" size={18} color={colors.onAccent} />
          </PressableScale>
        </View>

        <View style={[styles.connectionHero, darkMode && styles.cardDark]}>
          <View style={styles.connectionHeroTop}>
            <View style={styles.avatarStack}>
              {savedConnections.slice(0, 3).map((match, index) => (
                <View key={match.id} style={[styles.avatarStackItem, { left: index * 32 }]}>
                  <MemberAvatar
                    name={match.candidate.nickname}
                    photoUrl={match.candidate.photoUrl}
                    color={match.candidate.avatarColor}
                    size={54}
                    borderColor={colors.background}
                  />
                </View>
              ))}
              {savedConnections.length === 0
                ? rooms.slice(0, 3).map((room, index) => (
                    <View key={room.id} style={[styles.avatarStackItem, { left: index * 32 }]}>
                      <MemberAvatar
                        name={room.host}
                        color={avatarColorForId(room.hostId ?? room.id)}
                        size={54}
                        borderColor={colors.background}
                      />
                    </View>
                  ))
                : null}
              {savedConnections.length === 0 && rooms.length === 0 ? (
                <View style={styles.heroEmptyAvatar}>
                  <Ionicons name="chatbubble-ellipses" size={28} color={colors.onAccent} />
                </View>
              ) : null}
            </View>
            <View style={styles.activeBadge}>
              <View style={styles.activeDot} />
              <AppText style={styles.activeBadgeText}>
                {savedConnections.length + rooms.length} active
              </AppText>
            </View>
          </View>

          <View style={styles.connectionHeroBottom}>
            <AppText style={styles.connectionHeroTitle}>Real conversations</AppText>
            <AppText style={styles.connectionHeroCopy}>
              Open saved matches from Home, or join a live room when you want a low-pressure group conversation.
            </AppText>
          </View>

          <View style={styles.connectionStats}>
            <View style={styles.connectionStat}>
              <AppText style={styles.connectionStatValue}>{savedConnections.length}</AppText>
              <AppText style={styles.connectionStatLabel}>Saved</AppText>
            </View>
            <View style={styles.connectionStat}>
              <AppText style={styles.connectionStatValue}>{rooms.length}</AppText>
              <AppText style={styles.connectionStatLabel}>Rooms</AppText>
            </View>
            <View style={styles.connectionStat}>
              <AppText style={styles.connectionStatValue}>
                {rooms.reduce((total, room) => total + room.participants, 0)}
              </AppText>
              <AppText style={styles.connectionStatLabel}>Members</AppText>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View style={styles.titleBlock}>
            <AppText style={[styles.sectionTitle, darkMode && styles.textOnDark]}>
              Saved conversations
            </AppText>
            <AppText style={[styles.sectionMeta, darkMode && styles.mutedOnDark]}>
              Matches both people saved before the 2-minute timer ended.
            </AppText>
          </View>
        </View>

        {savedConnections.length === 0 ? (
          <View style={[styles.emptyState, darkMode && styles.cardDark]}>
            <AppText style={[styles.emptyStateTitle, darkMode && styles.textOnDark]}>
              No saved conversations yet
            </AppText>
            <AppText style={[styles.emptyStateText, darkMode && styles.mutedOnDark]}>
              When both people save a 2-minute match, it appears here.
            </AppText>
          </View>
        ) : null}

        {savedConnections.map((match) => (
          <PressableScale
            key={match.id}
            accessibilityRole="button"
            accessibilityLabel={`Open saved conversation with ${match.candidate.nickname}`}
            onPress={() => openSavedConnection(match)}
            style={[styles.savedConnectionCard, darkMode && styles.cardDark]}
          >
            <MemberAvatar
              name={match.candidate.nickname}
              photoUrl={match.candidate.photoUrl}
              color={match.candidate.avatarColor}
              size={56}
              borderColor={colors.accent}
            />
            <View style={styles.savedConnectionCopy}>
              <AppText style={[styles.savedConnectionName, darkMode && styles.textOnDark]}>
                {match.candidate.nickname}
              </AppText>
              <AppText style={[styles.savedConnectionMeta, darkMode && styles.mutedOnDark]} numberOfLines={1}>
                Saved {match.createdAt.toLocaleDateString()} - Tap to open chat area
              </AppText>
            </View>
            <View style={styles.savedConnectionAction}>
              <Ionicons name="chatbubble-ellipses" size={18} color={colors.onAccent} />
            </View>
          </PressableScale>
        ))}

        <View style={styles.sectionHeader}>
          <View style={styles.titleBlock}>
            <AppText style={[styles.sectionTitle, darkMode && styles.textOnDark]}>
              Live voice rooms
            </AppText>
            <AppText style={[styles.sectionMeta, darkMode && styles.mutedOnDark]}>
              Join rooms hosted by registered members.
            </AppText>
          </View>
          <View style={styles.roomCountPill}>
            <AppText style={styles.roomCountPillText}>{rooms.length}</AppText>
          </View>
        </View>

        {isLoadingRooms ? (
          <View style={[styles.emptyState, darkMode && styles.cardDark]}>
            <ActivityIndicator size="small" color={colors.accent} />
            <AppText style={[styles.emptyStateText, darkMode && styles.mutedOnDark]}>
              Loading your real member connections...
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
              No live rooms yet
            </AppText>
            <AppText style={[styles.emptyStateText, darkMode && styles.mutedOnDark]}>
              Registered member rooms will appear here when people are available.
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
          <AppText style={[styles.policyTitle, darkMode && styles.textOnDark]}>Connection safety</AppText>
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
    backgroundColor: colors.background
  },
  textOnDark: {
    color: colors.onAccent
  },
  mutedOnDark: {
    color: colors.muted
  },
  cardDark: {
    borderColor: '#332241',
    backgroundColor: colors.surface
  },
  softSurfaceDark: {
    backgroundColor: colors.surfaceMuted
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 28
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  titleBlock: {
    flex: 1,
    minWidth: 0
  },
  screenTitle: {
    color: colors.ink,
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '900'
  },
  screenSubtitle: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700'
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  connectionHero: {
    minHeight: 230,
    borderRadius: 26,
    padding: 16,
    gap: 18,
    borderWidth: 1,
    borderColor: '#4A2847',
    backgroundColor: '#120D1E',
    shadowColor: colors.accent,
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5
  },
  connectionHeroTop: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  avatarStack: {
    width: 132,
    height: 58,
    position: 'relative'
  },
  avatarStackItem: {
    position: 'absolute',
    top: 0
  },
  activeBadge: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceMuted
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success
  },
  activeBadgeText: {
    color: colors.onAccent,
    fontSize: 11,
    fontWeight: '900'
  },
  connectionHeroBottom: {
    gap: 7
  },
  connectionHeroTitle: {
    color: colors.onAccent,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '900'
  },
  connectionHeroCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700'
  },
  connectionStats: {
    flexDirection: 'row',
    gap: 10
  },
  connectionStat: {
    flex: 1,
    minHeight: 70,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: colors.surfaceMuted
  },
  connectionStatValue: {
    color: colors.accent,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900'
  },
  connectionStatLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800'
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900'
  },
  sectionMeta: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700'
  },
  roomCountPill: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  roomCountPillText: {
    color: colors.onAccent,
    fontSize: 13,
    fontWeight: '900'
  },
  savedConnectionCard: {
    minHeight: 78,
    borderRadius: 20,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface
  },
  savedConnectionCopy: {
    flex: 1,
    minWidth: 0
  },
  savedConnectionName: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900'
  },
  savedConnectionMeta: {
    marginTop: 3,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  savedConnectionAction: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  hero: {
    minHeight: 280,
    borderRadius: 24,
    overflow: 'hidden',
    justifyContent: 'space-between',
    padding: 18,
    borderWidth: 1,
    borderColor: '#3B1742',
    backgroundColor: '#100B18'
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
    backgroundColor: 'rgba(242,56,166,0.16)'
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    minHeight: 38,
    borderRadius: 19,
    backgroundColor: colors.onAccent
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
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18
  },
  noticeText: {
    flex: 1,
    fontWeight: '700',
    color: colors.ink
  },
  emptyState: {
    minHeight: 118,
    borderRadius: 18,
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
    borderRadius: 20,
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
    borderRadius: 14,
    backgroundColor: colors.accentSoft
  },
  moodText: {
    color: colors.accent,
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
    borderRadius: 16,
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
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft
  },
  policyCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
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
