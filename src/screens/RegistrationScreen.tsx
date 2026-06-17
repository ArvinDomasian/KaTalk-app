import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/PrimaryButton';
import { PressableScale } from '../components/PressableScale';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors } from '../theme';
import type { UserProfile } from '../types';
import { isAdult } from '../utils/age';

type Props = {
  onComplete: (profile: UserProfile) => void;
};

const comfortOptions: Array<UserProfile['comfort']> = ['shy', 'balanced', 'open'];

export function RegistrationScreen({ onComplete }: Props) {
  const [nickname, setNickname] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [preference, setPreference] = useState('');
  const [ageRange, setAgeRange] = useState('21-35');
  const [interests, setInterests] = useState('');
  const [comfort, setComfort] = useState<UserProfile['comfort']>('shy');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedRules, setAcceptedRules] = useState(false);

  const dobIsAdult = useMemo(() => isAdult(dateOfBirth), [dateOfBirth]);
  const canSubmit =
    nickname.trim().length >= 2 &&
    dobIsAdult &&
    gender.trim().length > 0 &&
    preference.trim().length > 0 &&
    acceptedTerms &&
    acceptedPrivacy &&
    acceptedRules;

  function submit() {
    if (!canSubmit) {
      return;
    }

    onComplete({
      id: `local-${Date.now()}`,
      nickname: nickname.trim(),
      dateOfBirth,
      gender: gender.trim(),
      preference: preference.trim(),
      ageRange,
      interests: interests
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      comfort,
      acceptedTerms,
      acceptedPrivacy,
      acceptedRules
    });
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Create your calm dating space"
        subtitle="Adults only. Anonymous first. Safety controls are part of the first step."
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <AppText style={styles.sectionTitle}>Adult registration</AppText>
          <Field label="Nickname">
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              placeholder="Example: Alex"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </Field>
          <Field label="Date of birth">
            <TextInput
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.muted}
              keyboardType="numbers-and-punctuation"
              style={[styles.input, dateOfBirth.length > 0 && !dobIsAdult && styles.inputError]}
            />
          </Field>
          {dateOfBirth.length > 0 && !dobIsAdult ? (
            <AppText style={styles.error}>KaTalk is only for adults 18 and older.</AppText>
          ) : null}
          <Field label="Gender">
            <TextInput
              value={gender}
              onChangeText={setGender}
              placeholder="Woman, man, non-binary..."
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </Field>
          <Field label="Dating preference">
            <TextInput
              value={preference}
              onChangeText={setPreference}
              placeholder="Who you want to meet"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </Field>
          <Field label="Preferred age range">
            <TextInput
              value={ageRange}
              onChangeText={setAgeRange}
              placeholder="21-35"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </Field>
          <Field label="Interests">
            <TextInput
              value={interests}
              onChangeText={setInterests}
              placeholder="coffee, movies, games"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </Field>
        </View>

        <View style={styles.card}>
          <AppText style={styles.sectionTitle}>Comfort setting</AppText>
          <View style={styles.segmentRow}>
            {comfortOptions.map((option) => {
              const active = comfort === option;
              return (
                <PressableScale
                  key={option}
                  accessibilityRole="button"
                  onPress={() => setComfort(option)}
                  style={[styles.segment, active && styles.segmentActive]}
                >
                  <AppText style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {option}
                  </AppText>
                </PressableScale>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <AppText style={styles.sectionTitle}>Safety onboarding</AppText>
          <SafetyLine icon="shield-checkmark-outline" text="Block and report are always visible." />
          <SafetyLine icon="eye-off-outline" text="Profiles stay anonymous until mutual reveal." />
          <SafetyLine icon="location-outline" text="Nearby shows distance only, not live map pins." />
          <SafetyLine icon="exit-outline" text="Rooms and calls always have a clear leave action." />
        </View>

        <View style={styles.card}>
          <ConsentRow
            label="I accept the Terms."
            checked={acceptedTerms}
            onPress={() => setAcceptedTerms((value) => !value)}
          />
          <ConsentRow
            label="I accept the Privacy Policy."
            checked={acceptedPrivacy}
            onPress={() => setAcceptedPrivacy((value) => !value)}
          />
          <ConsentRow
            label="I accept the Community Rules."
            checked={acceptedRules}
            onPress={() => setAcceptedRules((value) => !value)}
          />
        </View>

        <PrimaryButton
          label="Enter KaTalk"
          icon="arrow-forward-outline"
          disabled={!canSubmit}
          onPress={submit}
        />
      </ScrollView>
    </View>
  );
}

function Field({ label, children }: React.PropsWithChildren<{ label: string }>) {
  return (
    <View style={styles.field}>
      <AppText style={styles.label}>{label}</AppText>
      {children}
    </View>
  );
}

function SafetyLine({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.safetyLine}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <AppText style={styles.safetyText}>{text}</AppText>
    </View>
  );
}

function ConsentRow({
  label,
  checked,
  onPress
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={styles.consentRow}>
      <Ionicons
        name={checked ? 'checkbox' : 'square-outline'}
        size={22}
        color={checked ? colors.accent : colors.muted}
      />
      <AppText style={styles.safetyText}>{label}</AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 28
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 12
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900'
  },
  field: {
    gap: 6
  },
  label: {
    color: colors.muted,
    fontWeight: '800',
    fontSize: 13
  },
  input: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    color: colors.ink,
    backgroundColor: colors.background
  },
  inputError: {
    borderColor: colors.danger
  },
  error: {
    color: colors.danger,
    fontWeight: '700'
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8
  },
  segment: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted
  },
  segmentActive: {
    backgroundColor: colors.accent
  },
  segmentText: {
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'capitalize'
  },
  segmentTextActive: {
    color: colors.background
  },
  safetyLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  safetyText: {
    flex: 1
  },
  consentRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  }
});
