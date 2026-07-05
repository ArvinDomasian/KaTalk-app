import Constants from 'expo-constants';

declare const process: {
  env: Record<string, string | undefined>;
};

export type BackendProvider = 'firebase' | 'supabase';

function cleanEnvValue(value?: string) {
  return value?.trim().replace(/,$/, '').replace(/^["']|["']$/g, '') ?? '';
}

function getExtraValue(key: string) {
  const extra = Constants.expoConfig?.extra ?? Constants.manifest2?.extra ?? {};
  const backend = extra as {
    backendProvider?: string;
    supabase?: {
      url?: string;
      anonKey?: string;
    };
  };

  if (key === 'backendProvider') {
    return cleanEnvValue(backend.backendProvider);
  }

  if (key === 'supabaseUrl') {
    return cleanEnvValue(backend.supabase?.url);
  }

  if (key === 'supabaseAnonKey') {
    return cleanEnvValue(backend.supabase?.anonKey);
  }

  return '';
}

export function getBackendProvider(): BackendProvider {
  const configuredProvider =
    cleanEnvValue(process.env.EXPO_PUBLIC_BACKEND_PROVIDER) || getExtraValue('backendProvider');

  return configuredProvider.toLowerCase() === 'supabase' ? 'supabase' : 'firebase';
}

export function shouldUseSupabase() {
  return getBackendProvider() === 'supabase';
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
