import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/PrimaryButton';
import { PressableScale } from '../components/PressableScale';
import { candidates } from '../data/mockData';
import type { MessageMatchSession, SavedMatch } from '../services/contracts';
import { appServices } from '../services/localAppServices';
import { colors } from '../theme';
import type { Candidate, MatchStatus, Message, UserProfile } from '../types';
import { formatTimer } from '../utils/age';

const MATCH_SECONDS = 120;

type Props = {
  profile: UserProfile;
  onChattingStateChange?: (isChatting: boolean) => void;
};

export function MessageMatchScreen({ profile, onChattingStateChange }: Props) {
  const [status, setStatus] = useState<MatchStatus>('idle');
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(MATCH_SECONDS);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [savedByMe, setSavedByMe] = useState(false);
  const [savedByMatch, setSavedByMatch] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [savedMatches, setSavedMatches] = useState<SavedMatch[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const matchCompleteRef = useRef(false);

  const matchComplete = savedByMe && savedByMatch;

  useEffect(() => {
    matchCompleteRef.current = matchComplete;
  }, [matchComplete]);

  useEffect(() => {
    void refreshSavedMatches();
  }, [profile.id]);

  useEffect(() => {
    onChattingStateChange?.(status === 'active');
  }, [onChattingStateChange, status]);

  useEffect(() => {
    return () => onChattingStateChange?.(false);
  }, [onChattingStateChange]);

  useEffect(() => {
    if (status !== 'active') {
      return undefined;
    }

    const interval = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          clearInterval(interval);
          expireMatch();
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  const timerTone = useMemo(() => {
    if (secondsLeft <= 20) {
      return colors.danger;
    }

    if (secondsLeft <= 45) {
      return colors.warn;
    }

    return colors.accent;
  }, [secondsLeft]);

  function findChat() {
    setStatus('searching');
    setTimeout(async () => {
      let session: MessageMatchSession;

      try {
        session = await appServices.messageMatches.start(profile);
      } catch {
        setStatus('idle');
        Alert.alert('No matches available', 'There are no visible message matches right now.');
        return;
      }

      const next = session.candidate;
      setCandidate(next);
      setMessages([
        {
          id: 'system-opener',
          sender: 'system',
          body: `Prompt: ${session.openingPrompt}`,
          sentAt: new Date()
        }
      ]);
      setSavedByMe(false);
      setSavedByMatch(false);
      setRevealed(false);
      setSecondsLeft(MATCH_SECONDS);
      setStatus('active');

      setTimeout(() => {
        setMessages((current) => [
          ...current,
          {
            id: `match-${Date.now()}`,
            sender: 'match',
            body: next.prompt,
            sentAt: new Date()
          }
        ]);
      }, 900);
    }, 700);
  }

  function expireMatch() {
    setStatus((current) => {
      if (current !== 'active') {
        return current;
      }

      if (matchCompleteRef.current && candidate) {
        void appServices.savedMatches.save(profile, candidate).then(refreshSavedMatches);
      }

      setMessages((existing) => [
        ...existing,
        {
          id: `expired-${Date.now()}`,
          sender: 'system',
          body: matchCompleteRef.current
            ? 'The 2-minute chat ended. You both saved this match, so it moved to saved chats.'
            : 'The 2-minute chat ended automatically. You are back on the matching screen.',
          sentAt: new Date()
        }
      ]);

      return matchCompleteRef.current ? 'saved' : 'expired';
    });
  }

  async function refreshSavedMatches() {
    const matches = await appServices.savedMatches.list(profile);
    setSavedMatches(matches);
  }

  function sendMessage() {
    const text = draft.trim();

    if (!text || status !== 'active') {
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: `me-${Date.now()}`,
        sender: 'me',
        body: text,
        sentAt: new Date()
      }
    ]);
    setDraft('');

    if (!savedByMatch && text.length > 8) {
      setTimeout(() => setSavedByMatch(true), 650);
    }
  }

  function resetToIdle() {
    setStatus('idle');
    setCandidate(null);
    setMessages([]);
    setSecondsLeft(MATCH_SECONDS);
    setSavedByMe(false);
    setSavedByMatch(false);
    setRevealed(false);
  }

  function confirmReportOrBlock(kind: 'reported' | 'blocked') {
    Alert.alert(
      kind === 'reported' ? 'Report this match?' : 'Block this match?',
      kind === 'reported'
        ? 'The chat will stay open unless you confirm. This helps prevent accidental taps.'
        : 'Blocking ends this chat and prevents future matching with this member.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: kind === 'reported' ? 'Report' : 'Block',
          style: 'destructive',
          onPress: () => reportOrBlock(kind)
        }
      ]
    );
  }

  function reportOrBlock(kind: 'reported' | 'blocked') {
    if (candidate) {
      void appServices.safety.record({
        source: 'message_match',
        action: kind === 'reported' ? 'report' : 'block',
        targetId: candidate.id,
        actorId: profile.id
      });
    }

    setMessages((current) => [
      ...current,
      {
        id: `${kind}-${Date.now()}`,
        sender: 'system',
        body: `This match was ${kind}. Future matching with this member is disabled.`,
        sentAt: new Date()
      }
    ]);
    setStatus('expired');
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {status === 'idle' || status === 'searching' ? (
        <ScrollView contentContainerStyle={styles.chatHome}>
          <View style={styles.topBar}>
            <View>
              <AppText style={styles.screenTitle}>KaTalk</AppText>
            </View>
            <PressableScale accessibilityRole="button" style={styles.roundIcon}>
              <Ionicons name="search-outline" size={21} color={colors.ink} />
            </PressableScale>
          </View>

          <View style={styles.sectionHeader}>
            <AppText style={styles.sectionTitleSmall}>Story</AppText>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyRow}>
            <View style={styles.storyItem}>
              <View style={styles.addStory}>
                <Ionicons name="add" size={24} color={colors.ink} />
              </View>
              <AppText style={styles.storyName}>Add Story</AppText>
            </View>
            {candidates.map((item) => (
              <View key={item.id} style={styles.storyItem}>
                <Image source={{ uri: item.photoUrl }} style={styles.storyImage} />
                <AppText style={styles.storyName}>{item.nickname}</AppText>
              </View>
            ))}
          </ScrollView>

          <View style={styles.featureMatch}>
            <View>
              <AppText style={styles.featureTitle}>Ready for a quiet match?</AppText>
              <AppText style={styles.featureCopy}>Chat ends automatically after 2 minutes.</AppText>
            </View>
            <PrimaryButton
              label={status === 'searching' ? 'Finding...' : 'Find Chat'}
              icon="chatbubble-outline"
              disabled={status === 'searching'}
              onPress={findChat}
              style={styles.findButton}
            />
          </View>

          <View style={styles.sectionHeader}>
            <AppText style={styles.sectionTitleSmall}>Chat</AppText>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
          </View>
          <View style={styles.chatList}>
            {candidates.map((item, index) => (
              <View key={item.id} style={styles.chatRow}>
                <Image source={{ uri: item.photoUrl }} style={styles.chatAvatar} />
                <View style={styles.chatPreview}>
                  <AppText style={styles.chatName}>{item.nickname}</AppText>
                  <AppText style={styles.chatSnippet} numberOfLines={1}>
                    {item.prompt}
                  </AppText>
                </View>
                <View style={styles.chatMeta}>
                  <AppText style={styles.chatTime}>
                    {index === 0 ? '11:43 am' : index === 1 ? '09:21 am' : 'Yesterday'}
                  </AppText>
                  {index < 2 ? <Ionicons name="checkmark-done" size={16} color={colors.accent} /> : null}
                </View>
              </View>
            ))}
          </View>

          {savedMatches.length > 0 ? (
            <View style={styles.savedCard}>
              <AppText style={styles.savedTitle}>Saved matches</AppText>
              {savedMatches.map((match) => (
                <View key={match.id} style={styles.savedRow}>
                  <Image source={{ uri: match.candidate.photoUrl }} style={styles.savedAvatar} />
                  <View style={styles.savedInfo}>
                    <AppText style={styles.savedName}>Anonymous saved match</AppText>
                    <AppText style={styles.savedMeta}>
                      {match.candidate.interests.join(' • ')}
                    </AppText>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      ) : null}

      {candidate && (status === 'active' || status === 'expired' || status === 'saved') ? (
        <View style={styles.chatArea}>
          <View style={styles.matchHeader}>
            <Image source={{ uri: candidate.photoUrl }} style={styles.avatarImage} />
            <View style={styles.matchInfo}>
              <AppText style={styles.matchName}>
                {revealed ? `${candidate.nickname}, ${candidate.age}` : 'Anonymous match'}
              </AppText>
              <AppText style={styles.matchMeta}>
                {candidate.interests.join(' • ')}
              </AppText>
            </View>
            <View style={[styles.timerPill, { borderColor: timerTone }]}>
              <Ionicons name="timer-outline" size={17} color={timerTone} />
              <AppText style={[styles.timerText, { color: timerTone }]}>
                {formatTimer(secondsLeft)}
              </AppText>
            </View>
          </View>

          <ScrollView ref={scrollRef} contentContainerStyle={styles.messages}>
            {messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.bubble,
                  message.sender === 'me' && styles.myBubble,
                  message.sender === 'system' && styles.systemBubble
                ]}
              >
                <AppText
                  style={[
                    styles.bubbleText,
                    message.sender === 'me' && styles.myBubbleText,
                    message.sender === 'system' && styles.systemText
                  ]}
                >
                  {message.body}
                </AppText>
              </View>
            ))}
          </ScrollView>

          {status === 'active' ? (
            <View style={styles.actionPanel}>
              <View style={styles.quickActions}>
                <PrimaryButton
                  label={savedByMe ? 'Saved' : 'Save'}
                  icon="heart-outline"
                  variant="secondary"
                  onPress={() => setSavedByMe(true)}
                  style={styles.quickButton}
                />
                <PrimaryButton
                  label={revealed ? 'Revealed' : 'Reveal'}
                  icon="eye-outline"
                  variant="secondary"
                  onPress={() => setRevealed(true)}
                  style={styles.quickButton}
                />
                <PrimaryButton
                  label="Report"
                  icon="flag-outline"
                  variant="danger"
                  onPress={() => confirmReportOrBlock('reported')}
                  style={styles.quickButton}
                />
              </View>
              <View style={styles.saveStatus}>
                <Ionicons name="heart-outline" size={17} color={colors.onAccent} />
                <AppText style={styles.saveStatusText}>
                  {matchComplete
                    ? 'Both saved. This chat will move to saved matches after the timer ends.'
                    : savedByMe
                      ? 'You saved. Waiting for the other person before the timer ends.'
                      : 'Save only works if both people choose it before time runs out.'}
                </AppText>
              </View>
              <View style={styles.inputRow}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Send a calm message"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  multiline
                />
                <PressableScale accessibilityRole="button" onPress={sendMessage} style={styles.sendButton}>
                  <Ionicons name="send" size={20} color={colors.onAccent} />
                </PressableScale>
              </View>
              <PrimaryButton
                label="Block"
                icon="ban-outline"
                variant="danger"
                onPress={() => confirmReportOrBlock('blocked')}
              />
            </View>
          ) : (
            <View style={styles.endedPanel}>
              <AppText style={styles.endedTitle}>
                {status === 'saved' ? 'Saved match' : 'Chat ended'}
              </AppText>
              <AppText style={styles.endedCopy}>
                {status === 'saved'
                  ? 'Both people saved before the timer ended. This would now appear in saved chats.'
                  : 'The chat closed automatically after 2 minutes.'}
              </AppText>
              <PrimaryButton label="Find New Chat" icon="refresh-outline" onPress={resetToIdle} />
            </View>
          )}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface
  },
  chatHome: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 26,
    gap: 16
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  screenTitle: {
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900'
  },
  screenSubtitle: {
    color: colors.muted,
    marginTop: 3
  },
  roundIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  sectionTitleSmall: {
    fontSize: 16,
    fontWeight: '900'
  },
  storyRow: {
    gap: 14,
    paddingRight: 12
  },
  storyItem: {
    width: 62,
    alignItems: 'center',
    gap: 6
  },
  addStory: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    backgroundColor: colors.surfaceMuted
  },
  storyImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.accent
  },
  storyName: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center'
  },
  featureMatch: {
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '900'
  },
  featureCopy: {
    color: colors.muted,
    marginTop: 3
  },
  findButton: {
    alignSelf: 'flex-start',
    minWidth: 134
  },
  chatList: {
    gap: 2
  },
  chatRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  chatAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25
  },
  chatPreview: {
    flex: 1
  },
  chatName: {
    fontWeight: '900'
  },
  chatSnippet: {
    color: colors.muted,
    marginTop: 3,
    fontSize: 12
  },
  chatMeta: {
    alignItems: 'flex-end',
    gap: 4
  },
  chatTime: {
    color: colors.muted,
    fontSize: 11
  },
  chatArea: {
    flex: 1
  },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  avatarImage: {
    width: 46,
    height: 46,
    borderRadius: 23
  },
  matchInfo: {
    flex: 1
  },
  matchName: {
    fontWeight: '900',
    fontSize: 16
  },
  matchMeta: {
    color: colors.muted,
    fontSize: 12
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 74,
    justifyContent: 'center'
  },
  timerText: {
    fontWeight: '900'
  },
  messages: {
    padding: 16,
    gap: 10
  },
  bubble: {
    maxWidth: '84%',
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line
  },
  myBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent
  },
  systemBubble: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceMuted
  },
  bubbleText: {
    color: colors.ink
  },
  myBubbleText: {
    color: colors.onAccent
  },
  systemText: {
    color: colors.muted,
    textAlign: 'center'
  },
  actionPanel: {
    padding: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8
  },
  quickButton: {
    flex: 1
  },
  saveStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: colors.accent
  },
  saveStatusText: {
    flex: 1,
    color: colors.onAccent,
    fontWeight: '800',
    fontSize: 13
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 96,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.background,
    color: colors.ink
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center'
  },
  endedPanel: {
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface
  },
  endedTitle: {
    fontSize: 18,
    fontWeight: '900'
  },
  endedCopy: {
    color: colors.muted
  },
  savedCard: {
    width: '100%',
    maxWidth: 360,
    marginTop: 12,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    gap: 10
  },
  savedTitle: {
    fontWeight: '900',
    fontSize: 16
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  savedAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19
  },
  savedInfo: {
    flex: 1
  },
  savedName: {
    fontWeight: '900'
  },
  savedMeta: {
    color: colors.muted,
    fontSize: 12
  }
});
