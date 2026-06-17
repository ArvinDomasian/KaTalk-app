export const firebaseCollections = {
  users: 'users',
  profiles: 'profiles',
  availability: 'availability',
  messageMatches: 'messageMatches',
  messages: 'messages',
  calls: 'calls',
  rooms: 'rooms',
  reports: 'reports',
  locations: 'locations',
  consents: 'consents'
} as const;

export const backendRules = [
  'Registration must reject users under 18 before creating a usable profile.',
  'Message matches are created by server logic, never by directly trusting client-selected targets.',
  'The 2-minute message timer must be server-authoritative.',
  'Tab 3 video sessions must not create chat threads or intro messages.',
  'Reports and blocks must immediately suppress future discovery between both accounts.',
  'Nearby discovery may show distance, but must not expose raw coordinates to other users.'
];
