import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../components/AppText';
import { colors } from '../theme';

type LoadingStepConfig = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
};

type Props = {
  title?: string;
  subtitle?: string;
  steps?: LoadingStepConfig[];
};

const defaultSteps: LoadingStepConfig[] = [
  { icon: 'shield-checkmark-outline', label: 'Safety ready' },
  { icon: 'eye-off-outline', label: 'Anonymous first' },
  { icon: 'timer-outline', label: '2-minute match ready' }
];

export function LoadingScreen({
  title = 'Preparing KaTalk',
  subtitle = 'Setting up your anonymous profile and safety controls.',
  steps = defaultSteps
}: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.mark}>
        <Ionicons name="chatbubbles-outline" size={40} color={colors.accent} />
      </View>
      <AppText style={styles.title}>{title}</AppText>
      <AppText style={styles.subtitle}>{subtitle}</AppText>
      <ActivityIndicator size="large" color={colors.accent} style={styles.spinner} />
      <View style={styles.steps}>
        {steps.map((step) => (
          <LoadingStep key={step.label} icon={step.icon} label={step.label} />
        ))}
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
    borderWidth: 1,
    borderColor: '#3B1742',
    backgroundColor: '#181021',
    marginBottom: 18
  },
  title: {
    color: colors.ink,
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
    borderRadius: 16,
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
