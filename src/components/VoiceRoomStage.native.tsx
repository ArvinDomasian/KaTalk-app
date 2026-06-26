import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  View,
  type ViewStyle
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import type {
  ConnectionChangedReasonType,
  ConnectionStateType,
  IRtcEngine,
  IRtcEngineEventHandler
} from 'react-native-agora';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { getAgoraJoinCredentials } from '../services/firebaseVideoMatchService';
import { colors } from '../theme';
import type { UserProfile, VoiceRoom } from '../types';

type AgoraModule = typeof import('react-native-agora');

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

type RoomState = 'connecting' | 'live' | 'reconnecting' | 'failed';

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
  const engineRef = useRef<IRtcEngine | null>(null);
  const eventHandlerRef = useRef<IRtcEngineEventHandler | null>(null);
  const mountedRef = useRef(true);
  const [agoraModule, setAgoraModule] = useState<AgoraModule | null>(null);
  const [roomState, setRoomState] = useState<RoomState>('connecting');
  const [remoteUids, setRemoteUids] = useState<number[]>([]);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [seconds, setSeconds] = useState(0);

  const channelName = useMemo(() => `katalk-room-${room.id}`, [room.id]);

  useEffect(() => {
    mountedRef.current = true;

    async function connect() {
      try {
        const permission = await requestRecordingPermissionsAsync();

        if (!permission.granted) {
          throw new Error('Microphone permission is required before joining a voice room.');
        }

        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true
        });

        const credentials = await getAgoraJoinCredentials(channelName);
        const nativeAgora = require('react-native-agora') as AgoraModule;
        const engine = nativeAgora.createAgoraRtcEngine();
        const handler: IRtcEngineEventHandler = {
          onJoinChannelSuccess: () => {
            if (mountedRef.current) {
              setRoomState('live');
            }
          },
          onUserJoined: (_connection, uid) => {
            if (mountedRef.current) {
              setRemoteUids((current) => (current.includes(uid) ? current : [...current, uid]));
            }
          },
          onUserOffline: (_connection, uid) => {
            if (mountedRef.current) {
              setRemoteUids((current) => current.filter((item) => item !== uid));
            }
          },
          onConnectionStateChanged: (
            _connection,
            state: ConnectionStateType,
            _reason: ConnectionChangedReasonType
          ) => {
            if (!mountedRef.current) {
              return;
            }

            if (state === nativeAgora.ConnectionStateType.ConnectionStateReconnecting) {
              setRoomState('reconnecting');
            } else if (state === nativeAgora.ConnectionStateType.ConnectionStateFailed) {
              setRoomState('failed');
            } else if (state === nativeAgora.ConnectionStateType.ConnectionStateConnected) {
              setRoomState('live');
            }
          },
          onError: (errorCode, message) => {
            if (mountedRef.current) {
              setRoomState('failed');
              Alert.alert('Voice room problem', message || `Agora voice error ${errorCode}.`);
            }
          }
        };

        engine.initialize({
          appId: credentials.appId,
          channelProfile: nativeAgora.ChannelProfileType.ChannelProfileCommunication
        });
        engine.registerEventHandler(handler);
        engine.enableAudio();
        engine.muteLocalAudioStream(muted);
        engine.setEnableSpeakerphone(true);

        const joinResult = engine.joinChannel(credentials.token, channelName, credentials.uid, {
          channelProfile: nativeAgora.ChannelProfileType.ChannelProfileCommunication,
          clientRoleType: nativeAgora.ClientRoleType.ClientRoleBroadcaster,
          publishMicrophoneTrack: true,
          autoSubscribeAudio: true,
          enableAudioRecordingOrPlayout: true
        });

        if (joinResult < 0) {
          throw new Error(`Could not join the Agora voice room (${joinResult}).`);
        }

        engineRef.current = engine;
        eventHandlerRef.current = handler;
        setAgoraModule(nativeAgora);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Voice room could not start.';

        if (mountedRef.current) {
          setRoomState('failed');
          Alert.alert('Voice room unavailable', message, [{ text: 'Leave', onPress: onLeave }]);
        }
      }
    }

    void connect();

    return () => {
      mountedRef.current = false;
      const engine = engineRef.current;
      const handler = eventHandlerRef.current;

      if (engine && handler) {
        engine.unregisterEventHandler(handler);
      }

      engine?.leaveChannel();
      engine?.release();
      engineRef.current = null;
      eventHandlerRef.current = null;
    };
  }, [channelName]);

  useEffect(() => {
    engineRef.current?.muteLocalAudioStream(muted);
  }, [muted]);

  useEffect(() => {
    if (roomState !== 'live') {
      return undefined;
    }

    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [roomState]);

  function toggleMute() {
    onMutedChange(!muted);
  }

  function toggleSpeaker() {
    const nextEnabled = !speakerEnabled;
    engineRef.current?.setEnableSpeakerphone(nextEnabled);
    setSpeakerEnabled(nextEnabled);
  }

  const statusText =
    roomState === 'connecting'
      ? 'Connecting live audio'
      : roomState === 'reconnecting'
        ? 'Reconnecting'
        : roomState === 'failed'
          ? 'Connection failed'
          : `Live - ${formatDuration(seconds)}`;

  const currentSpeakers = handRaised ? [...room.speakers, profile.nickname] : room.speakers;
  const listenerCount = Math.max(0, room.participants + remoteUids.length - currentSpeakers.length);

  return (
    <View style={[styles.root, darkMode && styles.rootDark]}>
      <View style={styles.header}>
        <PressableScale accessibilityRole="button" onPress={onLeave} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color={colors.onAccent} />
        </PressableScale>
        <View style={styles.headerCopy}>
          <AppText style={styles.roomTitle}>{room.title}</AppText>
          <View style={styles.statusRow}>
            {roomState === 'live' ? <View style={styles.liveDot} /> : <ActivityIndicator size="small" color={colors.onAccent} />}
            <AppText style={styles.roomMeta}>{statusText}</AppText>
          </View>
        </View>
        <PressableScale accessibilityRole="button" onPress={onReportRoom} style={styles.reportButton}>
          <Ionicons name="flag-outline" size={19} color={colors.danger} />
        </PressableScale>
      </View>

      <View style={styles.topicCard}>
        <View style={styles.channelPill}>
          <Ionicons name="radio-outline" size={15} color={colors.success} />
          <AppText style={styles.channelPillText}>{channelName}</AppText>
        </View>
        <AppText style={styles.topic}>{room.topic}</AppText>
        <AppText style={styles.roomCounts}>
          {currentSpeakers.length} speakers - {listenerCount} listeners
        </AppText>
      </View>

      <View style={styles.section}>
        <AppText style={styles.sectionTitle}>Speakers</AppText>
        <View style={styles.speakerGrid}>
          {currentSpeakers.map((speaker, index) => (
            <SpeakerTile
              key={`${speaker}-${index}`}
              name={speaker}
              role={index === 0 ? 'Host' : speaker === profile.nickname ? 'You' : 'Speaker'}
              active={roomState === 'live' && (!muted || speaker !== profile.nickname)}
              host={index === 0}
            />
          ))}
        </View>
      </View>

      <View style={styles.listenerCard}>
        <Ionicons name="people-outline" size={20} color="#B9C1CE" />
        <View style={styles.listenerCopy}>
          <AppText style={styles.listenerTitle}>Listeners</AppText>
          <AppText style={styles.listenerMeta}>
            {listenerCount} members are listening. New Agora users appear here as they join.
          </AppText>
        </View>
      </View>

      <View style={styles.controls}>
        <RoomControl
          icon={muted ? 'mic-off' : 'mic'}
          label={muted ? 'Unmute' : 'Mute'}
          active={!muted}
          onPress={toggleMute}
        />
        <RoomControl
          icon={handRaised ? 'hand-left' : 'hand-left-outline'}
          label={handRaised ? 'Hand up' : 'Raise hand'}
          active={handRaised}
          onPress={() => onHandRaisedChange(!handRaised)}
        />
        <RoomControl
          icon={speakerEnabled ? 'volume-high' : 'volume-mute'}
          label="Speaker"
          active={speakerEnabled}
          onPress={toggleSpeaker}
        />
        <RoomControl icon="ban-outline" label="Block host" danger onPress={onBlockHost} />
        <RoomControl icon="call" label="Leave" danger onPress={onLeave} />
      </View>
    </View>
  );
}

function SpeakerTile({
  name,
  role,
  active,
  host
}: {
  name: string;
  role: string;
  active: boolean;
  host: boolean;
}) {
  return (
    <View style={styles.speakerTile}>
      <View style={[styles.speakerAvatar, host && styles.hostAvatar, active && styles.speakerAvatarActive]}>
        <AppText style={styles.speakerInitial}>{name.slice(0, 1).toUpperCase()}</AppText>
      </View>
      <AppText style={styles.speakerName}>{name}</AppText>
      <AppText style={styles.speakerRole}>{role}</AppText>
    </View>
  );
}

function RoomControl({
  icon,
  label,
  active,
  danger,
  onPress,
  style
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  danger?: boolean;
  onPress: () => void;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.controlItem, style]}>
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
  statusRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success
  },
  roomMeta: {
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
  topicCard: {
    gap: 10,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2A2E38',
    backgroundColor: '#171A22'
  },
  channelPill: {
    alignSelf: 'flex-start',
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(46, 184, 114, 0.16)'
  },
  channelPillText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '900'
  },
  topic: {
    color: colors.onAccent,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900'
  },
  roomCounts: {
    color: '#B9C1CE',
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
  speakerAvatarActive: {
    borderWidth: 3,
    borderColor: colors.success
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
  listenerCard: {
    minHeight: 72,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#171A22',
    borderWidth: 1,
    borderColor: '#2A2E38'
  },
  listenerCopy: {
    flex: 1
  },
  listenerTitle: {
    color: colors.onAccent,
    fontWeight: '900'
  },
  listenerMeta: {
    marginTop: 3,
    color: '#B9C1CE',
    fontSize: 12,
    lineHeight: 16,
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
    width: 62,
    alignItems: 'center',
    gap: 6
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
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
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center'
  }
});
