import Constants from 'expo-constants';

declare const process: {
  env: Record<string, string | undefined>;
};

function cleanEnvValue(value?: string) {
  return value?.trim().replace(/,$/, '').replace(/^["']|["']$/g, '') ?? '';
}

function getExtraValue(key: 'supabaseUrl' | 'supabaseAnonKey') {
  const constants = Constants as unknown as {
    expoConfig?: { extra?: unknown };
    manifest?: { extra?: unknown };
    manifest2?: {
      extra?: unknown;
    };
  };
  const extras = [
    constants.expoConfig?.extra,
    constants.manifest?.extra,
    constants.manifest2?.extra,
    (constants.manifest2?.extra as { expoClient?: { extra?: unknown } } | undefined)?.expoClient?.extra
  ];

  const values = extras
    .map((extra) => {
      const backend = extra as
        | {
            supabase?: {
              url?: string;
              anonKey?: string;
            };
          }
        | undefined;

      return key === 'supabaseUrl'
        ? cleanEnvValue(backend?.supabase?.url)
        : cleanEnvValue(backend?.supabase?.anonKey);
    })
    .filter(Boolean);

  if (key === 'supabaseUrl') {
    return values[0] ?? '';
  }

  return values[0] ?? '';
}

export function getBackendProvider() {
  return 'supabase' as const;
}

export function shouldUseSupabase() {
  return true;
}

export function getSupabaseConfig() {
  return {
    url: cleanEnvValue(process.env.EXPO_PUBLIC_SUPABASE_URL) || getExtraValue('supabaseUrl'),
    anonKey: cleanEnvValue(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) || getExtraValue('supabaseAnonKey')
  };
}

export function isSupabaseConfigured() {
  const config = getSupabaseConfig();
  const urlLooksLikeProjectUrl =
    /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.url);
  const anonKeyLooksReal =
    config.anonKey.startsWith('eyJ') &&
    !config.anonKey.toLowerCase().includes('your-') &&
    config.anonKey.length > 80;

  return Boolean(urlLooksLikeProjectUrl && anonKeyLooksReal);
}

export function supabaseMissingConfigMessage() {
  return 'KaTalk cannot read the Supabase build config yet. Install the newest APK build after the Supabase URL and anon public key are saved in Expo EAS.';
}
