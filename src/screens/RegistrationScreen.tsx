import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/PrimaryButton';
import { PressableScale } from '../components/PressableScale';
import {
  confirmEmailVerification,
  getCurrentAuthUserId,
  resendEmailVerification,
  sendEmailPasswordReset,
  signInWithEmail,
  startEmailVerification
} from '../services/authService';
import { loadCurrentUserProfile } from '../services/profileService';
import { colors } from '../theme';
import type { UserProfile } from '../types';
import { isAdult } from '../utils/age';

type Props = {
  onComplete: (profile: UserProfile) => void;
};

type AuthMethod = 'apple' | 'google' | 'facebook' | 'phone';

type AuthRegistrationResult = {
  method: AuthMethod;
  displayName?: string;
  contact: string;
};

const comfortOptions: Array<UserProfile['comfort']> = ['shy', 'balanced', 'open'];
const thisYear = new Date().getFullYear();
const birthYears = Array.from({ length: 51 }, (_, index) => String(thisYear - 18 - index));
const birthMonths = [
  ['Jan', '01'],
  ['Feb', '02'],
  ['Mar', '03'],
  ['Apr', '04'],
  ['May', '05'],
  ['Jun', '06'],
  ['Jul', '07'],
  ['Aug', '08'],
  ['Sep', '09'],
  ['Oct', '10'],
  ['Nov', '11'],
  ['Dec', '12']
];
const genderOptions = ['Woman', 'Man', 'Non-binary', 'Trans woman', 'Trans man', 'Prefer not to say'];
const preferenceOptions = ['Women', 'Men', 'Everyone', 'Non-binary people', 'Still exploring'];
const interestOptions = [
  'Coffee',
  'Movies',
  'Music',
  'Gaming',
  'Fitness',
  'Foodie',
  'Books',
  'Gym',
  'Walking',
  'Food trips',
  'Art',
  'Art & Design',
  'Photography',
  'Anime',
  'K-drama',
  'Travel',
  'Pets',
  'Cooking',
  'Tech',
  'Fashion',
  'Dancing',
  'Nature',
  'Comedy',
  'Night markets',
  'Study dates',
  'Deep talks',
  'Quiet nights',
  'Karaoke',
  'Board games',
  'Volunteering',
  'Spirituality'
];
const introInterestOptions = ['Travel', 'Photography', 'Music', 'Fitness', 'Foodie', 'Gaming', 'Movies', 'Art & Design'];

function authMethodLabel(method: AuthMethod) {
  if (method === 'apple') {
    return 'Apple';
  }

  if (method === 'google') {
    return 'Google';
  }

  if (method === 'facebook') {
    return 'Facebook';
  }

  return 'Phone';
}

function interestIconFor(interest: string): keyof typeof Ionicons.glyphMap {
  const normalized = interest.toLowerCase();

  if (normalized.includes('travel') || normalized.includes('walking')) {
    return 'airplane';
  }

  if (normalized.includes('photo') || normalized.includes('art') || normalized.includes('fashion')) {
    return 'camera';
  }

  if (normalized.includes('music') || normalized.includes('karaoke') || normalized.includes('dancing')) {
    return 'musical-notes';
  }

  if (normalized.includes('gym') || normalized.includes('fitness')) {
    return 'barbell';
  }

  if (normalized.includes('food') || normalized.includes('coffee') || normalized.includes('cooking')) {
    return 'restaurant';
  }

  if (normalized.includes('gaming') || normalized.includes('board')) {
    return 'game-controller';
  }

  if (normalized.includes('movie') || normalized.includes('drama') || normalized.includes('anime')) {
    return 'film';
  }

  if (normalized.includes('books') || normalized.includes('study')) {
    return 'book';
  }

  if (normalized.includes('pets')) {
    return 'paw';
  }

  if (normalized.includes('deep') || normalized.includes('quiet')) {
    return 'chatbubbles';
  }

  return 'sparkles';
}

export function RegistrationScreen({ onComplete }: Props) {
  const [showRegistration, setShowRegistration] = useState(false);
  const [setupStep, setSetupStep] = useState<'interests' | 'details'>('interests');
  const [authResult, setAuthResult] = useState<AuthRegistrationResult | null>(null);
  const formOpacity = useRef(new Animated.Value(0)).current;
  const [nickname, setNickname] = useState('');
  const [birthYear, setBirthYear] = useState(String(thisYear - 24));
  const [birthMonth, setBirthMonth] = useState('06');
  const [birthDay, setBirthDay] = useState('15');
  const [gender, setGender] = useState(genderOptions[0]);
  const [preference, setPreference] = useState(preferenceOptions[0]);
  const [minAge, setMinAge] = useState(21);
  const [maxAge, setMaxAge] = useState(35);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([
    'Travel',
    'Music',
    'Gaming'
  ]);
  const [comfort, setComfort] = useState<UserProfile['comfort']>('shy');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedRules, setAcceptedRules] = useState(false);

  const daysInSelectedMonth = useMemo(
    () => new Date(Number(birthYear), Number(birthMonth), 0).getDate(),
    [birthMonth, birthYear]
  );
  const birthDays = useMemo(
    () =>
      Array.from({ length: daysInSelectedMonth }, (_, index) =>
        (index + 1).toString().padStart(2, '0')
      ),
    [daysInSelectedMonth]
  );
  const dateOfBirth = useMemo(
    () => `${birthYear}-${birthMonth}-${birthDay}`,
    [birthDay, birthMonth, birthYear]
  );
  const ageRange = `${minAge}-${maxAge}`;
  const dobIsAdult = useMemo(() => isAdult(dateOfBirth), [dateOfBirth]);
  const canSubmit =
    nickname.trim().length >= 2 &&
    dobIsAdult &&
    selectedInterests.length >= 3 &&
    acceptedTerms &&
    acceptedPrivacy &&
    acceptedRules;

  useEffect(() => {
    if (Number(birthDay) > daysInSelectedMonth) {
      setBirthDay(String(daysInSelectedMonth).padStart(2, '0'));
    }
  }, [birthDay, daysInSelectedMonth]);

  useEffect(() => {
    if (showRegistration) {
      formOpacity.setValue(0);
      Animated.timing(formOpacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true
      }).start();
    }
  }, [formOpacity, showRegistration]);

  function submit() {
    if (!canSubmit) {
      return;
    }

    onComplete({
      id: getCurrentAuthUserId() ?? `local-${Date.now()}`,
      nickname: nickname.trim(),
      dateOfBirth,
      gender,
      preference,
      ageRange,
      interests: selectedInterests,
      comfort,
      authMethod: authResult?.method,
      authContact: authResult?.contact,
      acceptedTerms,
      acceptedPrivacy,
      acceptedRules
    });
  }

  function handleAuthRegistered(result: AuthRegistrationResult) {
    setAuthResult(result);
    setSetupStep('interests');

    if (result.displayName && !nickname.trim()) {
      setNickname(result.displayName.split(' ')[0]);
    }

    setShowRegistration(true);
  }

  if (!showRegistration) {
    return <WelcomeStartScreen onGetStarted={handleAuthRegistered} onLogin={onComplete} />;
  }

  if (setupStep === 'interests') {
    return (
      <Animated.View style={[styles.root, { opacity: formOpacity }]}>
        <InterestSetupScreen
          selectedInterests={selectedInterests}
          onToggleInterest={(option) => {
            setSelectedInterests((current) =>
              current.includes(option)
                ? current.filter((item) => item !== option)
                : [...current, option]
            );
          }}
          onBack={() => setShowRegistration(false)}
          onSkip={() => {
            setSelectedInterests((current) =>
              current.length >= 3 ? current : ['Coffee', 'Music', 'Deep talks']
            );
            setSetupStep('details');
          }}
          onNext={() => setSetupStep('details')}
        />
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.root, { opacity: formOpacity }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.setupTopBar}>
          <PressableScale
            accessibilityRole="button"
            onPress={() => setSetupStep('interests')}
            style={styles.formBackButton}
          >
            <Ionicons name="chevron-back" size={20} color={colors.onAccent} />
          </PressableScale>
          <View style={styles.coinPill}>
            <Ionicons name="ellipse" size={13} color={colors.gold} />
            <AppText style={styles.coinPillText}>1,250</AppText>
          </View>
        </View>

        <View style={styles.setupHero}>
          <View style={styles.setupProgressRow}>
            <View style={[styles.setupProgressDot, styles.setupProgressActive]} />
            <View style={[styles.setupProgressDot, selectedInterests.length >= 3 && styles.setupProgressActive]} />
            <View style={[styles.setupProgressDot, acceptedTerms && acceptedPrivacy && acceptedRules && styles.setupProgressActive]} />
          </View>
          <AppText style={styles.formTitle}>Tell us about you</AppText>
          <AppText style={styles.formSubtitle}>
            Select your interests so we can find your vibe.
          </AppText>
          {authResult ? (
            <View style={styles.authMethodPill}>
              <Ionicons name="shield-checkmark" size={14} color={colors.accent} />
              <AppText style={styles.authMethodPillText}>Verified with {authResult.method}</AppText>
            </View>
          ) : null}
        </View>

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
            <DatePickerRow
              label="Year"
              options={birthYears.map((year) => [year, year])}
              value={birthYear}
              onSelect={setBirthYear}
            />
            <DatePickerRow
              label="Month"
              options={birthMonths}
              value={birthMonth}
              onSelect={setBirthMonth}
            />
            <DatePickerRow
              label="Day"
              options={birthDays.map((day) => [day, day])}
              value={birthDay}
              onSelect={setBirthDay}
            />
          </Field>
          {!dobIsAdult ? (
            <AppText style={styles.error}>KaTalk is only for adults 18 and older.</AppText>
          ) : null}

          <Field label="Gender">
            <ChipGroup options={genderOptions} selected={[gender]} onToggle={setGender} />
          </Field>

          <Field label="Dating preference">
            <ChipGroup options={preferenceOptions} selected={[preference]} onToggle={setPreference} />
          </Field>

          <Field label="Preferred age range">
            <View style={styles.sliderCard}>
              <View style={styles.ageHeader}>
                <AppText style={styles.ageValue}>{minAge}</AppText>
                <AppText style={styles.ageDash}>to</AppText>
                <AppText style={styles.ageValue}>{maxAge}</AppText>
              </View>
              <RangeAgeSlider
                minValue={minAge}
                maxValue={maxAge}
                minLimit={18}
                maxLimit={65}
                onChange={(nextMin, nextMax) => {
                  setMinAge(nextMin);
                  setMaxAge(nextMax);
                }}
              />
            </View>
          </Field>

          <Field label={`Interests (${selectedInterests.length} selected)`}>
            <InterestGrid
              options={interestOptions}
              selected={selectedInterests}
              onToggle={(option) => {
                setSelectedInterests((current) =>
                  current.includes(option)
                    ? current.filter((item) => item !== option)
                    : [...current, option]
                );
              }}
            />
            {selectedInterests.length < 3 ? (
              <AppText style={styles.helperText}>Pick at least 3 interests.</AppText>
            ) : null}
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
          label="Next"
          icon="arrow-forward-outline"
          disabled={!canSubmit}
          onPress={submit}
          style={styles.enterButton}
        />
      </ScrollView>
    </Animated.View>
  );
}

function InterestSetupScreen({
  selectedInterests,
  onToggleInterest,
  onBack,
  onSkip,
  onNext
}: {
  selectedInterests: string[];
  onToggleInterest: (interest: string) => void;
  onBack: () => void;
  onSkip: () => void;
  onNext: () => void;
}) {
  return (
    <View style={styles.interestSetupRoot}>
      <View style={styles.setupStatusRow}>
        <AppText style={styles.authTime}>9:41</AppText>
        <View style={styles.authSignalRow}>
          <Ionicons name="cellular" size={13} color={colors.onAccent} />
          <Ionicons name="wifi" size={13} color={colors.onAccent} />
          <Ionicons name="battery-half" size={15} color={colors.onAccent} />
        </View>
      </View>

      <View style={styles.interestSetupTop}>
        <PressableScale accessibilityRole="button" onPress={onBack} style={styles.setupBackButton}>
          <Ionicons name="chevron-back" size={18} color={colors.onAccent} />
        </PressableScale>
        <View style={styles.coinPill}>
          <Ionicons name="ellipse" size={13} color={colors.gold} />
          <AppText style={styles.coinPillText}>1,250</AppText>
        </View>
      </View>

      <View style={styles.interestSetupCopy}>
        <AppText style={styles.formTitle}>Tell us about you</AppText>
        <AppText style={styles.formSubtitle}>
          Select your interests so we can find your vibe.
        </AppText>
      </View>

      <View style={styles.introInterestGrid}>
        {introInterestOptions.map((interest) => {
          const active = selectedInterests.includes(interest);

          return (
            <PressableScale
              key={interest}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onToggleInterest(interest)}
              style={[styles.introInterestTile, active && styles.introInterestTileActive]}
            >
              <Ionicons
                name={interestIconFor(interest)}
                size={18}
                color={active ? colors.accent : colors.muted}
              />
              <AppText style={[styles.introInterestText, active && styles.introInterestTextActive]}>
                {interest}
              </AppText>
            </PressableScale>
          );
        })}
      </View>

      <View style={styles.interestSetupFooter}>
        <View style={styles.setupProgressRow}>
          <View style={[styles.setupProgressDot, styles.setupProgressActive]} />
          <View style={styles.setupProgressDot} />
          <View style={styles.setupProgressDot} />
          <View style={styles.setupProgressDot} />
          <View style={styles.setupProgressDot} />
        </View>
        <View style={styles.setupFooterActions}>
          <PressableScale accessibilityRole="button" onPress={onSkip} style={styles.skipButton}>
            <AppText style={styles.skipButtonText}>Skip</AppText>
          </PressableScale>
          <PressableScale accessibilityRole="button" onPress={onNext} style={styles.setupNextButton}>
            <AppText style={styles.setupNextText}>Next</AppText>
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

function WelcomeStartScreen({
  onGetStarted,
  onLogin
}: {
  onGetStarted: (result: AuthRegistrationResult) => void;
  onLogin: (profile: UserProfile) => void;
}) {
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [authMethod, setAuthMethod] = useState<AuthMethod | null>(null);
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const cardTranslate = useRef(new Animated.Value(0)).current;
  const canSendSocial =
    authName.trim().length >= 2 &&
    authEmail.includes('@') &&
    authPassword.trim().length >= 6 &&
    !authBusy;
  const canConfirmSocial = verificationSent && !authBusy;
  const canSendPhone = phoneNumber.trim().length >= 8 && !authBusy;
  const canLogin = loginEmail.includes('@') && loginPassword.length >= 6 && !authBusy;

  function transitionCard(action: () => void) {
    Animated.parallel([
      Animated.timing(cardOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true
      }),
      Animated.timing(cardTranslate, {
        toValue: 16,
        duration: 150,
        useNativeDriver: true
      })
    ]).start(() => {
      action();
      cardTranslate.setValue(-14);
      Animated.parallel([
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true
        }),
        Animated.timing(cardTranslate, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true
        })
      ]).start();
    });
  }

  function resetVerificationState() {
    setVerificationSent(false);
    setVerificationStatus(null);
    setAuthBusy(false);
  }

  function resetAuthFields() {
    setAuthMethod(null);
    setAuthName('');
    setAuthEmail('');
    setAuthPassword('');
    setLoginEmail('');
    setLoginPassword('');
    setPhoneNumber('');
    resetVerificationState();
  }

  function openLoginForm() {
    transitionCard(() => {
      resetAuthFields();
      setShowLoginForm(true);
    });
  }

  function selectMethod(method: AuthMethod) {
    transitionCard(() => {
      setAuthMethod(method);
      setShowLoginForm(false);
      resetVerificationState();
    });
  }

  function resetToMethods() {
    transitionCard(() => {
      setAuthMethod(null);
      resetVerificationState();
    });
  }

  function completeAuth() {
    onGetStarted({
      method: authMethod ?? 'phone',
      displayName: authName.trim() || undefined,
      contact: authMethod === 'phone' ? phoneNumber.trim() : authEmail.trim()
    });
  }

  async function handleSendVerification() {
    if (authMethod === 'phone') {
      setVerificationStatus('Phone verification needs SMS auth setup before real SMS codes can be sent.');
      return;
    }

    setAuthBusy(true);
    setVerificationStatus(null);

    const result = verificationSent
      ? await resendEmailVerification()
      : await startEmailVerification(authEmail.trim(), authName.trim(), authPassword.trim());

    setVerificationSent(result.ok);
    setVerificationStatus(result.message);
    setAuthBusy(false);
  }

  async function handleLogin() {
    setAuthBusy(true);
    setVerificationStatus('Signing in...');

    try {
      const result = await signInWithEmail(loginEmail.trim(), loginPassword);

      setVerificationStatus(result.message);

      if (!result.ok) {
        return;
      }

      setVerificationStatus('Signed in. Loading your profile...');

      try {
        const storedProfile = await loadCurrentUserProfile(5000);

        if (storedProfile) {
          onLogin(storedProfile);
          return;
        }
      } catch {
        setVerificationStatus('Signed in. Finish telling KaTalk about yourself.');
      }

      onGetStarted({
        method: 'google',
        displayName: result.displayName,
        contact: result.contact ?? loginEmail.trim()
      });
    } catch {
      setVerificationStatus('Sign in took too long. Check your connection, then try again.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function handlePasswordReset() {
    if (!loginEmail.includes('@')) {
      setVerificationStatus('Enter your Gmail first, then tap reset password.');
      return;
    }

    setAuthBusy(true);
    const result = await sendEmailPasswordReset(loginEmail.trim());
    setVerificationStatus(result.message);
    setAuthBusy(false);
  }

  async function handleConfirmVerification() {
    if (authMethod === 'phone') {
      setVerificationStatus('Phone verification is not active yet. Use Apple or Google email verification for now.');
      return;
    }

    setAuthBusy(true);

    const result = await confirmEmailVerification();

    setVerificationStatus(result.message);
    setAuthBusy(false);

    if (result.ok) {
      completeAuth();
    }
  }

  return (
    <View style={styles.welcomeRoot}>
      <View style={styles.authPhoneShell}>
        <View style={styles.authGridOverlay} />
        <View style={styles.authStatusRow}>
          <AppText style={styles.authTime}>9:41</AppText>
          <View style={styles.authSignalRow}>
            <Ionicons name="cellular" size={13} color={colors.onAccent} />
            <Ionicons name="wifi" size={13} color={colors.onAccent} />
            <Ionicons name="battery-half" size={15} color={colors.onAccent} />
          </View>
        </View>

        <Animated.View
          style={[
            styles.welcomeCard,
            {
              opacity: cardOpacity,
              transform: [{ translateY: cardTranslate }]
            }
          ]}
        >
          {!authMethod && !showLoginForm ? (
            <>
              <View style={styles.onboardingStage}>
                <View style={styles.authGlowOne} />
                <View style={styles.authGlowTwo} />
                <View style={styles.onboardingTopTools}>
                  <View style={styles.onboardingCoinPill}>
                    <Ionicons name="ellipse" size={12} color={colors.gold} />
                    <AppText style={styles.onboardingCoinText}>1,250</AppText>
                  </View>
                  <Ionicons name="ellipsis-horizontal" size={18} color={colors.onAccent} />
                </View>
                <View style={styles.authOrbitLine} />
                <View style={[styles.authOrbitAvatar, styles.authOrbitAvatarLeft]}>
                  <AppText style={styles.authOrbitInitial}>M</AppText>
                </View>
                <View style={[styles.authOrbitAvatar, styles.authOrbitAvatarRight]}>
                  <AppText style={styles.authOrbitInitial}>K</AppText>
                </View>
                <View style={[styles.authOrbitAvatar, styles.authOrbitAvatarBottom]}>
                  <AppText style={styles.authOrbitInitial}>A</AppText>
                </View>
                <View style={styles.onboardingLogoBlock}>
                  <View style={styles.authLogoMark}>
                    <Ionicons name="heart" size={32} color={colors.onAccent} />
                    <Ionicons name="sparkles" size={15} color={colors.onAccent} style={styles.authLogoSpark} />
                  </View>
                  <View style={styles.authLogoWordRow}>
                    <AppText style={styles.authLogoText}>Ka</AppText>
                    <AppText style={[styles.authLogoText, styles.authHeadlineAccent]}>Talk</AppText>
                  </View>
                  <AppText style={styles.authLogoTagline}>
                    Where real conversations{'\n'}turn into real connections.
                  </AppText>
                </View>
              </View>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Get started with KaTalk registration"
                onPress={() => selectMethod('google')}
                style={styles.phoneContinueButton}
              >
                <AppText style={styles.phoneContinueText}>Get Started</AppText>
              </PressableScale>
              <AppText style={styles.joinWithText}>Join with</AppText>
              <View style={styles.socialButtonRow}>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Apple"
                  onPress={() => selectMethod('apple')}
                  style={styles.socialIconButton}
                >
                  <Ionicons name="logo-apple" size={18} color={colors.onAccent} />
                </PressableScale>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Google"
                  onPress={() => selectMethod('google')}
                  style={styles.socialIconButton}
                >
                  <Ionicons name="logo-google" size={18} color={colors.onAccent} />
                </PressableScale>
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Facebook"
                  onPress={() => selectMethod('facebook')}
                  style={styles.socialIconButton}
                >
                  <Ionicons name="logo-facebook" size={18} color={colors.onAccent} />
                </PressableScale>
              </View>
              <PressableScale accessibilityRole="button" onPress={openLoginForm} style={styles.authSignInLine}>
                <AppText style={styles.authSignInMuted}>Already have an account?</AppText>
                <AppText style={styles.authSignInAccent}>Sign in</AppText>
              </PressableScale>
            </>
          ) : (
            <>
              <AppText style={styles.welcomeTitle}>
                {authMethod
                  ? authMethod === 'phone'
                    ? 'Register With Phone'
                    : `Register With ${authMethodLabel(authMethod)}`
                  : showLoginForm
                    ? 'Log In To KaTalk'
                    : 'Register To Start Meeting People'}
              </AppText>
              <AppText style={styles.welcomeCopy}>
                {authMethod
                  ? authMethod === 'phone'
                    ? 'Real SMS verification needs SMS auth setup before this method can go live.'
                    : 'Create a password, verify your Gmail, then use this same login next time.'
                  : showLoginForm
                    ? 'Use the Gmail and password you registered with. Verified users enter immediately.'
                    : 'Choose a registration method to create your calm, anonymous-first profile.'}
              </AppText>
              {authMethod ? (
                <AuthMethodForm
                  method={authMethod}
                  name={authName}
                  email={authEmail}
                  password={authPassword}
                  phoneNumber={phoneNumber}
                  verificationSent={verificationSent}
                  verificationStatus={verificationStatus}
                  isBusy={authBusy}
                  canSend={authMethod === 'phone' ? canSendPhone : canSendSocial}
                  canContinue={authMethod === 'phone' ? false : canConfirmSocial}
                  onNameChange={setAuthName}
                  onEmailChange={(value) => {
                    setAuthEmail(value);
                    resetVerificationState();
                  }}
                  onPasswordChange={(value) => {
                    setAuthPassword(value);
                    resetVerificationState();
                  }}
                  onPhoneChange={(value) => {
                    setPhoneNumber(value);
                    resetVerificationState();
                  }}
                  onSendCode={handleSendVerification}
                  onBack={resetToMethods}
                  onContinue={handleConfirmVerification}
                />
              ) : (
                <LoginForm
                  email={loginEmail}
                  password={loginPassword}
                  status={verificationStatus}
                  isBusy={authBusy}
                  canLogin={canLogin}
                  onEmailChange={(value) => {
                    setLoginEmail(value);
                    setVerificationStatus(null);
                  }}
                  onPasswordChange={(value) => {
                    setLoginPassword(value);
                    setVerificationStatus(null);
                  }}
                  onLogin={handleLogin}
                  onPasswordReset={handlePasswordReset}
                  onBack={() => transitionCard(() => setShowLoginForm(false))}
                />
              )}
            </>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

function AuthMethodForm({
  method,
  name,
  email,
  password,
  phoneNumber,
  verificationSent,
  verificationStatus,
  isBusy,
  canSend,
  canContinue,
  onNameChange,
  onEmailChange,
  onPasswordChange,
  onPhoneChange,
  onSendCode,
  onBack,
  onContinue
}: {
  method: AuthMethod;
  name: string;
  email: string;
  password: string;
  phoneNumber: string;
  verificationSent: boolean;
  verificationStatus: string | null;
  isBusy: boolean;
  canSend: boolean;
  canContinue: boolean;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onSendCode: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  if (method === 'phone') {
    return (
      <View style={styles.authForm}>
        <TextInput
          value={phoneNumber}
          onChangeText={onPhoneChange}
          keyboardType="phone-pad"
          placeholder="Phone number"
          placeholderTextColor={colors.muted}
          style={styles.authInput}
        />
        <PressableScale
          accessibilityRole="button"
          onPress={onSendCode}
          disabled={!canSend}
          style={[styles.sendCodeButton, !canSend && styles.disabledAuthButton]}
        >
          <AppText style={styles.sendCodeText}>Set Up Phone Verification</AppText>
        </PressableScale>
        {verificationStatus ? (
          <AppText style={styles.verificationHint}>{verificationStatus}</AppText>
        ) : null}
        <View style={styles.authFormActions}>
          <PressableScale accessibilityRole="button" onPress={onBack} style={styles.backAuthButton}>
            <Ionicons name="chevron-back" size={17} color={colors.ink} />
            <AppText style={styles.backAuthText}>Back</AppText>
          </PressableScale>
          <PressableScale
            accessibilityRole="button"
            onPress={onContinue}
            disabled={!canContinue}
            style={[styles.continueAuthButton, !canContinue && styles.disabledAuthButton]}
          >
            <AppText style={styles.continueAuthText}>Confirm Verification</AppText>
          </PressableScale>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.authForm}>
      <TextInput
        value={name}
        onChangeText={onNameChange}
        placeholder="Full name"
        placeholderTextColor={colors.muted}
        style={styles.authInput}
      />
      <TextInput
        value={email}
        onChangeText={onEmailChange}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholder={`${authMethodLabel(method)} email`}
        placeholderTextColor={colors.muted}
        style={styles.authInput}
      />
      <TextInput
        value={password}
        onChangeText={onPasswordChange}
        secureTextEntry
        placeholder="Password, minimum 6 characters"
        placeholderTextColor={colors.muted}
        style={styles.authInput}
      />
      <PressableScale
        accessibilityRole="button"
        onPress={onSendCode}
        disabled={!canSend}
        style={[styles.sendCodeButton, !canSend && styles.disabledAuthButton]}
      >
        <AppText style={styles.sendCodeText}>
          {isBusy ? 'Working...' : verificationSent ? 'Resend Verification Email' : 'Send Verification Email'}
        </AppText>
      </PressableScale>
      {verificationStatus ? (
        <AppText style={styles.verificationHint}>{verificationStatus}</AppText>
      ) : null}
      <View style={styles.authFormActions}>
        <PressableScale accessibilityRole="button" onPress={onBack} style={styles.backAuthButton}>
          <Ionicons name="chevron-back" size={17} color={colors.ink} />
          <AppText style={styles.backAuthText}>Back</AppText>
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          onPress={onContinue}
          disabled={!canContinue}
          style={[styles.continueAuthButton, !canContinue && styles.disabledAuthButton]}
        >
          <AppText style={styles.continueAuthText}>Confirm Verification</AppText>
        </PressableScale>
      </View>
    </View>
  );
}

function LoginForm({
  email,
  password,
  status,
  isBusy,
  canLogin,
  onEmailChange,
  onPasswordChange,
  onLogin,
  onPasswordReset,
  onBack
}: {
  email: string;
  password: string;
  status: string | null;
  isBusy: boolean;
  canLogin: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onLogin: () => void;
  onPasswordReset: () => void;
  onBack: () => void;
}) {
  return (
    <View style={styles.authForm}>
      <TextInput
        value={email}
        onChangeText={onEmailChange}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholder="Gmail or email"
        placeholderTextColor={colors.muted}
        style={styles.authInput}
      />
      <TextInput
        value={password}
        onChangeText={onPasswordChange}
        secureTextEntry
        placeholder="Password"
        placeholderTextColor={colors.muted}
        style={styles.authInput}
      />
      {status ? <AppText style={styles.verificationHint}>{status}</AppText> : null}
      <PressableScale
        accessibilityRole="button"
        onPress={onLogin}
        disabled={!canLogin}
        style={[styles.loginSubmitButton, !canLogin && styles.disabledAuthButton]}
      >
        {isBusy ? <ActivityIndicator size="small" color={colors.ink} /> : null}
        <AppText style={styles.continueAuthText}>{isBusy ? 'Signing in...' : 'Log In'}</AppText>
      </PressableScale>
      <View style={styles.authFormActions}>
        <PressableScale accessibilityRole="button" onPress={onBack} style={styles.backAuthButton}>
          <Ionicons name="chevron-back" size={17} color={colors.ink} />
          <AppText style={styles.backAuthText}>Back</AppText>
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          onPress={onPasswordReset}
          disabled={!email.includes('@') || isBusy}
          style={[
            styles.passwordResetButton,
            (!email.includes('@') || isBusy) && styles.disabledAuthButton
          ]}
        >
          <AppText style={styles.passwordResetText}>Reset Password</AppText>
        </PressableScale>
      </View>
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

function DatePickerRow({
  label,
  options,
  value,
  onSelect
}: {
  label: string;
  options: string[][];
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.dateRow}>
      <AppText style={styles.dateLabel}>{label}</AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateOptions}>
        {options.map(([display, optionValue]) => (
          <ChipButton
            key={optionValue}
            label={display}
            active={value === optionValue}
            onPress={() => onSelect(optionValue)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function ChipGroup({
  options,
  selected,
  onToggle
}: {
  options: string[];
  selected: string[];
  onToggle: (option: string) => void;
}) {
  return (
    <View style={styles.chipWrap}>
      {options.map((option) => (
        <ChipButton
          key={option}
          label={option}
          active={selected.includes(option)}
          onPress={() => onToggle(option)}
        />
      ))}
    </View>
  );
}

function InterestGrid({
  options,
  selected,
  onToggle
}: {
  options: string[];
  selected: string[];
  onToggle: (option: string) => void;
}) {
  return (
    <View style={styles.interestGrid}>
      {options.map((option) => {
        const active = selected.includes(option);

        return (
          <PressableScale
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onToggle(option)}
            style={[styles.interestTile, active && styles.interestTileActive]}
          >
            <View style={[styles.interestIconBubble, active && styles.interestIconBubbleActive]}>
              <Ionicons
                name={interestIconFor(option)}
                size={18}
                color={active ? colors.onAccent : colors.muted}
              />
            </View>
            <AppText style={[styles.interestTileText, active && styles.interestTileTextActive]}>
              {option}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

function ChipButton({
  label,
  active,
  onPress
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <AppText style={[styles.chipText, active && styles.chipTextActive]}>{label}</AppText>
    </PressableScale>
  );
}

function RangeAgeSlider({
  minValue,
  maxValue,
  minLimit,
  maxLimit,
  onChange
}: {
  minValue: number;
  maxValue: number;
  minLimit: number;
  maxLimit: number;
  onChange: (min: number, max: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(1);
  const [activeThumb, setActiveThumb] = useState<'min' | 'max'>('min');
  const range = maxLimit - minLimit;
  const minPercent = ((minValue - minLimit) / range) * 100;
  const maxPercent = ((maxValue - minLimit) / range) * 100;

  function handleLayout(event: LayoutChangeEvent) {
    setTrackWidth(event.nativeEvent.layout.width);
  }

  function valueFromEvent(event: GestureResponderEvent) {
    const rawPercent = Math.min(Math.max(event.nativeEvent.locationX / trackWidth, 0), 1);
    return Math.round(minLimit + rawPercent * range);
  }

  function updateValue(event: GestureResponderEvent, thumb = activeThumb) {
    const nextValue = valueFromEvent(event);

    if (thumb === 'min') {
      onChange(Math.min(nextValue, maxValue), maxValue);
      return;
    }

    onChange(minValue, Math.max(nextValue, minValue));
  }

  function handleStart(event: GestureResponderEvent) {
    const nextValue = valueFromEvent(event);
    const nearestThumb =
      Math.abs(nextValue - minValue) <= Math.abs(nextValue - maxValue) ? 'min' : 'max';
    setActiveThumb(nearestThumb);
    updateValue(event, nearestThumb);
  }

  return (
    <View style={styles.sliderGroup}>
      <View style={styles.sliderLabelRow}>
        <AppText style={styles.sliderLabel}>Drag the dots to choose age range</AppText>
        <AppText style={styles.sliderNumber}>{minValue}-{maxValue}</AppText>
      </View>
      <View
        style={styles.sliderTrack}
        onLayout={handleLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleStart}
        onResponderMove={updateValue}
      >
        <View
          style={[
            styles.sliderFill,
            {
              left: `${minPercent}%`,
              width: `${Math.max(maxPercent - minPercent, 0)}%`
            }
          ]}
        />
        <View style={[styles.sliderThumb, { left: `${minPercent}%` }]} />
        <View style={[styles.sliderThumb, { left: `${maxPercent}%` }]} />
      </View>
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
    <PressableScale
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={styles.consentRow}
    >
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
    flex: 1,
    backgroundColor: '#070812'
  },
  welcomeRoot: {
    flex: 1,
    backgroundColor: '#02040A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 18
  },
  authPhoneShell: {
    flex: 1,
    width: '100%',
    maxWidth: 360,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: '#252A36',
    backgroundColor: '#060810',
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 20,
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12
  },
  authGridOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#070911',
    opacity: 0.98
  },
  authStatusRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 3
  },
  authTime: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '800'
  },
  authLoginLink: {
    minHeight: 28,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3
  },
  authLoginText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '700'
  },
  authSignalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  authGhostWords: {
    position: 'absolute',
    top: 70,
    left: 20,
    right: 14,
    color: 'rgba(255,255,255,0.045)',
    fontSize: 52,
    lineHeight: 58,
    fontWeight: '900',
    letterSpacing: 0,
    zIndex: 1
  },
  authHeart: {
    position: 'absolute',
    top: 106,
    left: 42,
    zIndex: 2,
    transform: [{ rotate: '-10deg' }]
  },
  welcomeCard: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 0,
    paddingTop: 20,
    paddingBottom: 0,
    alignItems: 'stretch',
    justifyContent: 'flex-end',
    gap: 12,
    zIndex: 3
  },
  onboardingStage: {
    flex: 1,
    minHeight: 0,
    borderRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 22,
    backgroundColor: 'rgba(8, 9, 18, 0.72)'
  },
  onboardingTopTools: {
    position: 'absolute',
    top: 10,
    left: 8,
    right: 8,
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 5
  },
  onboardingCoinPill: {
    minHeight: 26,
    borderRadius: 13,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(20, 21, 32, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  onboardingCoinText: {
    color: colors.onAccent,
    fontSize: 11,
    fontWeight: '900'
  },
  onboardingLogoBlock: {
    position: 'absolute',
    top: 104,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 6,
    zIndex: 4
  },
  authGlowOne: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    left: -42,
    top: 12,
    backgroundColor: 'rgba(255, 61, 157, 0.28)'
  },
  authGlowTwo: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    right: -48,
    bottom: -16,
    backgroundColor: 'rgba(162, 89, 255, 0.26)'
  },
  authOrbitLine: {
    position: 'absolute',
    left: 54,
    right: 46,
    top: 238,
    height: 1,
    backgroundColor: 'rgba(255, 61, 157, 0.42)',
    transform: [{ rotate: '-9deg' }]
  },
  authOrbitAvatar: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: '#201A33',
    alignItems: 'center',
    justifyContent: 'center'
  },
  authOrbitAvatarLeft: {
    left: 36,
    top: 214
  },
  authOrbitAvatarRight: {
    right: 28,
    top: 198
  },
  authOrbitAvatarBottom: {
    right: 86,
    bottom: 68
  },
  authOrbitInitial: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '900'
  },
  authLogoStack: {
    alignItems: 'center',
    gap: 3,
    marginBottom: 4
  },
  authLogoMark: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8
  },
  authLogoSpark: {
    position: 'absolute',
    top: 14,
    right: 13
  },
  authLogoText: {
    color: colors.onAccent,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900'
  },
  authLogoWordRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  authLogoTagline: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    textAlign: 'center'
  },
  authHeadlineAccent: {
    color: colors.accent
  },
  phoneContinueButton: {
    width: '100%',
    minHeight: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    marginTop: 4
  },
  phoneContinueText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '900'
  },
  socialButtonRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10
  },
  socialIconButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#171A22'
  },
  joinWithText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 2
  },
  authSignInLine: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  authSignInMuted: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800'
  },
  authSignInAccent: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900'
  },
  welcomeTitle: {
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
    textAlign: 'center',
    maxWidth: 300,
    color: colors.onAccent,
    alignSelf: 'center'
  },
  welcomeCopy: {
    maxWidth: 280,
    color: colors.muted,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 17,
    alignSelf: 'center'
  },
  authForm: {
    width: '100%',
    gap: 10
  },
  authInput: {
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 16,
    color: colors.ink,
    backgroundColor: colors.surfaceMuted,
    fontWeight: '800'
  },
  sendCodeButton: {
    minHeight: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  sendCodeText: {
    color: colors.onAccent,
    fontWeight: '900'
  },
  verificationHint: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center'
  },
  authFormActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4
  },
  backAuthButton: {
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.surfaceMuted
  },
  backAuthText: {
    fontWeight: '900'
  },
  continueAuthButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  continueAuthText: {
    fontWeight: '900'
  },
  loginSubmitButton: {
    minHeight: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent
  },
  passwordResetButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted
  },
  passwordResetText: {
    color: colors.ink,
    fontWeight: '900'
  },
  disabledAuthButton: {
    opacity: 0.45
  },
  interestSetupRoot: {
    flex: 1,
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    marginVertical: 18,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: 'rgba(255, 106, 133, 0.48)',
    backgroundColor: '#070812',
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 22
  },
  setupStatusRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  interestSetupTop: {
    minHeight: 40,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  setupBackButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)'
  },
  interestSetupCopy: {
    gap: 8,
    paddingTop: 32,
    paddingBottom: 18
  },
  introInterestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  introInterestTile: {
    width: '48%',
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#141520',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9
  },
  introInterestTileActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(255, 107, 157, 0.08)'
  },
  introInterestText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800'
  },
  introInterestTextActive: {
    color: colors.onAccent
  },
  interestSetupFooter: {
    marginTop: 'auto',
    gap: 12
  },
  setupFooterActions: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  skipButton: {
    width: 78,
    minHeight: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  skipButtonText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900'
  },
  setupNextButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  setupNextText: {
    color: colors.onAccent,
    fontSize: 13,
    fontWeight: '900'
  },
  setupTopBar: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  formBackButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted
  },
  coinPill: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#3B2941'
  },
  coinPillText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '900'
  },
  setupHero: {
    gap: 9,
    paddingTop: 10,
    paddingBottom: 4
  },
  setupProgressRow: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 12
  },
  setupProgressDot: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.surfaceMuted
  },
  setupProgressActive: {
    backgroundColor: colors.accent
  },
  formTitle: {
    color: colors.onAccent,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '900'
  },
  formSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700'
  },
  authMethodPill: {
    alignSelf: 'flex-start',
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#3B2941'
  },
  authMethodPillText: {
    color: colors.onAccent,
    fontSize: 11,
    fontWeight: '900'
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 34,
    backgroundColor: '#070812'
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#332241',
    padding: 16,
    gap: 13
  },
  sectionTitle: {
    color: colors.onAccent,
    fontSize: 18,
    fontWeight: '900'
  },
  field: {
    gap: 8
  },
  label: {
    color: colors.muted,
    fontWeight: '800',
    fontSize: 13
  },
  input: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#332241',
    paddingHorizontal: 14,
    color: colors.ink,
    backgroundColor: '#10111C',
    fontWeight: '800'
  },
  error: {
    color: colors.danger,
    fontWeight: '700'
  },
  helperText: {
    color: colors.warn,
    fontWeight: '700'
  },
  dateRow: {
    gap: 6
  },
  dateLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900'
  },
  dateOptions: {
    gap: 8,
    paddingRight: 8
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chip: {
    minHeight: 38,
    borderRadius: 15,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1622',
    borderWidth: 1,
    borderColor: '#2B2138'
  },
  chipActive: {
    backgroundColor: 'rgba(255, 61, 157, 0.16)',
    borderColor: colors.accent
  },
  chipText: {
    color: colors.muted,
    fontWeight: '800'
  },
  chipTextActive: {
    color: colors.onAccent
  },
  interestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  interestTile: {
    width: '47.5%',
    minHeight: 70,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#141520',
    borderWidth: 1,
    borderColor: '#2B2138'
  },
  interestTileActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(255, 61, 157, 0.12)'
  },
  interestIconBubble: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted
  },
  interestIconBubbleActive: {
    backgroundColor: colors.accent
  },
  interestTileText: {
    flex: 1,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900'
  },
  interestTileTextActive: {
    color: colors.onAccent
  },
  sliderCard: {
    gap: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#10111C',
    borderWidth: 1,
    borderColor: '#332241',
    shadowColor: colors.accent,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  },
  ageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  ageValue: {
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '900',
    color: colors.accent
  },
  ageDash: {
    color: colors.muted,
    fontWeight: '800'
  },
  sliderGroup: {
    gap: 8
  },
  sliderLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  sliderLabel: {
    color: colors.muted,
    fontWeight: '800'
  },
  sliderNumber: {
    fontWeight: '900'
  },
  sliderTrack: {
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    overflow: 'visible'
  },
  sliderFill: {
    position: 'absolute',
    top: 11,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent
  },
  sliderThumb: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    marginLeft: -15,
    backgroundColor: colors.accent,
    borderWidth: 4,
    borderColor: colors.surface,
    shadowColor: '#5E86A6',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3
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
    borderRadius: 14,
    backgroundColor: '#1A1622',
    borderWidth: 1,
    borderColor: '#2B2138'
  },
  segmentActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  segmentText: {
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'capitalize'
  },
  segmentTextActive: {
    color: colors.onAccent
  },
  safetyLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  safetyText: {
    flex: 1,
    color: colors.muted,
    fontWeight: '700'
  },
  consentRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  enterButton: {
    borderRadius: 18,
    minHeight: 52,
    shadowColor: colors.accent,
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6
  }
});
