import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  ImageBackground,
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
import { MemberAvatar } from '../components/MemberAvatar';
import { PrimaryButton } from '../components/PrimaryButton';
import { PressableScale } from '../components/PressableScale';
import type { MessageMatchSession, SavedMatch } from '../services/contracts';
import {
  closeLiveMessageMatch,
  recordLiveMessageSafety,
  saveLiveMessageMatch,
  sendLiveMessage,
  sendSavedMatchMessage,
  startLiveMessageMatching,
  subscribeLiveMatchState,
  subscribeLiveMessages,
  subscribeSavedMatchMessages
} from '../services/liveMessageMatchService';
import { appServices } from '../services/localAppServices';
import { registeredMemberErrorMessage } from '../services/registeredUserService';
import { normalizeUserEconomy, recordConversationStarted } from '../services/userFeatureService';
import {
  createPublicStory,
  subscribePublicStories,
  storyErrorMessage,
  type PublicStory
} from '../services/storyService';
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
  onProfileUpdate?: (profile: UserProfile) => void;
};

type InboxThread = {
  id: string;
  candidate: Candidate;
  messages: Message[];
  unread: boolean;
};

function friendlyMemberNotice(message: string) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('permission denied') || lowerMessage.includes('row level security')) {
    return 'Real member stories are still syncing. They will appear here after the app database access is ready.';
  }

  return message;
}

function profileAgeFallback(profile: UserProfile) {
  const preferredAge = Number.parseInt(profile.ageRange, 10);

  return Number.isFinite(preferredAge) ? preferredAge : 24;
}

function buildProfilePrompt(member: Candidate) {
  return member.prompt || 'Looking for calm conversations, shared interests, and real connection.';
}

function buildConnectionStarter(member: Candidate): Message[] {
  const now = Date.now();

  return [
    {
      id: `connection-system-${member.id}`,
      sender: 'system',
      body: `You matched with ${member.nickname} today`,
      sentAt: new Date(now - 90 * 1000)
    },
    {
      id: `connection-match-${member.id}-1`,
      sender: 'match',
      body: `Hey, I liked your vibe. ${buildProfilePrompt(member)}`,
      sentAt: new Date(now - 60 * 1000)
    },
    {
      id: `connection-me-${member.id}-1`,
      sender: 'me',
      body: 'Hi! Nice to meet you here.',
      sentAt: new Date(now - 40 * 1000)
    }
  ];
}

export function MessageMatchScreen({
  profile,
  darkMode = false,
  onChattingStateChange,
  onProfileUpdate
}: Props) {
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
  const [stories, setStories] = useState<PublicStory[]>([]);
  const [storyComposerVisible, setStoryComposerVisible] = useState(false);
  const [storyDraft, setStoryDraft] = useState('');
  const [activeStory, setActiveStory] = useState<PublicStory | null>(null);
  const [inboxThreads, setInboxThreads] = useState<InboxThread[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [memberLoadNotice, setMemberLoadNotice] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [inboxDraft, setInboxDraft] = useState('');
  const [activeSavedMatch, setActiveSavedMatch] = useState<SavedMatch | null>(null);
  const [savedChatMessages, setSavedChatMessages] = useState<Message[]>([]);
  const [savedChatDraft, setSavedChatDraft] = useState('');
  const [profilePreviewMember, setProfilePreviewMember] = useState<Candidate | null>(null);
  const [connectionMember, setConnectionMember] = useState<Candidate | null>(null);
  const [connectionMessages, setConnectionMessages] = useState<Message[]>([]);
  const [connectionDraft, setConnectionDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const matchCompleteRef = useRef(false);
  const returnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matchWindowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEndingRef = useRef(false);
  const liveQueueUnsubscribeRef = useRef<null | (() => void)>(null);
  const liveMessagesUnsubscribeRef = useRef<null | (() => void)>(null);
  const liveStateUnsubscribeRef = useRef<null | (() => void)>(null);
  const savedChatUnsubscribeRef = useRef<null | (() => void)>(null);
  const timerWiggle = useRef(new Animated.Value(0)).current;

  const matchComplete = savedByMe && savedByMatch;
  const aiMatchPercent = Math.min(96, 86 + Math.min(profile.interests.length, 5) * 2);
  const economy = normalizeUserEconomy(profile.economy);
  const insightMetrics = [
    { label: 'Values', value: Math.min(98, aiMatchPercent + 1) },
    { label: 'Communication', value: Math.max(82, aiMatchPercent - 1) },
    { label: 'Lifestyle', value: Math.max(80, aiMatchPercent - 3) },
    { label: 'Interests', value: Math.min(99, aiMatchPercent + 3) }
  ];
  const dailyMatchPreview = inboxThreads.slice(0, 4);
  const featuredDiscoverMember = inboxThreads[0]?.candidate ?? savedMatches[0]?.candidate ?? null;
  const profileHomeMember = useMemo<Candidate>(
    () => ({
      id: profile.id,
      nickname: profile.nickname || 'KaTalk member',
      age: profileAgeFallback(profile),
      distanceMiles: 0,
      interests: profile.interests.length > 0 ? profile.interests : ['Coffee', 'Travel', 'Dogs'],
      prompt: `Looking for ${profile.preference.toLowerCase()} with easy conversation and real energy.`,
      avatarColor: colors.accent,
      photoUrl: profile.avatarUrl
    }),
    [profile.ageRange, profile.avatarUrl, profile.id, profile.interests, profile.nickname, profile.preference]
  );
  const homeFeatureMember = featuredDiscoverMember ?? profileHomeMember;
  const feedPhotoUrl = homeFeatureMember.photoUrl ?? profile.avatarUrl;
  const homeFeatureInterests =
    homeFeatureMember.interests.length > 0 ? homeFeatureMember.interests : ['Coffee', 'Travel', 'Dogs'];

  useEffect(() => {
    matchCompleteRef.current = matchComplete;
  }, [matchComplete]);

  useEffect(() => {
    void refreshSavedMatches();
    void refreshRegisteredMembers();
  }, [profile.id]);

  useEffect(() => {
    const unsubscribe = subscribePublicStories(
      profile,
      setStories,
      (message) => setMemberLoadNotice(message)
    );

    return unsubscribe;
  }, [profile.avatarUrl, profile.id, profile.nickname]);

  useEffect(() => {
    const interval = setInterval(() => {
      setStories((current) => current.filter((story) => story.expiresAt.getTime() > Date.now()));
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    onChattingStateChange?.(status === 'active');
  }, [onChattingStateChange, status]);

  useEffect(() => {
    return () => {
      clearLiveSubscriptions();
      clearSavedChatSubscription();
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

  function clearSavedChatSubscription() {
    savedChatUnsubscribeRef.current?.();
    savedChatUnsubscribeRef.current = null;
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
    onProfileUpdate?.(recordConversationStarted(profile));

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
        liveQueueUnsubscribeRef.current?.();
        liveQueueUnsubscribeRef.current = null;
        showFoundMatch(session, true);
      },
      onError(message) {
        clearLiveSubscriptions();
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
        void closeLiveMessageMatch(liveMatchId, matchCompleteRef.current ? 'saved' : 'expired').then((finalStatus) => {
          if (matchCompleteRef.current || finalStatus === 'saved') {
            void refreshSavedMatches();
          }
        });
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
    if (serverStatus === 'saved') {
      void refreshSavedMatches();
    }
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

  async function refreshRegisteredMembers() {
    setIsLoadingMembers(true);
    setMemberLoadNotice(null);

    try {
      const members = await appServices.nearby.list(profile);

      setInboxThreads(
        members.map((member) => ({
          id: `registered-${member.id}`,
          candidate: member,
          unread: false,
          messages: []
        }))
      );
    } catch (error) {
      setInboxThreads([]);
      setMemberLoadNotice(registeredMemberErrorMessage(error));
    } finally {
      setIsLoadingMembers(false);
    }
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

  async function publishStory() {
    const text = storyDraft.trim();

    if (!text) {
      Alert.alert('Story is empty', 'Write a short story first.');
      return;
    }

    try {
      const nextStory = await createPublicStory(profile, text);

      setStories((current) => [nextStory, ...current.filter((story) => story.id !== nextStory.id)]);
      setStoryDraft('');
      setStoryComposerVisible(false);
      setActiveStory(nextStory);
    } catch (error) {
      Alert.alert('Story not posted', storyErrorMessage(error));
    }
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

  function openSavedMatch(match: SavedMatch) {
    clearSavedChatSubscription();
    setActiveSavedMatch(match);
    setSavedChatMessages([]);
    setSavedChatDraft('');
    savedChatUnsubscribeRef.current = subscribeSavedMatchMessages(
      match.id,
      setSavedChatMessages,
      (message) => Alert.alert('Saved chat issue', message)
    );
  }

  function closeSavedMatchChat() {
    clearSavedChatSubscription();
    setActiveSavedMatch(null);
    setSavedChatMessages([]);
    setSavedChatDraft('');
  }

  async function sendSavedChatMessage() {
    const text = savedChatDraft.trim();
    const targetMatch = activeSavedMatch;

    if (!text || !targetMatch) {
      return;
    }

    setSavedChatDraft('');

    try {
      await sendSavedMatchMessage(targetMatch.id, text);
    } catch {
      Alert.alert('Message not sent', 'Saved chat could not send this message yet.');
      setSavedChatDraft(text);
    }
  }

  function likeDiscoverMember(member: Candidate) {
    setHomeNotice(`You liked ${member.nickname}. Open their profile or start a real match when you are ready.`);
  }

  function openMemberProfile(member: Candidate) {
    setProfilePreviewMember(member);
  }

  function openConnectionWindow(member: Candidate) {
    setProfilePreviewMember(null);
    setConnectionMember(member);
    setConnectionDraft('');
    setConnectionMessages(buildConnectionStarter(member));
    onProfileUpdate?.(recordConversationStarted(profile));
  }

  function sendConnectionPreviewMessage() {
    const text = connectionDraft.trim();

    if (!text || !connectionMember) {
      return;
    }

    setConnectionMessages((current) => [
      ...current,
      {
        id: `connection-me-${connectionMember.id}-${Date.now()}`,
        sender: 'me',
        body: text,
        sentAt: new Date()
      }
    ]);
    setConnectionDraft('');
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
      <SavedMatchChatModal
        match={activeSavedMatch}
        messages={savedChatMessages}
        draft={savedChatDraft}
        darkMode={darkMode}
        onDraftChange={setSavedChatDraft}
        onSend={sendSavedChatMessage}
        onClose={closeSavedMatchChat}
      />
      <MemberProfilePreviewModal
        member={profilePreviewMember}
        economy={economy}
        darkMode={darkMode}
        onClose={() => setProfilePreviewMember(null)}
        onLike={(member) => likeDiscoverMember(member)}
        onMessage={(member) => openConnectionWindow(member)}
      />
      <MemberConnectionModal
        member={connectionMember}
        messages={connectionMessages}
        draft={connectionDraft}
        economy={economy}
        darkMode={darkMode}
        onDraftChange={setConnectionDraft}
        onSend={sendConnectionPreviewMessage}
        onClose={() => {
          setConnectionMember(null);
          setConnectionDraft('');
        }}
      />
      {status === 'idle' || status === 'searching' ? (
        <ScrollView contentContainerStyle={styles.discoverHome} showsVerticalScrollIndicator={false}>
          <View style={styles.feedCard}>
            {feedPhotoUrl ? (
              <ImageBackground
                source={{ uri: feedPhotoUrl }}
                imageStyle={styles.feedImage}
                resizeMode="cover"
                style={styles.feedImageSurface}
              />
            ) : (
              <View style={styles.feedFallbackSurface}>
                <MemberAvatar
                  name={homeFeatureMember.nickname}
                  photoUrl={profile.avatarUrl}
                  color={homeFeatureMember.avatarColor}
                  size={118}
                  borderColor="rgba(255,255,255,0.22)"
                />
                <AppText style={styles.feedFallbackText}>
                  {isLoadingMembers
                    ? 'Loading registered members...'
                    : 'Registered members will appear here'}
                </AppText>
              </View>
            )}
            <View style={styles.feedShade} />
            <View style={styles.feedCardTop}>
              <AppText style={styles.feedTopLabel}>For You</AppText>
              <View style={styles.feedTopSpacer} />
              <View style={styles.feedCoinPillOverlay}>
                <Ionicons name="ellipse" size={9} color={colors.gold} />
                <AppText style={styles.feedCoinText}>{economy.coins.toLocaleString()}</AppText>
              </View>
            </View>
            <View style={styles.feedSideActions}>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Like profile"
                onPress={() => likeDiscoverMember(homeFeatureMember)}
                style={[styles.feedActionButton, styles.feedHeartButton]}
              >
                <Ionicons name="heart" size={23} color={colors.onAccent} />
              </PressableScale>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Open message preview"
                onPress={() => openConnectionWindow(homeFeatureMember)}
                style={styles.feedActionButton}
              >
                <Ionicons name="chatbubble-ellipses" size={20} color={colors.onAccent} />
              </PressableScale>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Open profile details"
                onPress={() => openMemberProfile(homeFeatureMember)}
                style={styles.feedActionButton}
              >
                <Ionicons name="person" size={21} color={colors.onAccent} />
              </PressableScale>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Share profile"
                onPress={() => Alert.alert('Share profile', `${homeFeatureMember.nickname}'s profile is ready to share inside KaTalk.`)}
                style={styles.feedActionButton}
              >
                <Ionicons name="arrow-redo" size={20} color={colors.onAccent} />
              </PressableScale>
            </View>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`Open ${homeFeatureMember.nickname}'s profile details`}
              onPress={() => openMemberProfile(homeFeatureMember)}
              style={styles.feedCardBottom}
            >
              <View style={styles.feedNameRow}>
                <AppText style={styles.feedName}>{`${homeFeatureMember.nickname}, ${homeFeatureMember.age}`}</AppText>
                <View style={styles.feedVerifiedDot}>
                  <AppText style={styles.feedVerifiedMark}>v</AppText>
                </View>
                <AppText style={styles.feedVerifiedText}>✓</AppText>
              </View>
              <View style={styles.feedMetaStack}>
                <View style={styles.feedMetaRow}>
                  <Ionicons name="camera-outline" size={13} color="#E7E2EA" />
                  <AppText style={styles.feedMeta}>Content Creator</AppText>
                </View>
                <View style={styles.feedMetaRow}>
                  <Ionicons name="location-outline" size={13} color="#E7E2EA" />
                  <AppText style={styles.feedMeta}>
                    {homeFeatureMember.distanceMiles > 0
                      ? `${homeFeatureMember.distanceMiles.toFixed(1)} km away`
                      : 'KaTalk member'}
                  </AppText>
                </View>
              </View>
              <View style={styles.feedInterestRow}>
                {homeFeatureInterests.slice(0, 3).map((interest) => (
                  <View key={interest} style={styles.feedInterestChip}>
                    <AppText style={styles.feedInterestText}>{interest}</AppText>
                  </View>
                ))}
              </View>
              {homeNotice ? (
                <View style={styles.feedNotice}>
                  <AppText style={styles.feedNoticeText}>{friendlyMemberNotice(homeNotice)}</AppText>
                </View>
              ) : null}
              {searchMessage ? (
                <View style={styles.feedNotice}>
                  {status === 'searching' ? <ActivityIndicator size="small" color={colors.accent} /> : null}
                  <AppText style={styles.feedNoticeText}>{searchMessage}</AppText>
                </View>
              ) : null}
            </PressableScale>
          </View>
        </ScrollView>
      ) : null}

      {candidate && (status === 'active' || status === 'expired' || status === 'saved') ? (
        <View style={styles.chatArea}>
          <View style={[styles.matchHeader, darkMode && styles.matchHeaderDark]}>
            <MemberAvatar
              name={candidate.nickname}
              photoUrl={candidate.photoUrl}
              color={candidate.avatarColor}
              size={46}
            />
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
              <AppText style={[styles.timerIconText, { color: timerTone }]}>T</AppText>
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
                <AppText style={styles.saveStatusMark}>Save</AppText>
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
                  <AppText style={styles.sendButtonText}>{'>'}</AppText>
                </PressableScale>
              </View>
            </View>
          ) : (
            <View style={[styles.endedPanel, darkMode && styles.actionPanelDark]}>
              {status === 'saved' ? (
                <>
                  <Ionicons name="sparkles" size={28} color={colors.gold} />
                  <AppText style={[styles.endedTitle, styles.matchConfirmTitle]}>
                    It's a Match!
                  </AppText>
                  <View style={styles.matchConfirmAvatars}>
                    <MemberAvatar
                      name={profile.nickname}
                      photoUrl={profile.avatarUrl}
                      color={colors.accent}
                      size={64}
                      borderColor={colors.accent}
                    />
                    <View style={styles.matchHeartBadge}>
                      <Ionicons name="heart" size={18} color={colors.onAccent} />
                    </View>
                    <MemberAvatar
                      name={candidate.nickname}
                      photoUrl={candidate.photoUrl}
                      color={candidate.avatarColor}
                      size={64}
                      borderColor={colors.lavender}
                    />
                  </View>
                  <AppText style={[styles.endedCopy, darkMode && styles.mutedOnDark]}>
                    You and {candidate.nickname} both saved each other before the timer ended.
                  </AppText>
                  <View style={styles.matchRewardRow}>
                    <View style={styles.matchRewardPill}>
                      <Ionicons name="ellipse" size={12} color={colors.gold} />
                      <AppText style={styles.matchRewardText}>+100</AppText>
                    </View>
                    <View style={styles.matchRewardPill}>
                      <Ionicons name="flash" size={12} color={colors.lavender} />
                      <AppText style={styles.matchRewardText}>XP +200</AppText>
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <AppText style={[styles.endedTitle, darkMode && styles.textOnDark]}>Chat ended</AppText>
                  <AppText style={[styles.endedCopy, darkMode && styles.mutedOnDark]}>
                    The chat closed automatically after 2 minutes. Returning to matching.
                  </AppText>
                </>
              )}
              <PrimaryButton
                label={status === 'saved' ? 'Keep Swiping' : 'Back To Matching'}
                icon="refresh-outline"
                onPress={() => resetToIdle()}
              />
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
            {candidate ? (
              <MemberAvatar
                name={candidate.nickname}
                photoUrl={candidate.photoUrl}
                color={isFound ? colors.accent : candidate.avatarColor}
                size={94}
                borderColor="transparent"
              />
            ) : isNone ? (
              <SearchGlyph color={colors.accent} />
            ) : (
              <AppText style={[styles.matchWindowInitial, isFound && styles.matchWindowInitialFound]}>K</AppText>
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

function SearchGlyph({ color }: { color: string }) {
  return (
    <View style={styles.searchGlyph}>
      <View style={[styles.searchLens, { borderColor: color }]} />
      <View style={[styles.searchHandle, { backgroundColor: color }]} />
    </View>
  );
}

function MemberProfilePreviewModal({
  member,
  economy,
  darkMode,
  onClose,
  onLike,
  onMessage
}: {
  member: Candidate | null;
  economy: { coins: number; rewardLevel: number; rewardXp: number };
  darkMode: boolean;
  onClose: () => void;
  onLike: (member: Candidate) => void;
  onMessage: (member: Candidate) => void;
}) {
  const interests = member?.interests.length ? member.interests : ['Coffee', 'Travel', 'Dogs', 'Beach'];
  const mediaTiles = [0, 1, 2];

  return (
    <Modal transparent visible={Boolean(member)} animationType="slide" onRequestClose={onClose}>
      {member ? (
        <View style={styles.previewOverlay}>
          <PressableScale accessibilityRole="button" onPress={onClose} style={styles.previewBackdrop} />
          <View style={[styles.previewScreen, styles.previewSheet, darkMode && styles.previewScreenDark]}>
          <View style={styles.previewGrabber} />
          <View style={styles.previewHeader}>
            <PressableScale accessibilityRole="button" onPress={onClose} style={styles.previewBackButton}>
              <AppText style={styles.previewBackText}>{'<'}</AppText>
            </PressableScale>
            <View style={styles.previewCoinPill}>
              <Ionicons name="ellipse" size={9} color={colors.gold} />
              <AppText style={styles.previewCoinText}>{economy.coins.toLocaleString()}</AppText>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.previewContent} showsVerticalScrollIndicator={false}>
            <View style={styles.previewIdentityRow}>
              <MemberAvatar
                name={member.nickname}
                photoUrl={member.photoUrl}
                color={member.avatarColor}
                size={38}
                borderColor="#2D1C35"
              />
              <View style={styles.previewIdentityCopy}>
                <View style={styles.previewNameRow}>
                  <AppText style={styles.previewName}>{`${member.nickname}, ${member.age}`}</AppText>
                  <View style={styles.previewVerifiedDot}>
                    <AppText style={styles.previewVerifiedMark}>v</AppText>
                  </View>
                </View>
                <AppText style={styles.previewMeta}>Content Creator</AppText>
                <AppText style={styles.previewMeta}>
                  {member.distanceMiles > 0 ? `${member.distanceMiles.toFixed(1)} km away` : 'KaTalk member'}
                </AppText>
              </View>
            </View>

            <View style={styles.previewLevelCard}>
              <View style={styles.previewBadge}>
                <AppText style={styles.previewBadgeText}>8</AppText>
              </View>
              <View style={styles.previewLevelCopy}>
                <AppText style={styles.previewLevelTitle}>Level {Math.max(8, economy.rewardLevel)}</AppText>
                <AppText style={styles.previewLevelMeta}>Creative Soul</AppText>
                <View style={styles.previewProgressTrack}>
                  <View style={[styles.previewProgressFill, { width: `${Math.min(92, 38 + economy.rewardXp / 40)}%` }]} />
                </View>
              </View>
            </View>

            <View style={styles.previewChipRow}>
              {interests.slice(0, 4).map((interest) => (
                <View key={interest} style={styles.previewChip}>
                  <AppText style={styles.previewChipText}>{interest}</AppText>
                </View>
              ))}
            </View>

            <View style={styles.previewMediaGrid}>
              {mediaTiles.map((tile) => (
                <View key={tile} style={styles.previewMediaTile}>
                  {member.photoUrl ? (
                    <Image source={{ uri: member.photoUrl }} style={styles.previewMediaImage} />
                  ) : (
                    <MemberAvatar
                      name={member.nickname}
                      color={member.avatarColor}
                      size={56}
                      borderColor="rgba(255,255,255,0.10)"
                    />
                  )}
                  {tile === 1 ? (
                    <View style={styles.previewPlayBadge}>
                      <AppText style={styles.previewPlayText}>{'>'}</AppText>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>

            <View style={styles.previewAbout}>
              <AppText style={styles.previewSectionTitle}>About me</AppText>
              <AppText style={styles.previewAboutText}>{buildProfilePrompt(member)}</AppText>
              <AppText style={styles.previewFact}>@ Looking for good vibes.</AppText>
              <AppText style={styles.previewFact}>@ Easy conversations.</AppText>
              <AppText style={styles.previewFact}>@ {interests.slice(0, 2).join(' and ')}</AppText>
            </View>
          </ScrollView>

          <View style={styles.previewFooter}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Open message screen"
              onPress={() => onMessage(member)}
              style={styles.previewMessageButton}
            >
              <AppText style={styles.previewMessageText}>Message</AppText>
            </PressableScale>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Like profile from preview"
              onPress={() => onLike(member)}
              style={styles.previewLikeButton}
            >
              <Ionicons name="heart" size={20} color={colors.onAccent} />
            </PressableScale>
          </View>
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

function MemberConnectionModal({
  member,
  messages,
  draft,
  economy,
  darkMode,
  onDraftChange,
  onSend,
  onClose
}: {
  member: Candidate | null;
  messages: Message[];
  draft: string;
  economy: { coins: number };
  darkMode: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
}) {
  const chatMessages = messages.filter((message) => message.sender !== 'system');
  const matchBanner = messages.find((message) => message.sender === 'system')?.body;

  return (
    <Modal visible={Boolean(member)} animationType="slide" onRequestClose={onClose}>
      {member ? (
        <KeyboardAvoidingView
          style={[styles.connectionScreen, darkMode && styles.connectionScreenDark]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.connectionHeader}>
            <PressableScale accessibilityRole="button" onPress={onClose} style={styles.connectionBackButton}>
              <AppText style={styles.connectionBackText}>{'<'}</AppText>
            </PressableScale>
            <MemberAvatar
              name={member.nickname}
              photoUrl={member.photoUrl}
              color={member.avatarColor}
              size={32}
              borderColor="#3A2942"
            />
            <View style={styles.connectionTitleBlock}>
              <AppText style={styles.connectionName}>{member.nickname}</AppText>
              <AppText style={styles.connectionStatus}>Active now</AppText>
            </View>
            <View style={styles.connectionCoinPill}>
              <AppText style={styles.previewCoinMark}>C</AppText>
              <AppText style={styles.previewCoinText}>{economy.coins.toLocaleString()}</AppText>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.connectionMessages} showsVerticalScrollIndicator={false}>
            {matchBanner ? (
              <View style={styles.connectionMatchBanner}>
                <MemberAvatar
                  name={member.nickname}
                  photoUrl={member.photoUrl}
                  color={member.avatarColor}
                  size={28}
                  borderColor="#4C294A"
                />
                <View style={styles.connectionBannerCopy}>
                  <AppText style={styles.connectionBannerText}>{matchBanner}</AppText>
                  <AppText style={styles.connectionBannerSubtext}>Today</AppText>
                </View>
                <View style={styles.connectionBonusPill}>
                  <AppText style={styles.connectionBonusText}>+50</AppText>
                </View>
              </View>
            ) : null}

            {chatMessages.map((message) => {
              const isMine = message.sender === 'me';

              return (
                <View
                  key={message.id}
                  style={[
                    styles.connectionBubble,
                    isMine ? styles.connectionBubbleMine : styles.connectionBubbleMatch
                  ]}
                >
                  <AppText
                    style={[
                      styles.connectionBubbleText,
                      isMine ? styles.connectionBubbleTextMine : styles.connectionBubbleTextMatch
                    ]}
                  >
                    {message.body}
                  </AppText>
                  <AppText style={styles.connectionBubbleTime}>
                    {message.sentAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </AppText>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.connectionInputRow}>
            <TextInput
              value={draft}
              onChangeText={onDraftChange}
              placeholder="Type a message..."
              placeholderTextColor="#777789"
              style={styles.connectionInput}
              returnKeyType="send"
              onSubmitEditing={onSend}
            />
            <PressableScale accessibilityRole="button" onPress={onSend} style={styles.connectionSendButton}>
              <AppText style={styles.connectionSendText}>{'>'}</AppText>
            </PressableScale>
          </View>
        </KeyboardAvoidingView>
      ) : null}
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
              <AppText style={[styles.socialCloseText, darkMode && styles.textOnDark]}>X</AppText>
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
  story: PublicStory | null;
  darkMode: boolean;
  onClose: () => void;
}) {
  const hoursLeft = story ? Math.max(0, Math.ceil((story.expiresAt.getTime() - Date.now()) / (60 * 60 * 1000))) : 0;

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
                  <AppText style={styles.storyViewerInitial}>
                    {story.nickname.trim().charAt(0).toUpperCase() || 'K'}
                  </AppText>
                </View>
              )}
              <View style={styles.storyViewerCopy}>
                <AppText style={[styles.storyViewerName, darkMode && styles.textOnDark]}>{story.nickname}</AppText>
                <AppText style={styles.storyViewerTime}>
                  {story.mine
                    ? `Your story - ends in ${hoursLeft}h`
                    : `${story.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ends in ${hoursLeft}h`}
                </AppText>
              </View>
              <PressableScale accessibilityRole="button" onPress={onClose} style={[styles.socialCloseButton, darkMode && styles.roundIconDark]}>
                <AppText style={[styles.socialCloseText, darkMode && styles.textOnDark]}>X</AppText>
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
              <MemberAvatar
                name={thread.candidate.nickname}
                photoUrl={thread.candidate.photoUrl}
                color={thread.candidate.avatarColor}
                size={44}
              />
              <View style={styles.inboxTitleBlock}>
                <AppText style={[styles.inboxName, darkMode && styles.textOnDark]}>{thread.candidate.nickname}</AppText>
                <AppText style={styles.inboxMeta}>Registered KaTalk member</AppText>
              </View>
              <PressableScale accessibilityRole="button" onPress={onClose} style={[styles.socialCloseButton, darkMode && styles.roundIconDark]}>
                <AppText style={[styles.socialCloseText, darkMode && styles.textOnDark]}>X</AppText>
              </PressableScale>
            </View>

            <ScrollView contentContainerStyle={styles.inboxMessages}>
              {thread.messages.length === 0 ? (
                <View style={[styles.emptyState, darkMode && styles.softSurfaceDark]}>
                  <AppText style={[styles.emptyStateTitle, darkMode && styles.textOnDark]}>
                    Real member profile
                  </AppText>
                  <AppText style={[styles.emptyStateText, darkMode && styles.mutedOnDark]}>
                    {thread.candidate.prompt}
                  </AppText>
                  <AppText style={[styles.emptyStateText, darkMode && styles.mutedOnDark]}>
                    Use Find Chat when both people are available for a timed real chat.
                  </AppText>
                </View>
              ) : null}
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

            {thread.messages.length > 0 ? (
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
                  <AppText style={styles.sendButtonText}>{'>'}</AppText>
                </PressableScale>
              </View>
            ) : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SavedMatchChatModal({
  match,
  messages,
  draft,
  darkMode,
  onDraftChange,
  onSend,
  onClose
}: {
  match: SavedMatch | null;
  messages: Message[];
  draft: string;
  darkMode: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
}) {
  return (
    <Modal transparent visible={Boolean(match)} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.inboxModalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <PressableScale accessibilityRole="button" onPress={onClose} style={styles.socialModalBackdrop} />
        {match ? (
          <View style={[styles.inboxSheet, darkMode && styles.cardDark]}>
            <View style={styles.inboxHeader}>
              <MemberAvatar
                name={match.candidate.nickname}
                photoUrl={match.candidate.photoUrl}
                color={match.candidate.avatarColor}
                size={44}
              />
              <View style={styles.inboxTitleBlock}>
                <AppText style={[styles.inboxName, darkMode && styles.textOnDark]}>Saved chat</AppText>
                <AppText style={styles.inboxMeta}>
                  {match.candidate.interests.join(' / ')}
                </AppText>
              </View>
              <PressableScale accessibilityRole="button" onPress={onClose} style={[styles.socialCloseButton, darkMode && styles.roundIconDark]}>
                <AppText style={[styles.socialCloseText, darkMode && styles.textOnDark]}>X</AppText>
              </PressableScale>
            </View>

            <ScrollView contentContainerStyle={styles.inboxMessages}>
              {messages.length === 0 ? (
                <View style={[styles.emptyState, darkMode && styles.softSurfaceDark]}>
                  <AppText style={[styles.emptyStateTitle, darkMode && styles.textOnDark]}>
                    Saved match inbox
                  </AppText>
                  <AppText style={[styles.emptyStateText, darkMode && styles.mutedOnDark]}>
                    This chat stays open because you both saved the 2-minute match.
                  </AppText>
                </View>
              ) : null}
              {messages.map((message) => (
                <View
                  key={message.id}
                  style={[
                    styles.inboxBubble,
                    darkMode && styles.bubbleDark,
                    message.sender === 'me' && styles.inboxBubbleMine,
                    message.sender === 'system' && styles.systemBubble,
                    darkMode && message.sender === 'system' && styles.systemBubbleDark
                  ]}
                >
                  <AppText
                    style={[
                      styles.inboxBubbleText,
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

            <View style={[styles.inboxInputRow, darkMode && styles.inputRowDark]}>
              <TextInput
                value={draft}
                onChangeText={onDraftChange}
                placeholder="Write to your saved match"
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
                <AppText style={styles.sendButtonText}>{'>'}</AppText>
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
    backgroundColor: colors.background
  },
  rootDark: {
    backgroundColor: colors.background
  },
  textOnDark: {
    color: colors.onAccent
  },
  mutedOnDark: {
    color: '#BBC1CC'
  },
  cardDark: {
    borderColor: '#332241',
    backgroundColor: colors.surface
  },
  softSurfaceDark: {
    borderColor: colors.line,
    backgroundColor: colors.surfaceMuted
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
  matchWindowInitial: {
    color: colors.accent,
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '900'
  },
  matchWindowInitialFound: {
    color: colors.onAccent
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
    gap: 17,
    backgroundColor: colors.background
  },
  discoverHome: {
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 26,
    backgroundColor: colors.background
  },
  discoverTopBar: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  discoverTitle: {
    color: colors.onAccent,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800'
  },
  discoverCoinPill: {
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#3A2B43',
    backgroundColor: '#171421'
  },
  discoverCoinMark: {
    color: colors.gold,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900'
  },
  discoverCoinText: {
    color: colors.onAccent,
    fontSize: 11,
    fontWeight: '900'
  },
  discoverTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  discoverTab: {
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  discoverTabActive: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent
  },
  discoverTabText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800'
  },
  discoverTabActiveText: {
    color: colors.onAccent,
    fontSize: 11,
    fontWeight: '900'
  },
  feedCard: {
    width: '100%',
    maxWidth: 390,
    height: 642,
    alignSelf: 'center',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#6B3D4A',
    backgroundColor: '#151522',
    position: 'relative'
  },
  feedImageSurface: {
    ...StyleSheet.absoluteFillObject
  },
  feedImage: {
    borderRadius: 24,
    resizeMode: 'cover'
  },
  feedFallbackSurface: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    backgroundColor: '#171421'
  },
  feedFallbackText: {
    maxWidth: 230,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    textAlign: 'center'
  },
  feedShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)'
  },
  feedCardTop: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 12,
    zIndex: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  feedTopLabel: {
    color: colors.onAccent,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800'
  },
  feedTopSpacer: {
    flex: 1
  },
  feedCoinPillOverlay: {
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 9,
    marginRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(13,14,22,0.78)'
  },
  feedCoinText: {
    color: colors.onAccent,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900'
  },
  newHereBadge: {
    minHeight: 26,
    borderRadius: 13,
    paddingHorizontal: 10,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)'
  },
  newHereText: {
    color: colors.onAccent,
    fontSize: 10,
    fontWeight: '900'
  },
  feedSideActions: {
    position: 'absolute',
    right: 12,
    bottom: 146,
    zIndex: 3,
    gap: 10
  },
  feedActionButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,18,29,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)'
  },
  feedHeartButton: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  feedCardBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3,
    paddingHorizontal: 14,
    paddingTop: 22,
    paddingBottom: 18,
    gap: 8,
    backgroundColor: 'rgba(8,9,18,0.58)'
  },
  feedNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  feedName: {
    color: colors.onAccent,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900'
  },
  feedVerifiedText: {
    display: 'none',
    color: colors.violet,
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '900'
  },
  feedVerifiedDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.violet
  },
  feedVerifiedMark: {
    color: colors.onAccent,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900'
  },
  feedMeta: {
    color: '#E3DEEA',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700'
  },
  feedMetaStack: {
    gap: 2
  },
  feedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  feedInterestRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  feedInterestChip: {
    minHeight: 24,
    borderRadius: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)'
  },
  feedInterestText: {
    color: colors.onAccent,
    fontSize: 10,
    fontWeight: '800'
  },
  feedNotice: {
    minHeight: 34,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(17,18,29,0.78)'
  },
  feedNoticeText: {
    flex: 1,
    color: colors.onAccent,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800'
  },
  previewScreen: {
    flex: 1,
    paddingTop: 42,
    paddingHorizontal: 14,
    paddingBottom: 18,
    backgroundColor: colors.background
  },
  previewOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(6,7,14,0.62)'
  },
  previewBackdrop: {
    ...StyleSheet.absoluteFillObject
  },
  previewSheet: {
    flex: 0,
    maxHeight: '86%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingBottom: 14,
    borderWidth: 1,
    borderColor: '#442A48',
    borderBottomWidth: 0,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.24,
    shadowRadius: 24,
    elevation: 18
  },
  previewGrabber: {
    width: 54,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.18)'
  },
  previewScreenDark: {
    backgroundColor: colors.background
  },
  previewHeader: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  previewBackButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  previewBackText: {
    color: colors.onAccent,
    fontSize: 19,
    lineHeight: 21,
    fontWeight: '900'
  },
  previewCoinPill: {
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#3A2B43',
    backgroundColor: '#15131F'
  },
  previewCoinMark: {
    color: colors.gold,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900'
  },
  previewCoinText: {
    color: colors.onAccent,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900'
  },
  previewContent: {
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12
  },
  previewIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  previewIdentityCopy: {
    flex: 1,
    gap: 2
  },
  previewNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  previewName: {
    color: colors.onAccent,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900'
  },
  previewVerifiedDot: {
    width: 15,
    height: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.violet
  },
  previewVerifiedMark: {
    color: colors.onAccent,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900'
  },
  previewMeta: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700'
  },
  previewLevelCard: {
    minHeight: 62,
    borderRadius: 14,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#392342',
    backgroundColor: '#15131F'
  },
  previewBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4B244E'
  },
  previewBadgeText: {
    color: colors.accent,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900'
  },
  previewLevelCopy: {
    flex: 1,
    gap: 4
  },
  previewLevelTitle: {
    color: colors.onAccent,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900'
  },
  previewLevelMeta: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700'
  },
  previewProgressTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: '#2A2230'
  },
  previewProgressFill: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent
  },
  previewChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7
  },
  previewChip: {
    minHeight: 24,
    borderRadius: 12,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#201D2A'
  },
  previewChipText: {
    color: colors.onAccent,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800'
  },
  previewMediaGrid: {
    flexDirection: 'row',
    gap: 8
  },
  previewMediaTile: {
    flex: 1,
    height: 112,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#181622'
  },
  previewMediaImage: {
    width: '100%',
    height: '100%'
  },
  previewPlayBadge: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)'
  },
  previewPlayText: {
    color: colors.onAccent,
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '900'
  },
  previewAbout: {
    gap: 6
  },
  previewSectionTitle: {
    color: colors.onAccent,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '900'
  },
  previewAboutText: {
    color: '#D7D3DE',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700'
  },
  previewFact: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700'
  },
  previewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8
  },
  previewMessageButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  previewMessageText: {
    color: colors.onAccent,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900'
  },
  previewLikeButton: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#392342',
    backgroundColor: '#171421'
  },
  previewLikeText: {
    color: colors.accent,
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '900'
  },
  connectionScreen: {
    flex: 1,
    paddingTop: 42,
    paddingHorizontal: 12,
    paddingBottom: 14,
    backgroundColor: colors.background
  },
  connectionScreenDark: {
    backgroundColor: colors.background
  },
  connectionHeader: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  connectionBackButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  connectionBackText: {
    color: colors.onAccent,
    fontSize: 19,
    lineHeight: 22,
    fontWeight: '900'
  },
  connectionTitleBlock: {
    flex: 1
  },
  connectionName: {
    color: colors.onAccent,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900'
  },
  connectionStatus: {
    color: colors.success,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800'
  },
  connectionCoinPill: {
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#15131F',
    borderWidth: 1,
    borderColor: '#3A2B43'
  },
  connectionMessages: {
    flexGrow: 1,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10
  },
  connectionMatchBanner: {
    minHeight: 58,
    borderRadius: 15,
    padding: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#4B2A52',
    backgroundColor: '#15131F'
  },
  connectionBannerCopy: {
    flex: 1
  },
  connectionBannerText: {
    color: colors.onAccent,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800'
  },
  connectionBannerSubtext: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700'
  },
  connectionBonusPill: {
    minHeight: 26,
    borderRadius: 13,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A1F24'
  },
  connectionBonusText: {
    color: colors.gold,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900'
  },
  connectionBubble: {
    maxWidth: '78%',
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 4
  },
  connectionBubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.lavender
  },
  connectionBubbleMatch: {
    alignSelf: 'flex-start',
    backgroundColor: '#20202B'
  },
  connectionBubbleText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700'
  },
  connectionBubbleTextMine: {
    color: colors.onAccent
  },
  connectionBubbleTextMatch: {
    color: '#ECE8F0'
  },
  connectionBubbleTime: {
    color: '#898795',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '700',
    alignSelf: 'flex-end'
  },
  connectionInputRow: {
    minHeight: 48,
    borderRadius: 16,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#31243B',
    backgroundColor: '#12131D'
  },
  connectionInput: {
    flex: 1,
    minHeight: 42,
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '700'
  },
  connectionSendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  connectionSendText: {
    color: colors.onAccent,
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '900'
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  screenTitle: {
    color: colors.ink,
    fontSize: 31,
    lineHeight: 36,
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
  searchGlyph: {
    width: 20,
    height: 20,
    position: 'relative'
  },
  searchLens: {
    position: 'absolute',
    left: 1,
    top: 1,
    width: 13,
    height: 13,
    borderWidth: 2,
    borderRadius: 7
  },
  searchHandle: {
    position: 'absolute',
    right: 2,
    bottom: 3,
    width: 8,
    height: 2,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }]
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  dotsText: {
    color: colors.muted,
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '900'
  },
  sectionTitleSmall: {
    color: colors.ink,
    fontSize: 17,
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
    borderColor: colors.accent,
    backgroundColor: colors.surfaceMuted
  },
  addStoryText: {
    color: colors.accent,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '500'
  },
  storyImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.accent
  },
  myStoryImage: {
    borderColor: colors.lavender
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
  storyFallbackText: {
    color: colors.onAccent,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900'
  },
  storyName: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center'
  },
  featureMatch: {
    borderRadius: 24,
    backgroundColor: '#181021',
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: '#55304F',
    shadowColor: colors.accent,
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6
  },
  featureTitle: {
    color: colors.ink,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900'
  },
  featureCopy: {
    color: colors.muted,
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700'
  },
  aiCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  aiCoinPill: {
    alignSelf: 'flex-start',
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: '#3B2941'
  },
  aiCoinText: {
    color: colors.onAccent,
    fontSize: 11,
    fontWeight: '900'
  },
  dailyMatchCard: {
    minHeight: 70,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'
  },
  dailyMatchTitle: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '900'
  },
  dailyMatchMeta: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '700',
    marginTop: 2
  },
  dailyAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  dailyAvatarFallback: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginLeft: -6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: '#181021'
  },
  dailyAvatarInitial: {
    color: colors.onAccent,
    fontSize: 11,
    fontWeight: '900'
  },
  aiInsightRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center'
  },
  matchScoreRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    padding: 8,
    backgroundColor: colors.accent,
    borderWidth: 10,
    borderColor: colors.lavender,
    alignItems: 'center',
    justifyContent: 'center'
  },
  matchScoreInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#181021'
  },
  matchScoreText: {
    color: colors.onAccent,
    fontSize: 25,
    lineHeight: 29,
    fontWeight: '900'
  },
  matchScoreMeta: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '900'
  },
  matchMetricList: {
    flex: 1,
    gap: 8
  },
  matchMetricRow: {
    gap: 5
  },
  matchMetricLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  matchMetricLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800'
  },
  matchMetricValue: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '900'
  },
  matchMetricTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted
  },
  matchMetricFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent
  },
  homeNotice: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#13291F'
  },
  homeNoticeText: {
    flex: 1,
    color: colors.success,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800'
  },
  homeNoticeMark: {
    color: colors.success,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900'
  },
  matchStatusRow: {
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceMuted,
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
    minWidth: 156,
    borderRadius: 18
  },
  chatList: {
    gap: 2
  },
  emptyState: {
    minHeight: 96,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surfaceMuted
  },
  emptyStateTitle: {
    color: colors.ink,
    fontWeight: '900',
    textAlign: 'center'
  },
  emptyStateText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    textAlign: 'center'
  },
  chatRow: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 8
  },
  chatRowDark: {
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
  seenText: {
    color: colors.accent,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900'
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
    borderBottomColor: colors.line,
    backgroundColor: colors.surface
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
  timerIconText: {
    fontSize: 12,
    lineHeight: 14,
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
    borderColor: colors.line,
    backgroundColor: colors.surface
  },
  myBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.lavender,
    borderColor: colors.lavender
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
  saveStatusMark: {
    color: colors.onAccent,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900'
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8
  },
  inputRowDark: {
    backgroundColor: colors.surface
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
    borderColor: colors.line,
    backgroundColor: colors.surfaceMuted,
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
  sendButtonText: {
    color: colors.onAccent,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '900'
  },
  endedPanel: {
    padding: 18,
    gap: 13,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center'
  },
  endedTitle: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center'
  },
  endedCopy: {
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 19,
    fontWeight: '700'
  },
  matchConfirmTitle: {
    color: colors.accent,
    fontSize: 30,
    lineHeight: 36
  },
  matchConfirmAvatars: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2
  },
  matchHeartBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginHorizontal: -7,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.surface
  },
  matchRewardRow: {
    flexDirection: 'row',
    gap: 10
  },
  matchRewardPill: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: '#3B2941'
  },
  matchRewardText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '900'
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
  socialCloseText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '900'
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
  storyViewerInitial: {
    color: colors.onAccent,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900'
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
