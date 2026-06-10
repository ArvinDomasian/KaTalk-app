export type ActiveTab = 'message' | 'rooms' | 'video';

export type UserProfile = {
  id: string;
  nickname: string;
  dateOfBirth: string;
  gender: string;
  preference: string;
  ageRange: string;
  interests: string[];
  comfort: 'shy' | 'balanced' | 'open';
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  acceptedRules: boolean;
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
};

export type VoiceRoom = {
  id: string;
  title: string;
  mood: string;
  participants: number;
  isJoined: boolean;
  host: string;
};
