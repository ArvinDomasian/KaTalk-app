import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { RtcRole, RtcTokenBuilder } from 'npm:agora-access-token@2';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
    }
  });
}

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonResponse({});
  }

  const appId = Deno.env.get('AGORA_APP_ID') ?? '';
  const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  if (!appId || !appCertificate || !supabaseUrl || !anonKey) {
    return jsonResponse({ error: 'Agora or Supabase environment is missing.' }, 500);
  }

  const authorization = request.headers.get('Authorization') ?? '';
  const accessToken = authorization.replace(/^Bearer\s+/i, '');

  if (!accessToken) {
    return jsonResponse({ error: 'Missing Supabase access token.' }, 401);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    return jsonResponse({ error: 'Invalid Supabase access token.' }, 401);
  }

  const payload = await request.json().catch(() => ({}));
  const channelName = typeof payload.channelName === 'string' ? payload.channelName : '';
  const uid = Number(payload.uid ?? 0);

  if (!channelName || !uid) {
    return jsonResponse({ error: 'channelName and uid are required.' }, 400);
  }

  const expiresInSeconds = 60 * 60;
  const privilegeExpiredTs = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channelName,
    uid,
    RtcRole.PUBLISHER,
    privilegeExpiredTs
  );

  return jsonResponse({ token, appId, uid, expiresInSeconds });
});
