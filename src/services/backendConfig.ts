import Constants from 'expo-constants';

declare const process: {
  env: Record<string, string | undefined>;
};

function cleanEnvValue(value?: string) {
  return value?.trim().replace(/,$/, '').replace(/^["']|["']$/g, '') ?? '';
}

function getExtraValue(key: 'supabaseUrl' | 'supabaseAnonKey') {
  const extra = Constants.expoConfig?.extra ?? Constants.manifest2?.extra ?? {};
  const backend = extra as {
    supabase?: {
      url?: string;
      anonKey?: string;
    };
  };

  if (key === 'supabaseUrl') {
    return cleanEnvValue(backend.supabase?.url);
  }

  return cleanEnvValue(backend.supabase?.anonKey);
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
  return 'KaTalk is not connected to Supabase yet. In Supabase Project Settings > API, copy the Project URL and anon public key into .env, then fully restart Expo. The URL should look like https://your-project.supabase.co and the anon key should start with eyJ.';
}
