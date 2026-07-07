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

type AuthMethod = 'apple' | 'google' | 'phone';

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
  'Books',
  'Gym',
  'Walking',
  'Food trips',
  'Art',
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

export function RegistrationScreen({ onComplete }: Props) {
  const [showRegistration, setShowRegistration] = useState(false);
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
    'Coffee',
    'Movies',
    'Music'
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

    if (result.displayName && !nickname.trim()) {
      setNickname(result.displayName.split(' ')[0]);
    }

    setShowRegistration(true);
  }

  if (!showRegistration) {
    return <WelcomeStartScreen onGetStarted={handleAuthRegistered} onLogin={onComplete} />;
  }

  return (
    <Animated.View style={[styles.root, { opacity: formOpacity }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.formHero}>
          <PressableScale
            accessibilityRole="button"
            onPress={() => setShowRegistration(false)}
            style={styles.formBackButton}
          >
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </PressableScale>
          <AppText style={styles.formBrand}>KaTalk</AppText>
          <AppText style={styles.formTitle}>Create your calm dating space</AppText>
          <AppText style={styles.formSubtitle}>
            {authResult
              ? `Registered with ${authResult.method}. Finish your dating profile.`
              : 'Adults only. Anonymous first. Safety controls are part of the first step.'}
          </AppText>
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
            <ChipGroup
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
          label="Enter KaTalk"
          icon="arrow-forward-outline"
          disabled={!canSubmit}
          onPress={submit}
        />
      </ScrollView>
    </Animated.View>
  );
}

function WelcomeStartScreen({
  onGetStarted,
  onLogin
}: {
  onGetStarted: (result: AuthRegistrationResult) => void;
  onLogin: (profile: UserProfile) => void;
}) {
  const [showRegisterOptions, setShowRegisterOptions] = useState(false);
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
      setShowRegisterOptions(false);
      setShowLoginForm(true);
    });
  }

  function openRegisterOptions() {
    transitionCard(() => {
      resetAuthFields();
      setShowRegisterOptions(true);
      setShowLoginForm(false);
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

  function createLoginStarterProfile(result: { displayName?: string; contact?: string }): UserProfile {
    const contact = result.contact ?? loginEmail.trim();
    const emailName = contact.includes('@') ? contact.split('@')[0] : '';
    const nickname = result.displayName?.trim() || emailName || 'KaTalk member';

    return {
      id: getCurrentAuthUserId() ?? `local-${Date.now()}`,
      nickname,
      dateOfBirth: '2000-01-01',
      gender: 'Prefer not to say',
      preference: 'Everyone',
      ageRange: '21-35',
      interests: ['Coffee', 'Music', 'Deep talks'],
      comfort: 'balanced',
      authMethod: 'google',
      authContact: contact,
      acceptedTerms: true,
      acceptedPrivacy: true,
      acceptedRules: true
    };
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
        setVerificationStatus('Signed in. Opening KaTalk...');
      }

      onLogin(createLoginStarterProfile(result));
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
          {!showLoginForm ? (
            <PressableScale accessibilityRole="button" onPress={openLoginForm} style={styles.authLoginLink}>
              <AppText style={styles.authLoginText}>Log In</AppText>
              <Ionicons name="arrow-forward" size={13} color={colors.onAccent} />
            </PressableScale>
          ) : (
            <View style={styles.authSignalRow}>
              <Ionicons name="cellular" size={13} color={colors.onAccent} />
              <Ionicons name="wifi" size={13} color={colors.onAccent} />
              <Ionicons name="battery-half" size={15} color={colors.onAccent} />
            </View>
          )}
        </View>

        <AppText style={styles.authGhostWords}>
          SMART{'\n'}MATCHING FOR{'\n'}REAL LOVE
        </AppText>
        <Ionicons name="heart-outline" size={206} color="rgba(255,255,255,0.11)" style={styles.authHeart} />

        <Animated.View
          style={[
            styles.welcomeCard,
            {
              opacity: cardOpacity,
              transform: [{ translateY: cardTranslate }]
            }
          ]}
        >
          {!authMethod && !showLoginForm && !showRegisterOptions ? (
            <>
              <AppText style={styles.authHeadline}>
                SMART
                <AppText style={styles.authHeartDot}>●</AppText>
                {'\n'}
                <AppText style={styles.authHeadlineAccent}>MATCHING</AppText> FOR{'\n'}
                REAL LOVE{'\n'}TODAY
              </AppText>
              <PressableScale
                accessibilityRole="button"
                onPress={() => selectMethod('phone')}
                style={styles.phoneContinueButton}
              >
                <AppText style={styles.phoneContinueText}>Continue With Phone</AppText>
              </PressableScale>
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
              </View>
            </>
          ) : (
            <>
              <AppText style={styles.welcomeTitle}>
                {authMethod
                  ? authMethod === 'phone'
                    ? 'Register With Phone'
                    : `Register With ${authMethod === 'apple' ? 'Apple' : 'Google'}`
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
              ) : showLoginForm ? (
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
              ) : (
                <>
                  <AuthOptionButton
                    icon="logo-apple"
                    label="Continue with Apple"
                    onPress={() => selectMethod('apple')}
                    variant="apple"
                  />
                  <AuthOptionButton
                    icon="logo-google"
                    label="Continue with Google"
                    onPress={() => selectMethod('google')}
                    variant="google"
                  />
                  <AuthOptionButton
                    icon="phone-portrait"
                    label="Continue with Phone"
                    onPress={() => selectMethod('phone')}
                    variant="phone"
                  />
                  <PressableScale accessibilityRole="button" onPress={openLoginForm} style={styles.loginPrompt}>
                    <AppText style={styles.loginPromptText}>Already have an account?</AppText>
                    <AppText style={styles.loginPromptAction}>Log in</AppText>
                  </PressableScale>
                </>
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
        placeholder={`${method === 'apple' ? 'Apple' : 'Google'} email`}
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

function AuthOptionButton({
  icon,
  label,
  onPress,
  variant
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  variant: 'apple' | 'google' | 'phone';
}) {
  const variantStyle =
    variant === 'apple'
      ? styles.appleAuthButton
      : variant === 'google'
        ? styles.googleAuthButton
        : styles.phoneAuthButton;

  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.authButton, variantStyle]}
    >
      <Ionicons name={icon} size={19} color={colors.ink} />
      <AppText style={styles.authButtonText}>{label}</AppText>
    </PressableScale>
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
    backgroundColor: colors.background
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
    fontSize: 34,
    lineHeight: 40,
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
    width: '100%',
    marginTop: 'auto',
    paddingHorizontal: 0,
    paddingTop: 20,
    paddingBottom: 0,
    alignItems: 'stretch',
    gap: 12,
    zIndex: 3
  },
  authHeadline: {
    color: colors.onAccent,
    fontSize: 25,
    lineHeight: 29,
    fontWeight: '900',
    letterSpacing: 0,
    maxWidth: 270
  },
  authHeartDot: {
    color: colors.accent,
    fontSize: 15,
    lineHeight: 22
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
  authButton: {
    width: '100%',
    minHeight: 50,
    borderRadius: 26,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18
  },
  appleAuthButton: {
    backgroundColor: colors.lavender
  },
  googleAuthButton: {
    backgroundColor: colors.surfaceMuted
  },
  phoneAuthButton: {
    backgroundColor: colors.accent
  },
  authButtonText: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '900',
    fontSize: 13
  },
  loginPrompt: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  loginPromptText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800'
  },
  loginPromptAction: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900'
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
  getStartedButton: {
    marginTop: 6,
    width: '100%',
    minHeight: 52,
    borderRadius: 26,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.accent
  },
  getStartedText: {
    fontWeight: '900'
  },
  formHero: {
    padding: 18,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 8
  },
  formBackButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted
  },
  formBrand: {
    color: colors.accent,
    fontWeight: '900',
    fontSize: 16
  },
  formTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900'
  },
  formSubtitle: {
    color: colors.muted,
    fontWeight: '700'
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 28
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
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
    gap: 8
  },
  label: {
    color: colors.muted,
    fontWeight: '800',
    fontSize: 13
  },
  input: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    color: colors.ink,
    backgroundColor: colors.background
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
    minHeight: 40,
    borderRadius: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.line
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  chipText: {
    color: colors.muted,
    fontWeight: '800'
  },
  chipTextActive: {
    color: colors.onAccent
  },
  sliderCard: {
    gap: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
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
    color: colors.onAccent
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
