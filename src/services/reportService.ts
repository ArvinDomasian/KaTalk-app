import { addDoc, collection, getFirestore, serverTimestamp } from 'firebase/firestore';
import type { SafetyEvent } from './contracts';
import { shouldUseSupabase } from './backendConfig';
import { getCurrentAuthUserId } from './authService';
import { getConfiguredFirebaseApp, getCurrentFirebaseUserId } from './firebaseAuthService';

const REPORT_COLLECTION = 'reports';

type SafetyReportInput = Omit<SafetyEvent, 'createdAt'> & {
  matchId?: string;
  targetNickname?: string;
  reason?: string;
};

function getReportDb() {
  const app = getConfiguredFirebaseApp();
  return app ? getFirestore(app) : null;
}

function uuidOrNull(value?: string) {
  const candidate = value ?? '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
}

export async function submitSafetyReport(event: SafetyReportInput) {
  if (event.action !== 'report') {
    return null;
  }

  const db = getReportDb();
  const reporterId = shouldUseSupabase()
    ? getCurrentAuthUserId() ?? event.actorId
    : getCurrentFirebaseUserId() ?? event.actorId;

  if (!reporterId) {
    return null;
  }

  const createdAtMs = Date.now();
  const report = {
    source: event.source,
    action: event.action,
    reporterId,
    actorId: event.actorId,
    targetUserId: event.targetId,
    targetId: event.targetId,
    targetNickname: event.targetNickname ?? null,
    matchId: event.matchId ?? null,
    reason: event.reason ?? 'User report',
    status: 'open',
    createdAtMs,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  if (shouldUseSupabase()) {
    const { getSupabaseClient } = await import('./supabaseClient');
    const supabase = getSupabaseClient();

    if (!supabase) {
      return null;
    }

    const { data, error } = await supabase
      .from('reports')
      .insert({
        source: event.source,
        action: event.action,
        reporter_id: reporterId,
        actor_id: uuidOrNull(event.actorId),
        target_user_id: uuidOrNull(event.targetId),
        target_id: event.targetId,
        target_nickname: event.targetNickname ?? null,
        match_id: event.matchId ?? null,
        reason: event.reason ?? 'User report',
        status: 'open',
        created_at_ms: createdAtMs,
        created_at: new Date(createdAtMs).toISOString(),
        updated_at: new Date(createdAtMs).toISOString()
      })
      .select('id')
      .single();

    if (error) {
      return null;
    }

    return {
      id: String(data?.id ?? `report-${createdAtMs}`),
      ...report,
      createdAt: new Date(createdAtMs)
    };
  }

  if (!db) {
    return null;
  }

  const docRef = await addDoc(collection(db, REPORT_COLLECTION), report);

  return {
    id: docRef.id,
    ...report,
    createdAt: new Date(createdAtMs)
  };
}
