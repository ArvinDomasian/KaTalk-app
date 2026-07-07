import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import type { LiveVideoSession } from '../services/liveVideoMatchService';
import { colors } from '../theme';
import type { UserProfile } from '../types';

type Props = {
  session: LiveVideoSession;
  profile: UserProfile;
  darkMode: boolean;
  onLeave: () => void;
  onReport: () => void;
  onBlock: () => void;
  onFatalError: (message: string) => void;
};

export function VideoCallStage({ session }: Props) {
  return (
    <View style={styles.root}>
      <Ionicons name="phone-portrait-outline" size={46} color={colors.accent} />
      <AppText style={styles.title}>Open KaTalk on your phone</AppText>
      <AppText style={styles.copy}>
        Your match with {session.candidate.nickname} needs the installed Android or iOS app for
        live camera and microphone calling.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface
  },
  title: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center'
  },
  copy: {
    maxWidth: 340,
    marginTop: 8,
    color: colors.muted,
    lineHeight: 20,
    textAlign: 'center'
  }
});
