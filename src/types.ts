export type ActiveTab = 'message' | 'rooms' | 'video' | 'rewards' | 'profile';

export type ThemeMode = 'light' | 'dark';

export type UserProfile = {
  id: string;
  nickname: string;
  avatarUrl?: string;
  dateOfBirth: string;
  gender: string;
  preference: string;
  ageRange: string;
  interests: string[];
  comfort: 'shy' | 'balanced' | 'open';
  authMethod?: 'apple' | 'google' | 'facebook' | 'phone';
  authContact?: string;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  acceptedRules: boolean;
  subscription?: SubscriptionAccess;
  economy?: UserEconomy;
  verification?: ProfileVerification;
  moderation?: UserModeration;
};

export type SubscriptionAccess = {
  tier: 'free' | 'plus' | 'premium' | 'premium_plus' | 'vip';
  isActive: boolean;
  entitlementId: string;
  productId?: string;
  store?: string;
  expiresAt?: string | null;
  updatedAt: string;
};

export type UserEconomy = {
  dailyLikesRemaining: number;
  dailyLikesResetAt: string;
  boosts: number;
  superLikes: number;
  coins: number;
  gifts: number;
  profileSpotlights: number;
  undoSwipes: number;
  rewardLevel: number;
  rewardXp: number;
  dailyRewardStreak: number;
  dailyRewardClaimedAt?: string;
  missionLikes: number;
  conversationsStarted: number;
  videosWatched: number;
  claimedMissionIds: string[];
  profileViews: number;
};

export type ProfileVerificationStatus = 'not_started' | 'manual_pending' | 'fast_track_pending' | 'verified';

export type ProfileVerification = {
  status: ProfileVerificationStatus;
  badgeVisible: boolean;
  requestedAt?: string;
  method?: 'manual' | 'fast_track';
  verifiedAt?: string;
  verifiedBy?: string;
};

export type UserModeration = {
  isBanned: boolean;
  reason?: string;
  bannedAt?: string;
  bannedBy?: string;
  unbannedAt?: string;
  unbannedBy?: string;
};

export type MatchStatus = 'idle' | 'searching' | 'active' | 'expired' | 'saved';

export type Message = {
  id: string;
  sender: 'me' | 'match' | 'system';
  body: string;
  sentAt: Date;
};

export type Candidate = {
  id: string;
  nickname: string;
  age: number;
  distanceMiles: number;
  interests: string[];
  prompt: string;
  avatarColor: string;
  photoUrl?: string;
};

export type VoiceRoom = {
  id: string;
  hostId?: string;
  title: string;
  mood: string;
  topic: string;
  participants: number;
  isJoined: boolean;
  host: string;
  speakers: string[];
};

export type ProfilePost = {
  id: string;
  profileId: string;
  authorNickname: string;
  body: string;
  photoUrl?: string;
  emoji?: string;
  voiceUrl?: string;
  musicUrl?: string;
  musicTitle?: string;
  visibility: 'public' | 'private';
  createdAt: Date;
};
