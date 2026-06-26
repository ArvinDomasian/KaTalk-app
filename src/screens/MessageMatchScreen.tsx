import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../components/AppText';
import { PrimaryButton } from '../components/PrimaryButton';
import { PressableScale } from '../components/PressableScale';
import { candidates } from '../data/mockData';
import type { MessageMatchSession, SavedMatch } from '../services/contracts';
import {
  closeLiveMessageMatch,
  recordLiveMessageSafety,
  saveLiveMessageMatch,
  sendLiveMessage,
  startLiveMessageMatching,
  subscribeLiveMatchState,
  subscribeLiveMessages
} from '../services/firebaseMessageMatchService';
import { appServices } from '../services/localAppServices';
import { colors } from '../theme';
import type { Candidate, MatchStatus, Message, UserProfile } from '../types';
import { formatTimer } from '../utils/age';

const MATCH_SECONDS = 120;
const RETURN_TO_MATCHING_DELAY_MS = 1600;
const NO_MATCH_TIMEOUT_MS = 15000;

type Props = {
  profile: UserProfile;
  darkMode?: boolean;
  onChattingStateChange?: (isChatting: boolean) => void;
};

type StoryItem = {
  id: string;
  nickname: string;
  photoUrl?: string;
  text: string;
  createdAt: Date;
  mine?: boolean;
};

type InboxThread = {
  id: string;
  candidate: Candidate;
  messages: Message[];
  unread: boolean;
};

export function MessageMatchScreen({ profile, darkMode = false, onChattingStateChange }: Props) {
  const [status, setStatus] = useState<MatchStatus>('idle');
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(MATCH_SECONDS);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [savedByMe, setSavedByMe] = useState(false);
  const [savedByMatch, setSavedByMatch] = useState(false);
  const [savedMatches, setSavedMatches] = useState<SavedMatch[]>([]);
  const [liveMatchId, setLiveMatchId] = useState<string | null>(null);
  const [matchEndsAtMs, setMatchEndsAtMs] = useState<number | null>(null);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [homeNotice, setHomeNotice] = useState<string | null>(null);
  const [matchWindowVisible, setMatchWindowVisible] = useState(false);
  const [matchWindowStage, setMatchWindowStage] = useState<'finding' | 'found' | 'none'>('finding');
  const [matchWindowCandidate, setMatchWindowCandidate] = useState<Candidate | null>(null);
  const [stories, setStories] = useState<StoryItem[]>(() =>
    candidates.map((item, index) => ({
      id: `story-${item.id}`,
      nickname: item.nickname,
      photoUrl: item.photoUrl,
      text:
        index === 0
          ? 'Coffee walk later. Keeping it calm today.'
          : index === 1
            ? 'Current mood: books, rain, and easy conversation.'
            : index === 2
              ? 'One small song has been stuck in my head all day.'
              : 'Looking for a quiet weekend plan.',
      createdAt: new Date(Date.now() - (index + 1) * 1000 * 60 * 18)
    }))
  );
  const [storyComposerVisible, setStoryComposerVisible] = useState(false);
  const [storyDraft, setStoryDraft] = useState('');
  const [activeStory, setActiveStory] = useState<StoryItem | null>(null);
  const [inboxThreads, setInboxThreads] = useState<InboxThread[]>(() =>
    candidates.map((item, index) => ({
      id: `thread-${item.id}`,
      candidate: item,
      unread: index === 2,
      messages: [
        {
          id: `thread-${item.id}-opener`,
          sender: 'match',
          body: item.prompt,
          sentAt: new Date(Date.now() - (index + 1) * 1000 * 60 * 42)
        }
      ]
    }))
  );
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [inboxDraft, setInboxDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const matchCompleteRef = useRef(false);
  const returnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matchWindowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEndingRef = useRef(false);
  const liveQueueUnsubscribeRef = useRef<null | (() => void)>(null);
  const liveMessagesUnsubscribeRef = useRef<null | (() => void)>(null);
  const liveStateUnsubscribeRef = useRef<null | (() => void)>(null);
  const timerWiggle = useRef(new Animated.Value(0)).current;

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
    return () => {
      clearLiveSubscriptions();
      clearReturnTimer();
      clearMatchWindowTimer();
      onChattingStateChange?.(false);
    };
  }, [onChattingStateChange]);

  useEffect(() => {
    if (status !== 'active' || !matchEndsAtMs) {
      return undefined;
    }

    function syncTimer() {
      const nextSecondsLeft = Math.max(0, Math.ceil(((matchEndsAtMs ?? Date.now()) - Date.now()) / 1000));
      setSecondsLeft(nextSecondsLeft);

      if (nextSecondsLeft <= 0) {
        expireMatch();
      }
    }

    syncTimer();
    const interval = setInterval(() => {
      syncTimer();
    }, 1000);

    return () => clearInterval(interval);
  }, [matchEndsAtMs, status]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  useEffect(() => {
    if (status !== 'active' || secondsLeft > 59 || secondsLeft <= 0) {
      timerWiggle.setValue(0);
      return;
    }

    timerWiggle.stopAnimation(() => {
      timerWiggle.setValue(0);
      Animated.sequence([
        Animated.timing(timerWiggle, { toValue: 1, duration: 70, useNativeDriver: true }),
        Animated.timing(timerWiggle, { toValue: -1, duration: 70, useNativeDriver: true }),
        Animated.timing(timerWiggle, { toValue: 1, duration: 70, useNativeDriver: true }),
        Animated.timing(timerWiggle, { toValue: 0, duration: 70, useNativeDriver: true })
      ]).start();
    });
  }, [secondsLeft, status, timerWiggle]);

  const timerTone = useMemo(() => {
    if (secondsLeft <= 59) {
      return colors.danger;
    }

    if (secondsLeft <= 45) {
      return colors.warn;
    }

    return colors.accent;
  }, [secondsLeft]);
  const timerWiggleRotation = timerWiggle.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-2deg', '0deg', '2deg']
  });
  const activeThread = inboxThreads.find((thread) => thread.id === activeThreadId) ?? null;

  function clearLiveSubscriptions() {
    liveQueueUnsubscribeRef.current?.();
    liveMessagesUnsubscribeRef.current?.();
    liveStateUnsubscribeRef.current?.();
    liveQueueUnsubscribeRef.current = null;
    liveMessagesUnsubscribeRef.current = null;
    liveStateUnsubscribeRef.current = null;
  }

  function clearReturnTimer() {
    if (returnTimerRef.current) {
      clearTimeout(returnTimerRef.current);
      returnTimerRef.current = null;
    }
  }

  function clearMatchWindowTimer() {
    if (matchWindowTimerRef.current) {
      clearTimeout(matchWindowTimerRef.current);
      matchWindowTimerRef.current = null;
    }
  }

  function scheduleReturnToMatching(notice: string) {
    clearReturnTimer();
    returnTimerRef.current = setTimeout(() => {
      resetToIdle(notice);
    }, RETURN_TO_MATCHING_DELAY_MS);
  }

  function showFoundMatch(session: MessageMatchSession, isLive: boolean) {
    clearMatchWindowTimer();
    setMatchWindowCandidate(session.candidate);
    setMatchWindowStage('found');
    setSearchMessage('You find a match');

    matchWindowTimerRef.current = setTimeout(() => {
      setMatchWindowVisible(false);
      setMatchWindowCandidate(null);
      startMatchedSession(session, isLive);
    }, 1100);
  }

  function showNoMatchFound() {
    clearLiveSubscriptions();
    setSearchMessage('No match found try again');
    setHomeNotice('No match found try again');
    setMessages([]);
    setMatchWindowCandidate(null);
    setMatchWindowStage('none');

    clearMatchWindowTimer();
    matchWindowTimerRef.current = setTimeout(() => {
      setMatchWindowVisible(false);
      setStatus('idle');
      setSearchMessage(null);
    }, 1200);
  }

  function startMatchedSession(session: MessageMatchSession, isLive: boolean) {
    const next = session.candidate;
    const endsAtMs = session.endsAt.getTime();

    clearReturnTimer();
    isEndingRef.current = false;
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
    setMatchEndsAtMs(endsAtMs);
    setSecondsLeft(Math.max(0, Math.ceil((endsAtMs - Date.now()) / 1000)));
    setSearchMessage(null);
    setMatchWindowVisible(false);
    setMatchWindowCandidate(null);
    setHomeNotice(null);
    setStatus('active');

    if (!isLive) {
      setLiveMatchId(null);
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
      return;
    }

    setLiveMatchId(session.id);
    liveMessagesUnsubscribeRef.current = subscribeLiveMessages(
      session.id,
      setMessages,
      (message) => Alert.alert('Live chat issue', message)
    );
    liveStateUnsubscribeRef.current = subscribeLiveMatchState(
      session.id,
      (state) => {
        setSavedByMe(state.savedByMe);
        setSavedByMatch(state.savedByMatch);
        setMatchEndsAtMs(state.endsAtMs);

        if (state.status !== 'active') {
          endMatchFromServer(state.status);
        }
      },
      (message) => Alert.alert('Live match issue', message)
    );
  }

  function findChat() {
    clearLiveSubscriptions();
    clearReturnTimer();
    clearMatchWindowTimer();
    isEndingRef.current = false;
    setStatus('searching');
    setCandidate(null);
    setLiveMatchId(null);
    setMatchEndsAtMs(null);
    setSearchMessage('Finding someone');
    setMatchWindowVisible(true);
    setMatchWindowStage('finding');
    setMatchWindowCandidate(null);
    setHomeNotice(null);
    setMessages([
      {
        id: 'searching-real',
        sender: 'system',
        body: 'Finding someone',
        sentAt: new Date()
      }
    ]);
    matchWindowTimerRef.current = setTimeout(() => {
      showNoMatchFound();
    }, NO_MATCH_TIMEOUT_MS);

    liveQueueUnsubscribeRef.current = startLiveMessageMatching(profile, {
      onWaiting(message) {
        setSearchMessage(message);
        setMessages([
          {
            id: 'waiting-real',
            sender: 'system',
            body: message,
            sentAt: new Date()
          }
        ]);
      },
      onMatched(session) {
        liveQueueUnsubscribeRef.current = null;
        showFoundMatch(session, true);
      },
      onError(message) {
        clearMatchWindowTimer();
        setMatchWindowVisible(false);
        setMatchWindowCandidate(null);
        setStatus('idle');
        setSearchMessage(null);
        setHomeNotice(message);
        setMessages([]);
        Alert.alert('Real matching setup needed', message);
      }
    });
  }

  function expireMatch() {
    if (isEndingRef.current) {
      return;
    }

    isEndingRef.current = true;

    setStatus((current) => {
      if (current !== 'active') {
        return current;
      }

      clearLiveSubscriptions();

      if (liveMatchId) {
        void closeLiveMessageMatch(liveMatchId, matchCompleteRef.current ? 'saved' : 'expired');
      } else if (matchCompleteRef.current && candidate) {
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

      scheduleReturnToMatching(
        matchCompleteRef.current
          ? 'Last chat ended. You both saved the match.'
          : 'Last 2-minute chat ended automatically.'
      );

      return matchCompleteRef.current ? 'saved' : 'expired';
    });
  }

  function endMatchFromServer(serverStatus: 'active' | 'expired' | 'saved' | 'blocked') {
    if (serverStatus === 'active' || isEndingRef.current) {
      return;
    }

    isEndingRef.current = true;
    clearLiveSubscriptions();

    const nextStatus = serverStatus === 'saved' ? 'saved' : 'expired';
    const body =
      serverStatus === 'blocked'
        ? 'This chat was ended by a block action. Returning to matching.'
        : serverStatus === 'saved'
          ? 'The 2-minute chat ended and both people saved the match. Returning to matching.'
          : 'The 2-minute chat ended automatically. Returning to matching.';

    setMessages((current) => [
      ...current,
      {
        id: `server-ended-${Date.now()}`,
        sender: 'system',
        body,
        sentAt: new Date()
      }
    ]);
    setStatus(nextStatus);
    scheduleReturnToMatching(
      serverStatus === 'saved'
        ? 'Last chat ended. You both saved the match.'
        : serverStatus === 'blocked'
          ? 'That member was blocked. You will not match with them again.'
          : 'Last 2-minute chat ended automatically.'
    );
  }

  async function refreshSavedMatches() {
    const matches = await appServices.savedMatches.list(profile);
    setSavedMatches(matches);
  }

  async function sendMessage() {
    const text = draft.trim();

    if (!text || status !== 'active') {
      return;
    }

    if (liveMatchId) {
      setDraft('');

      try {
        await sendLiveMessage(liveMatchId, text);
      } catch {
        Alert.alert('Message not sent', 'Live chat could not send this message yet.');
        setDraft(text);
      }
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

  function resetToIdle(notice?: string) {
    clearReturnTimer();
    clearLiveSubscriptions();
    isEndingRef.current = false;
    setStatus('idle');
    setCandidate(null);
    setMessages([]);
    setSecondsLeft(MATCH_SECONDS);
    setSavedByMe(false);
    setSavedByMatch(false);
    setLiveMatchId(null);
    setMatchEndsAtMs(null);
    setSearchMessage(null);
    setMatchWindowVisible(false);
    setMatchWindowCandidate(null);
    setHomeNotice(notice ?? null);
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

    if (liveMatchId) {
      void recordLiveMessageSafety(liveMatchId, kind === 'reported' ? 'report' : 'block');
    }

    isEndingRef.current = true;
    clearLiveSubscriptions();

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
    scheduleReturnToMatching(
      kind === 'blocked'
        ? 'That member was blocked. You will not match with them again.'
        : 'Thanks for reporting. The chat was closed.'
    );
  }

  function publishStory() {
    const text = storyDraft.trim();

    if (!text) {
      Alert.alert('Story is empty', 'Write a short story first.');
      return;
    }

    const nextStory: StoryItem = {
      id: `story-${profile.id}-${Date.now()}`,
      nickname: profile.nickname,
      photoUrl: profile.avatarUrl,
      text,
      createdAt: new Date(),
      mine: true
    };

    setStories((current) => [nextStory, ...current]);
    setStoryDraft('');
    setStoryComposerVisible(false);
    setActiveStory(nextStory);
  }

  function openInboxThread(threadId: string) {
    setActiveThreadId(threadId);
    setInboxDraft('');
    setInboxThreads((current) =>
      current.map((thread) => (thread.id === threadId ? { ...thread, unread: false } : thread))
    );
  }

  function sendInboxMessage() {
    const text = inboxDraft.trim();
    const targetThreadId = activeThreadId;

    if (!text || !targetThreadId) {
      return;
    }

    setInboxThreads((current) =>
      current.map((thread) =>
        thread.id === targetThreadId
          ? {
              ...thread,
              messages: [
                ...thread.messages,
                {
                  id: `thread-${targetThreadId}-me-${Date.now()}`,
                  sender: 'me',
                  body: text,
                  sentAt: new Date()
                }
              ]
            }
          : thread
      )
    );
    setInboxDraft('');
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, darkMode && styles.rootDark]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <MatchSearchWindow
        visible={matchWindowVisible}
        stage={matchWindowStage}
        candidate={matchWindowCandidate}
        darkMode={darkMode}
      />
      <StoryComposerModal
        visible={storyComposerVisible}
        value={storyDraft}
        darkMode={darkMode}
        onChange={setStoryDraft}
        onClose={() => setStoryComposerVisible(false)}
        onPublish={publishStory}
      />
      <StoryViewerModal
        story={activeStory}
        darkMode={darkMode}
        onClose={() => setActiveStory(null)}
      />
      <InboxThreadModal
        thread={activeThread}
        draft={inboxDraft}
        darkMode={darkMode}
        onDraftChange={setInboxDraft}
        onSend={sendInboxMessage}
        onClose={() => {
          setActiveThreadId(null);
          setInboxDraft('');
        }}
      />
      {status === 'idle' || status === 'searching' ? (
        <ScrollView contentContainerStyle={styles.chatHome}>
          <View style={styles.topBar}>
            <View>
              <AppText style={[styles.screenTitle, darkMode && styles.textOnDark]}>KaTalk</AppText>
            </View>
            <PressableScale accessibilityRole="button" style={[styles.roundIcon, darkMode && styles.roundIconDark]}>
              <Ionicons name="search-outline" size={21} color={darkMode ? colors.onAccent : colors.ink} />
            </PressableScale>
          </View>

          <View style={styles.sectionHeader}>
            <AppText style={[styles.sectionTitleSmall, darkMode && styles.textOnDark]}>Story</AppText>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyRow}>
            <PressableScale
              accessibilityRole="button"
              onPress={() => setStoryComposerVisible(true)}
              style={styles.storyItem}
            >
              <View style={[styles.addStory, darkMode && styles.softSurfaceDark]}>
                <Ionicons name="add" size={24} color={darkMode ? colors.onAccent : colors.ink} />
              </View>
              <AppText style={[styles.storyName, darkMode && styles.textOnDark]}>Add Story</AppText>
            </PressableScale>
            {stories.map((item) => (
              <PressableScale
                key={item.id}
                accessibilityRole="button"
                onPress={() => setActiveStory(item)}
                style={styles.storyItem}
              >
                {item.photoUrl ? (
                  <Image source={{ uri: item.photoUrl }} style={[styles.storyImage, item.mine && styles.myStoryImage]} />
                ) : (
                  <View style={[styles.storyImageFallback, item.mine && styles.myStoryImage]}>
                    <Ionicons name="person" size={22} color={colors.onAccent} />
                  </View>
                )}
                <AppText style={[styles.storyName, darkMode && styles.textOnDark]} numberOfLines={1}>
                  {item.mine ? 'Your story' : item.nickname}
                </AppText>
              </PressableScale>
            ))}
          </ScrollView>

          <View style={[styles.featureMatch, darkMode && styles.cardDark]}>
            <View>
              <AppText style={[styles.featureTitle, darkMode && styles.textOnDark]}>Ready for a real match?</AppText>
              <AppText style={[styles.featureCopy, darkMode && styles.mutedOnDark]}>
                Connect with another KaTalk member. Chat ends automatically after 2 minutes.
              </AppText>
            </View>
            {homeNotice ? (
              <View style={styles.homeNotice}>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
                <AppText style={styles.homeNoticeText}>{homeNotice}</AppText>
              </View>
            ) : null}
            {searchMessage ? (
              <View style={[styles.matchStatusRow, darkMode && styles.softSurfaceDark]}>
                {status === 'searching' ? <ActivityIndicator size="small" color={colors.accent} /> : null}
                <AppText style={styles.matchStatusText}>{searchMessage}</AppText>
              </View>
            ) : null}
            <PrimaryButton
              label={status === 'searching' ? 'Finding...' : 'Find Chat'}
              icon="chatbubble-outline"
              disabled={status === 'searching'}
              onPress={findChat}
              style={styles.findButton}
            />
          </View>

          <View style={styles.sectionHeader}>
            <AppText style={[styles.sectionTitleSmall, darkMode && styles.textOnDark]}>Chat</AppText>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
          </View>
          <View style={styles.chatList}>
            {inboxThreads.map((thread, index) => (
              <PressableScale
                key={thread.id}
                accessibilityRole="button"
                onPress={() => openInboxThread(thread.id)}
                style={[styles.chatRow, darkMode && styles.chatRowDark]}
              >
                <Image source={{ uri: thread.candidate.photoUrl }} style={styles.chatAvatar} />
                <View style={styles.chatPreview}>
                  <AppText style={[styles.chatName, darkMode && styles.textOnDark]}>
                    {thread.candidate.nickname}
                  </AppText>
                  <AppText style={styles.chatSnippet} numberOfLines={1}>
                    {thread.messages[thread.messages.length - 1]?.body ?? thread.candidate.prompt}
                  </AppText>
                </View>
                <View style={styles.chatMeta}>
                  <AppText style={styles.chatTime}>
                    {index === 0 ? '11:43 am' : index === 1 ? '09:21 am' : 'Yesterday'}
                  </AppText>
                  {thread.unread ? (
                    <View style={styles.unreadDot} />
                  ) : index < 2 ? (
                    <Ionicons name="checkmark-done" size={16} color={colors.accent} />
                  ) : null}
                </View>
              </PressableScale>
            ))}
          </View>

          {savedMatches.length > 0 ? (
            <View style={[styles.savedCard, darkMode && styles.cardDark]}>
              <AppText style={[styles.savedTitle, darkMode && styles.textOnDark]}>Saved matches</AppText>
              {savedMatches.map((match) => (
                <View key={match.id} style={styles.savedRow}>
                  <Image source={{ uri: match.candidate.photoUrl }} style={styles.savedAvatar} />
                  <View style={styles.savedInfo}>
                    <AppText style={[styles.savedName, darkMode && styles.textOnDark]}>Anonymous saved match</AppText>
                    <AppText style={styles.savedMeta}>
                      {match.candidate.interests.join(' / ')}
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
          <View style={[styles.matchHeader, darkMode && styles.matchHeaderDark]}>
            <Image source={{ uri: candidate.photoUrl }} style={styles.avatarImage} />
            <View style={styles.matchInfo}>
              <AppText style={[styles.matchName, darkMode && styles.textOnDark]}>Anonymous match</AppText>
              <AppText style={styles.matchMeta}>
                {candidate.interests.join(' / ')}
              </AppText>
            </View>
            <Animated.View
              style={[
                styles.timerPill,
                {
                  borderColor: timerTone,
                  transform: [{ rotate: timerWiggleRotation }]
                }
              ]}
            >
              <Ionicons name="timer-outline" size={17} color={timerTone} />
              <AppText style={[styles.timerText, { color: timerTone }]}>
                {formatTimer(secondsLeft)}
              </AppText>
            </Animated.View>
          </View>

          <ScrollView ref={scrollRef} contentContainerStyle={styles.messages}>
            {messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.bubble,
                  darkMode && styles.bubbleDark,
                  message.sender === 'me' && styles.myBubble,
                  message.sender === 'system' && styles.systemBubble,
                  darkMode && message.sender === 'system' && styles.systemBubbleDark
                ]}
              >
                <AppText
                  style={[
                    styles.bubbleText,
                    darkMode && message.sender !== 'me' && styles.bubbleTextDark,
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
            <View style={[styles.actionPanel, darkMode && styles.actionPanelDark]}>
              <View style={styles.quickActions}>
                <PrimaryButton
                  label={savedByMe ? 'Saved' : 'Save'}
                  icon="heart-outline"
                  variant="secondary"
                  onPress={() => {
                    if (liveMatchId) {
                      void saveLiveMessageMatch(liveMatchId).catch(() =>
                        Alert.alert('Save failed', 'Could not save this live match yet.')
                      );
                      return;
                    }

                    setSavedByMe(true);
                  }}
                  style={styles.quickButton}
                />
                <PrimaryButton
                  label="Block"
                  icon="ban-outline"
                  variant="danger"
                  onPress={() => confirmReportOrBlock('blocked')}
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
              <View style={[styles.inputRow, darkMode && styles.inputRowDark]}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Send a calm message"
                  placeholderTextColor={colors.muted}
                  style={[styles.input, darkMode && styles.inputDark]}
                  multiline
                />
                <PressableScale accessibilityRole="button" onPress={sendMessage} style={styles.sendButton}>
                  <Ionicons name="send" size={20} color={colors.onAccent} />
                </PressableScale>
              </View>
            </View>
          ) : (
            <View style={[styles.endedPanel, darkMode && styles.actionPanelDark]}>
              <AppText style={[styles.endedTitle, darkMode && styles.textOnDark]}>
                {status === 'saved' ? 'Saved match' : 'Chat ended'}
              </AppText>
              <AppText style={[styles.endedCopy, darkMode && styles.mutedOnDark]}>
                {status === 'saved'
                  ? 'Both people saved before the timer ended. Returning to matching.'
                  : 'The chat closed automatically after 2 minutes. Returning to matching.'}
              </AppText>
              <PrimaryButton label="Back To Matching" icon="refresh-outline" onPress={() => resetToIdle()} />
            </View>
          )}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function MatchSearchWindow({
  visible,
  stage,
  candidate,
  darkMode
}: {
  visible: boolean;
  stage: 'finding' | 'found' | 'none';
  candidate: Candidate | null;
  darkMode: boolean;
}) {
  const isFound = stage === 'found';
  const isNone = stage === 'none';

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.matchWindowOverlay}>
        <View style={[styles.matchWindowCard, darkMode && styles.cardDark]}>
          <View
            style={[
              styles.matchWindowAvatar,
              isFound && styles.matchWindowAvatarFound,
              isNone && styles.matchWindowAvatarNone
            ]}
          >
            {candidate?.photoUrl ? (
              <Image source={{ uri: candidate.photoUrl }} style={styles.matchWindowImage} />
            ) : (
              <Ionicons
                name={isNone ? 'search-outline' : 'person-circle-outline'}
                size={64}
                color={isFound ? colors.onAccent : colors.accent}
              />
            )}
          </View>
          <AppText style={[styles.matchWindowTitle, darkMode && styles.textOnDark]}>
            {isNone ? 'No match found try again' : isFound ? 'You find a match' : 'Finding someone'}
          </AppText>
          <AppText style={[styles.matchWindowCopy, darkMode && styles.mutedOnDark]}>
            {isNone
              ? 'Nobody is available right now.'
              : isFound
                ? 'Opening your private inbox now.'
                : 'Please wait while KaTalk looks for someone available.'}
          </AppText>
          {!isFound && !isNone ? <ActivityIndicator size="small" color={colors.accent} /> : null}
        </View>
      </View>
    </Modal>
  );
}

function StoryComposerModal({
  visible,
  value,
  darkMode,
  onChange,
  onClose,
  onPublish
}: {
  visible: boolean;
  value: string;
  darkMode: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onPublish: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.socialModalOverlay}>
        <PressableScale accessibilityRole="button" onPress={onClose} style={styles.socialModalBackdrop} />
        <View style={[styles.storyComposerCard, darkMode && styles.cardDark]}>
          <View style={styles.socialModalHeader}>
            <AppText style={[styles.socialModalTitle, darkMode && styles.textOnDark]}>Create story</AppText>
            <PressableScale accessibilityRole="button" onPress={onClose} style={[styles.socialCloseButton, darkMode && styles.roundIconDark]}>
              <Ionicons name="close-outline" size={21} color={darkMode ? colors.onAccent : colors.ink} />
            </PressableScale>
          </View>
          <TextInput
            value={value}
            onChangeText={onChange}
            placeholder="Share a quick mood, plan, or thought"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={180}
            style={[styles.storyInput, darkMode && styles.storyInputDark]}
          />
          <View style={styles.storyComposerFooter}>
            <AppText style={styles.storyCount}>{value.length}/180</AppText>
            <PrimaryButton
              label="Post story"
              icon="sparkles-outline"
              disabled={!value.trim()}
              onPress={onPublish}
              style={styles.storyPublishButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function StoryViewerModal({
  story,
  darkMode,
  onClose
}: {
  story: StoryItem | null;
  darkMode: boolean;
  onClose: () => void;
}) {
  return (
    <Modal transparent visible={Boolean(story)} animationType="fade" onRequestClose={onClose}>
      <View style={styles.socialModalOverlay}>
        <PressableScale accessibilityRole="button" onPress={onClose} style={styles.socialModalBackdrop} />
        {story ? (
          <View style={[styles.storyViewerCard, darkMode && styles.cardDark]}>
            <View style={styles.storyViewerTop}>
              {story.photoUrl ? (
                <Image source={{ uri: story.photoUrl }} style={styles.storyViewerAvatar} />
              ) : (
                <View style={styles.storyViewerAvatarFallback}>
                  <Ionicons name="person" size={23} color={colors.onAccent} />
                </View>
              )}
              <View style={styles.storyViewerCopy}>
                <AppText style={[styles.storyViewerName, darkMode && styles.textOnDark]}>{story.nickname}</AppText>
                <AppText style={styles.storyViewerTime}>
                  {story.mine ? 'Just now' : story.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </AppText>
              </View>
              <PressableScale accessibilityRole="button" onPress={onClose} style={[styles.socialCloseButton, darkMode && styles.roundIconDark]}>
                <Ionicons name="close-outline" size={21} color={darkMode ? colors.onAccent : colors.ink} />
              </PressableScale>
            </View>
            <View style={styles.storyTextPanel}>
              <AppText style={styles.storyViewerText}>{story.text}</AppText>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function InboxThreadModal({
  thread,
  draft,
  darkMode,
  onDraftChange,
  onSend,
  onClose
}: {
  thread: InboxThread | null;
  draft: string;
  darkMode: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
}) {
  return (
    <Modal transparent visible={Boolean(thread)} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.inboxModalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <PressableScale accessibilityRole="button" onPress={onClose} style={styles.socialModalBackdrop} />
        {thread ? (
          <View style={[styles.inboxSheet, darkMode && styles.cardDark]}>
            <View style={styles.inboxHeader}>
              <Image source={{ uri: thread.candidate.photoUrl }} style={styles.inboxAvatar} />
              <View style={styles.inboxTitleBlock}>
                <AppText style={[styles.inboxName, darkMode && styles.textOnDark]}>{thread.candidate.nickname}</AppText>
                <AppText style={styles.inboxMeta}>Saved-message preview</AppText>
              </View>
              <PressableScale accessibilityRole="button" onPress={onClose} style={[styles.socialCloseButton, darkMode && styles.roundIconDark]}>
                <Ionicons name="close-outline" size={21} color={darkMode ? colors.onAccent : colors.ink} />
              </PressableScale>
            </View>

            <ScrollView contentContainerStyle={styles.inboxMessages}>
              {thread.messages.map((message) => (
                <View
                  key={message.id}
                  style={[
                    styles.inboxBubble,
                    darkMode && styles.bubbleDark,
                    message.sender === 'me' && styles.inboxBubbleMine
                  ]}
                >
                  <AppText
                    style={[
                      styles.inboxBubbleText,
                      darkMode && message.sender !== 'me' && styles.bubbleTextDark,
                      message.sender === 'me' && styles.myBubbleText
                    ]}
                  >
                    {message.body}
                  </AppText>
                </View>
              ))}
            </ScrollView>

            <View style={[styles.inboxInputRow, darkMode && styles.inputRowDark]}>
              <TextInput
                value={draft}
                onChangeText={onDraftChange}
                placeholder="Write a message"
                placeholderTextColor={colors.muted}
                multiline
                style={[styles.inboxInput, darkMode && styles.inputDark]}
              />
              <PressableScale
                accessibilityRole="button"
                disabled={!draft.trim()}
                onPress={onSend}
                style={[styles.inboxSendButton, !draft.trim() && styles.inboxSendButtonDisabled]}
              >
                <Ionicons name="send" size={19} color={colors.onAccent} />
              </PressableScale>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface
  },
  rootDark: {
    backgroundColor: '#101217'
  },
  textOnDark: {
    color: colors.onAccent
  },
  mutedOnDark: {
    color: '#BBC1CC'
  },
  cardDark: {
    borderColor: '#2A2E38',
    backgroundColor: '#171A22'
  },
  softSurfaceDark: {
    borderColor: '#2A2E38',
    backgroundColor: '#222735'
  },
  matchWindowOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(16, 17, 20, 0.38)'
  },
  matchWindowCard: {
    width: '100%',
    maxWidth: 320,
    minHeight: 260,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.surface
  },
  matchWindowAvatar: {
    width: 94,
    height: 94,
    borderRadius: 47,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.accentSoft
  },
  matchWindowAvatarFound: {
    backgroundColor: colors.accent
  },
  matchWindowAvatarNone: {
    backgroundColor: colors.surfaceMuted
  },
  matchWindowImage: {
    width: '100%',
    height: '100%'
  },
  matchWindowTitle: {
    marginTop: 4,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
    textAlign: 'center'
  },
  matchWindowCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center'
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
  roundIconDark: {
    borderColor: '#2A2E38',
    backgroundColor: '#222735'
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
  myStoryImage: {
    borderColor: '#8B6AF2'
  },
  storyImageFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
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
  homeNotice: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EAF8F0'
  },
  homeNoticeText: {
    flex: 1,
    color: colors.success,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800'
  },
  matchStatusRow: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.line
  },
  matchStatusText: {
    flex: 1,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800'
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
  chatRowDark: {
    borderBottomColor: '#2A2E38'
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
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.accent
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
  matchHeaderDark: {
    borderBottomColor: '#2A2E38',
    backgroundColor: '#171A22'
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
  bubbleDark: {
    borderColor: '#2A2E38',
    backgroundColor: '#171A22'
  },
  myBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent
  },
  systemBubble: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceMuted
  },
  systemBubbleDark: {
    backgroundColor: '#222735'
  },
  bubbleText: {
    color: colors.ink
  },
  bubbleTextDark: {
    color: colors.onAccent
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
  actionPanelDark: {
    borderTopColor: '#2A2E38',
    backgroundColor: '#171A22'
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
  inputRowDark: {
    backgroundColor: '#171A22'
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
  inputDark: {
    borderColor: '#2A2E38',
    backgroundColor: '#222735',
    color: colors.onAccent
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
  },
  socialModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 18
  },
  socialModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16, 17, 20, 0.42)'
  },
  storyComposerCard: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: 12,
    borderRadius: 22,
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line
  },
  socialModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  socialModalTitle: {
    fontSize: 19,
    fontWeight: '900'
  },
  socialCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted
  },
  storyInput: {
    minHeight: 130,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    backgroundColor: colors.surfaceMuted,
    textAlignVertical: 'top',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700'
  },
  storyInputDark: {
    color: colors.onAccent,
    backgroundColor: '#222735'
  },
  storyComposerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  storyCount: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800'
  },
  storyPublishButton: {
    minWidth: 132
  },
  storyViewerCard: {
    width: '100%',
    maxWidth: 390,
    minHeight: 360,
    alignSelf: 'center',
    gap: 16,
    borderRadius: 26,
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line
  },
  storyViewerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  storyViewerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22
  },
  storyViewerAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  storyViewerCopy: {
    flex: 1
  },
  storyViewerName: {
    fontWeight: '900'
  },
  storyViewerTime: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  storyTextPanel: {
    flex: 1,
    minHeight: 230,
    borderRadius: 22,
    padding: 18,
    justifyContent: 'center',
    backgroundColor: '#8B6AF2'
  },
  storyViewerText: {
    color: colors.onAccent,
    fontSize: 25,
    lineHeight: 32,
    fontWeight: '900',
    textAlign: 'center'
  },
  inboxModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  inboxSheet: {
    maxHeight: '82%',
    minHeight: 420,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 14,
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line
  },
  inboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  inboxAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22
  },
  inboxTitleBlock: {
    flex: 1
  },
  inboxName: {
    fontSize: 16,
    fontWeight: '900'
  },
  inboxMeta: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  inboxMessages: {
    flexGrow: 1,
    paddingVertical: 10,
    gap: 8
  },
  inboxBubble: {
    maxWidth: '86%',
    alignSelf: 'flex-start',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: colors.surfaceMuted
  },
  inboxBubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent
  },
  inboxBubbleText: {
    color: colors.ink,
    fontWeight: '700'
  },
  inboxInputRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line
  },
  inboxInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 92,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    backgroundColor: colors.surfaceMuted
  },
  inboxSendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  inboxSendButtonDisabled: {
    opacity: 0.45
  }
});
