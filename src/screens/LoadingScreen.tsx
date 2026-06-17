import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../components/AppText';
import { colors } from '../theme';

export function LoadingScreen() {
  return (
    <View style={styles.root}>
      <View style={styles.mark}>
        <Ionicons name="chatbubbles-outline" size={40} color={colors.accent} />
      </View>
      <AppText style={styles.title}>Preparing KaTalk</AppText>
      <AppText style={styles.subtitle}>Setting up your anonymous profile and safety controls.</AppText>
      <ActivityIndicator size="large" color={colors.accent} style={styles.spinner} />
      <View style={styles.steps}>
        <LoadingStep icon="shield-checkmark-outline" label="Safety ready" />
        <LoadingStep icon="eye-off-outline" label="Anonymous first" />
        <LoadingStep icon="timer-outline" label="2-minute match ready" />
      </View>
    </View>
  );
}

function LoadingStep({
  icon,
  label
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.step}>
      <Ionicons name={icon} size={18} color={colors.accent} />
      <AppText style={styles.stepText}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background
  },
  mark: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    marginBottom: 18
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    textAlign: 'center'
  },
  subtitle: {
    marginTop: 8,
    color: colors.muted,
    textAlign: 'center',
    maxWidth: 300
  },
  spinner: {
    marginTop: 24
  },
  steps: {
    width: '100%',
    maxWidth: 320,
    marginTop: 28,
    gap: 10
  },
  step: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line
  },
  stepText: {
    fontWeight: '800'
  }
});
