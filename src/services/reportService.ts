import { addDoc, collection, getFirestore, serverTimestamp } from 'firebase/firestore';
import type { SafetyEvent } from './contracts';
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

export async function submitSafetyReport(event: SafetyReportInput) {
  if (event.action !== 'report') {
    return null;
  }

  const db = getReportDb();
  const reporterId = getCurrentFirebaseUserId() ?? event.actorId;

  if (!db || !reporterId) {
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

  const docRef = await addDoc(collection(db, REPORT_COLLECTION), report);

  return {
    id: docRef.id,
    ...report,
    createdAt: new Date(createdAtMs)
  };
}
