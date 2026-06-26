import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  View,
  type ViewStyle
} from 'react-native';
import { Camera } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import type {
  ConnectionChangedReasonType,
  ConnectionStateType,
  IRtcEngine,
  IRtcEngineEventHandler
} from 'react-native-agora';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import {
  getAgoraJoinCredentials,
  type LiveVideoSession
} from '../services/firebaseVideoMatchService';
import { colors } from '../theme';
import type { UserProfile } from '../types';

type AgoraModule = typeof import('react-native-agora');

type Props = {
  session: LiveVideoSession;
  profile: UserProfile;
  darkMode: boolean;
  onLeave: () => void;
  onReport: () => void;
  onBlock: () => void;
  onFatalError: (message: string) => void;
};

type CallConnectionState =
  | 'connecting'
  | 'waiting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function VideoCallStage({
  session,
  profile,
  darkMode,
  onLeave,
  onReport,
  onBlock,
  onFatalError
}: Props) {
  const engineRef = useRef<IRtcEngine | null>(null);
  const eventHandlerRef = useRef<IRtcEngineEventHandler | null>(null);
  const mountedRef = useRef(true);
  const [agoraModule, setAgoraModule] = useState<AgoraModule | null>(null);
  const [connectionState, setConnectionState] = useState<CallConnectionState>('connecting');
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [microphoneMuted, setMicrophoneMuted] = useState(true);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [remoteVideoMuted, setRemoteVideoMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);

  useEffect(() => {
    mountedRef.current = true;

    async function connect() {
      try {
        const microphonePermission = await Camera.requestMicrophonePermissionsAsync();

        if (!microphonePermission.granted) {
          throw new Error('Microphone permission is required to join a video call.');
        }

        const credentials = await getAgoraJoinCredentials(session.agoraChannelName);
        const nativeAgora = require('react-native-agora') as AgoraModule;
        const engine = nativeAgora.createAgoraRtcEngine();
        const handler: IRtcEngineEventHandler = {
          onJoinChannelSuccess: () => {
            if (mountedRef.current) {
              setConnectionState('waiting');
            }
          },
          onUserJoined: (_connection, uid) => {
            if (mountedRef.current) {
              setRemoteUid(uid);
              setConnectionState('connected');
            }
          },
          onUserOffline: (_connection, uid) => {
            if (mountedRef.current) {
              setRemoteUid(null);
              setConnectionState('waiting');
            }
          },
          onUserMuteVideo: (_connection, uid, muted) => {
            if (mountedRef.current && (remoteUid === null || uid === remoteUid)) {
              setRemoteVideoMuted(muted);
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
              setConnectionState('reconnecting');
            } else if (state === nativeAgora.ConnectionStateType.ConnectionStateFailed) {
              setConnectionState('failed');
            }
          },
          onError: (errorCode, message) => {
            if (mountedRef.current) {
              setConnectionState('failed');
              onFatalError(message || `Agora video error ${errorCode}.`);
            }
          }
        };

        engine.initialize({
          appId: credentials.appId,
          channelProfile: nativeAgora.ChannelProfileType.ChannelProfileCommunication1v1
        });
        engine.registerEventHandler(handler);
        engine.enableAudio();
        engine.enableVideo();
        engine.enableLocalVideo(false);
        engine.muteLocalAudioStream(true);
        engine.setEnableSpeakerphone(true);

        const joinResult = engine.joinChannel(
          credentials.token,
          session.agoraChannelName,
          credentials.uid,
          {
            channelProfile: nativeAgora.ChannelProfileType.ChannelProfileCommunication1v1,
            clientRoleType: nativeAgora.ClientRoleType.ClientRoleBroadcaster,
            publishMicrophoneTrack: true,
            publishCameraTrack: false,
            autoSubscribeAudio: true,
            autoSubscribeVideo: true,
            enableAudioRecordingOrPlayout: true
          }
        );

        if (joinResult < 0) {
          throw new Error(`Could not join the Agora channel (${joinResult}).`);
        }

        engineRef.current = engine;
        eventHandlerRef.current = handler;
        setAgoraModule(nativeAgora);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Video call could not start.';

        if (mountedRef.current) {
          setConnectionState('failed');
          onFatalError(message);
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
  }, [session.agoraChannelName]);

  useEffect(() => {
    if (connectionState !== 'connected') {
      return;
    }

    const timer = setInterval(() => {
      setCallSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [connectionState]);

  async function toggleCamera() {
    const engine = engineRef.current;

    if (!engine) {
      return;
    }

    const nextEnabled = !cameraEnabled;

    if (nextEnabled) {
      const cameraPermission = await Camera.requestCameraPermissionsAsync();

      if (!cameraPermission.granted) {
        Alert.alert(
          'Camera stays off',
          'Camera permission was denied. You can continue this call with audio only.'
        );
        return;
      }
    }

    engine.enableLocalVideo(nextEnabled);
    engine.updateChannelMediaOptions({
      publishCameraTrack: nextEnabled,
      publishMicrophoneTrack: true
    });
    engine.muteLocalVideoStream(!nextEnabled);

    if (nextEnabled) {
      engine.startPreview();
    } else {
      engine.stopPreview();
    }

    setCameraEnabled(nextEnabled);
  }

  function toggleMicrophone() {
    const nextMuted = !microphoneMuted;
    engineRef.current?.muteLocalAudioStream(nextMuted);
    setMicrophoneMuted(nextMuted);
  }

  function toggleSpeaker() {
    const nextEnabled = !speakerEnabled;
    engineRef.current?.setEnableSpeakerphone(nextEnabled);
    setSpeakerEnabled(nextEnabled);
  }

  const RtcSurfaceView = agoraModule?.RtcSurfaceView;
  const statusText =
    connectionState === 'connecting'
      ? 'Connecting securely'
      : connectionState === 'waiting'
        ? `Waiting for ${session.candidate.nickname}`
        : connectionState === 'reconnecting'
          ? 'Reconnecting'
          : connectionState === 'failed'
            ? 'Call connection failed'
            : formatDuration(callSeconds);

  return (
    <View style={styles.callRoot}>
      <View style={styles.remoteStage}>
        {RtcSurfaceView && remoteUid !== null && !remoteVideoMuted ? (
          <RtcSurfaceView
            style={styles.remoteVideo}
            canvas={{
              uid: remoteUid,
              renderMode: agoraModule.RenderModeType.RenderModeHidden
            }}
          />
        ) : (
          <View style={styles.remoteFallback}>
            <Image source={{ uri: session.candidate.photoUrl }} style={styles.remoteAvatar} />
            <AppText style={styles.remoteName}>{session.candidate.nickname}</AppText>
            <AppText style={styles.remoteHint}>
              {remoteUid === null ? 'Waiting for the other person to join' : 'Camera is off'}
            </AppText>
          </View>
        )}

        <View style={styles.callHeader}>
          <View>
            <AppText style={styles.callName}>{session.candidate.nickname}</AppText>
            <View style={styles.statusRow}>
              {connectionState !== 'connected' ? (
                <ActivityIndicator size="small" color={colors.onAccent} />
              ) : (
                <View style={styles.liveDot} />
              )}
              <AppText style={styles.callStatus}>{statusText}</AppText>
            </View>
          </View>
          <View style={styles.safetyActions}>
            <CallIcon
              accessibilityLabel="Report this call"
              icon="flag-outline"
              onPress={onReport}
              compact
            />
            <CallIcon
              accessibilityLabel="Block this member"
              icon="ban-outline"
              onPress={onBlock}
              compact
            />
          </View>
        </View>

        {cameraEnabled && RtcSurfaceView ? (
          <View style={styles.localPreview}>
            <RtcSurfaceView
              style={styles.localVideo}
              zOrderMediaOverlay
              canvas={{
                uid: 0,
                renderMode: agoraModule.RenderModeType.RenderModeHidden
              }}
            />
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Switch camera"
              onPress={() => engineRef.current?.switchCamera()}
              style={styles.flipButton}
            >
              <Ionicons name="camera-reverse-outline" size={19} color={colors.onAccent} />
            </PressableScale>
          </View>
        ) : (
          <View style={styles.localPreviewOff}>
            <Ionicons name="videocam-off-outline" size={22} color={colors.onAccent} />
            <AppText style={styles.localPreviewOffText}>{profile.nickname}</AppText>
          </View>
        )}

        <View style={styles.controls}>
          <CallIcon
            accessibilityLabel={microphoneMuted ? 'Turn microphone on' : 'Mute microphone'}
            icon={microphoneMuted ? 'mic-off' : 'mic'}
            label={microphoneMuted ? 'Unmute' : 'Mute'}
            active={!microphoneMuted}
            onPress={toggleMicrophone}
          />
          <CallIcon
            accessibilityLabel={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
            icon={cameraEnabled ? 'videocam' : 'videocam-off'}
            label={cameraEnabled ? 'Camera' : 'Camera off'}
            active={cameraEnabled}
            onPress={() => void toggleCamera()}
          />
          <CallIcon
            accessibilityLabel={speakerEnabled ? 'Turn speaker off' : 'Turn speaker on'}
            icon={speakerEnabled ? 'volume-high' : 'volume-mute'}
            label="Speaker"
            active={speakerEnabled}
            onPress={toggleSpeaker}
          />
          <CallIcon
            accessibilityLabel="Leave video call"
            icon="call"
            label="Leave"
            danger
            onPress={onLeave}
          />
        </View>
      </View>
    </View>
  );
}

type CallIconProps = {
  accessibilityLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  label?: string;
  active?: boolean;
  danger?: boolean;
  compact?: boolean;
  onPress: () => void;
  style?: ViewStyle;
};

function CallIcon({
  accessibilityLabel,
  icon,
  label,
  active,
  danger,
  compact,
  onPress,
  style
}: CallIconProps) {
  return (
    <View style={[styles.controlItem, compact && styles.controlItemCompact, style]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={[
          styles.controlButton,
          compact && styles.controlButtonCompact,
          active && styles.controlButtonActive,
          danger && styles.controlButtonDanger
        ]}
      >
        <Ionicons
          name={icon}
          size={compact ? 18 : 23}
          color={active || danger ? colors.onAccent : colors.ink}
          style={danger ? styles.leaveIcon : undefined}
        />
      </PressableScale>
      {label ? <AppText style={styles.controlLabel}>{label}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  callRoot: {
    flex: 1,
    backgroundColor: '#080A0F'
  },
  remoteStage: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#121722'
  },
  remoteVideo: {
    ...StyleSheet.absoluteFillObject
  },
  remoteFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: '#151923'
  },
  remoteAvatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.75)'
  },
  remoteName: {
    marginTop: 16,
    color: colors.onAccent,
    fontSize: 24,
    fontWeight: '900'
  },
  remoteHint: {
    marginTop: 6,
    color: '#B8C0CE',
    textAlign: 'center'
  },
  callHeader: {
    position: 'absolute',
    top: 18,
    left: 18,
    right: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between'
  },
  callName: {
    color: colors.onAccent,
    fontSize: 19,
    fontWeight: '900'
  },
  statusRow: {
    marginTop: 5,
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
  callStatus: {
    color: '#E4E8EF',
    fontSize: 12,
    fontWeight: '700'
  },
  safetyActions: {
    flexDirection: 'row',
    gap: 8
  },
  localPreview: {
    position: 'absolute',
    top: 88,
    right: 16,
    width: 104,
    height: 148,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: '#242A34'
  },
  localVideo: {
    flex: 1
  },
  flipButton: {
    position: 'absolute',
    right: 7,
    bottom: 7,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)'
  },
  localPreviewOff: {
    position: 'absolute',
    top: 88,
    right: 16,
    width: 104,
    height: 84,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(20,24,32,0.88)'
  },
  localPreviewOffText: {
    color: colors.onAccent,
    fontSize: 11,
    fontWeight: '800'
  },
  controls: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 24,
    minHeight: 92,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(10,12,17,0.8)'
  },
  controlItem: {
    width: 70,
    alignItems: 'center',
    gap: 6
  },
  controlItemCompact: {
    width: 40
  },
  controlButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)'
  },
  controlButtonCompact: {
    width: 38,
    height: 38,
    borderRadius: 19
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
