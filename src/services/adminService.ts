import {
  collection,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe
} from 'firebase/firestore';
import type { ProfileVerificationStatus, UserModeration } from '../types';
import { getCurrentAuthUserId, subscribeAuthUser } from './authService';
import { shouldUseSupabase } from './backendConfig';
import {
  getConfiguredFirebaseApp,
  getCurrentFirebaseUserId,
  subscribeFirebaseAuthUser
} from './firebaseAuthService';

const ADMIN_COLLECTION = 'admins';
const REPORT_COLLECTION = 'reports';
const USER_PROFILE_COLLECTION = 'userProfiles';

export type AdminReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';

export type AdminReport = {
  id: string;
  source: string;
  reporterId: string;
  targetUserId: string;
  targetNickname: string;
  reason: string;
  status: AdminReportStatus;
  createdAtMs: number;
};

export type AdminUser = {
  id: string;
  nickname: string;
  authContact: string;
  gender: string;
  preference: string;
  interests: string[];
  updatedAtMs: number;
  verificationStatus: ProfileVerificationStatus;
  isBanned: boolean;
  banReason?: string;
};

export type AdminStats = {
  totalUsers: number;
  bannedUsers: number;
  verifiedUsers: number;
  pendingVerificationUsers: number;
  reportedUsers: number;
  openReports: number;
};

export type AdminDashboardData = {
  reports: AdminReport[];
  users: AdminUser[];
  stats: AdminStats;
};

function getAdminDb() {
  const app = getConfiguredFirebaseApp();
  return app ? getFirestore(app) : null;
}

function timestampToMs(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value === 'object' && 'toMillis' in value) {
    const toMillis = (value as { toMillis?: () => number }).toMillis;

    if (typeof toMillis === 'function') {
      return toMillis();
    }
  }

  return 0;
}

function reportFromDoc(id: string, data: Record<string, unknown>): AdminReport {
  const status = String(data.status ?? 'open') as AdminReportStatus;
  const targetUserId = String(data.targetUserId ?? data.targetId ?? '');

  return {
    id,
    source: String(data.source ?? 'report'),
    reporterId: String(data.reporterId ?? data.actorId ?? ''),
    targetUserId,
    targetNickname: String(data.targetNickname ?? (targetUserId || 'Unknown user')),
    reason: String(data.reason ?? 'User report'),
    status,
    createdAtMs: timestampToMs(data.createdAtMs) || timestampToMs(data.createdAt)
  };
}

function userFromDoc(id: string, data: Record<string, unknown>): AdminUser {
  const moderation = (data.moderation ?? {}) as Partial<UserModeration>;
  const verification = (data.verification ?? {}) as { status?: ProfileVerificationStatus };
  const interests = Array.isArray(data.interests) ? data.interests.map(String) : [];

  return {
    id,
    nickname: String(data.nickname ?? 'KaTalk member'),
    authContact: String(data.authContact ?? ''),
    gender: String(data.gender ?? 'Not set'),
    preference: String(data.preference ?? 'Not set'),
    interests,
    updatedAtMs: timestampToMs(data.updatedAt),
    verificationStatus: verification.status ?? 'not_started',
    isBanned: moderation.isBanned === true,
    banReason: moderation.reason
  };
}

function reportFromSupabaseRow(row: Record<string, unknown>): AdminReport {
  const targetUserId = String(row.target_user_id ?? row.target_id ?? '');

  return {
    id: String(row.id ?? ''),
    source: String(row.source ?? 'report'),
    reporterId: String(row.reporter_id ?? row.actor_id ?? ''),
    targetUserId,
    targetNickname: String(row.target_nickname ?? (targetUserId || 'Unknown user')),
    reason: String(row.reason ?? 'User report'),
    status: String(row.status ?? 'open') as AdminReportStatus,
    createdAtMs: Number(row.created_at_ms ?? 0)
  };
}

function userFromSupabaseRow(row: Record<string, unknown>): AdminUser {
  const moderation = (row.moderation ?? {}) as Partial<UserModeration>;
  const verification = (row.verification ?? {}) as { status?: ProfileVerificationStatus };
  const interests = Array.isArray(row.interests) ? row.interests.map(String) : [];

  return {
    id: String(row.id ?? ''),
    nickname: String(row.nickname ?? 'KaTalk member'),
    authContact: String(row.auth_contact ?? ''),
    gender: String(row.gender ?? 'Not set'),
    preference: String(row.preference ?? 'Not set'),
    interests,
    updatedAtMs: Number(row.updated_at_ms ?? 0),
    verificationStatus: verification.status ?? 'not_started',
    isBanned: moderation.isBanned === true,
    banReason: moderation.reason
  };
}

function makeStats(reports: AdminReport[], users: AdminUser[]): AdminStats {
  const reportedUserIds = new Set(reports.map((report) => report.targetUserId).filter(Boolean));

  return {
    totalUsers: users.length,
    bannedUsers: users.filter((user) => user.isBanned).length,
    verifiedUsers: users.filter((user) => user.verificationStatus === 'verified').length,
    pendingVerificationUsers: users.filter(
      (user) => user.verificationStatus === 'manual_pending' || user.verificationStatus === 'fast_track_pending'
    ).length,
    reportedUsers: reportedUserIds.size,
    openReports: reports.filter((report) => report.status === 'open' || report.status === 'reviewing').length
  };
}

function buildDashboardData(reports: AdminReport[], users: AdminUser[]): AdminDashboardData {
  return {
    reports,
    users,
    stats: makeStats(reports, users)
  };
}

export function subscribeAdminAccess(onChange: (isAdmin: boolean) => void): Unsubscribe {
  if (shouldUseSupabase()) {
    let cleanup = () => undefined;
    let disposed = false;
    let activeUid: string | null = null;

    void import('./supabaseClient').then(({ getSupabaseClient }) => {
      if (disposed) {
        return;
      }

      const supabase = getSupabaseClient();

      if (!supabase) {
        onChange(false);
        return;
      }

      const supabaseClient = supabase;

      async function checkAdmin(uid: string | null) {
        activeUid = uid;

        if (!uid) {
          onChange(false);
          return;
        }

        const { data, error } = await supabaseClient
          .from('admins')
          .select('disabled')
          .eq('id', uid)
          .maybeSingle();
        const adminRow = data as { disabled?: boolean } | null;

        if (!disposed && activeUid === uid) {
          onChange(!error && Boolean(adminRow) && adminRow?.disabled !== true);
        }
      }

      const authUnsubscribe = subscribeAuthUser((uid) => {
        void checkAdmin(uid);
      });
      const channel = supabaseClient
        .channel('admin-access')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'admins' }, () => {
          void checkAdmin(activeUid);
        })
        .subscribe();

      cleanup = () => {
        authUnsubscribe();
        void supabaseClient.removeChannel(channel);
      };
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }

  const db = getAdminDb();

  if (!db) {
    onChange(false);
    return () => undefined;
  }

  let adminUnsubscribe: Unsubscribe | null = null;

  const authUnsubscribe = subscribeFirebaseAuthUser((uid) => {
    adminUnsubscribe?.();
    adminUnsubscribe = null;

    if (!uid) {
      onChange(false);
      return;
    }

    adminUnsubscribe = onSnapshot(
      doc(db, ADMIN_COLLECTION, uid),
      (snapshot) => {
        const data = snapshot.data();
        onChange(snapshot.exists() && data?.disabled !== true);
      },
      () => onChange(false)
    );
  });

  return () => {
    adminUnsubscribe?.();
    authUnsubscribe();
  };
}

export function subscribeAdminDashboard(
  onData: (data: AdminDashboardData) => void,
  onError: (message: string) => void
): Unsubscribe {
  if (shouldUseSupabase()) {
    let cleanup = () => undefined;
    let disposed = false;

    void import('./supabaseClient').then(({ getSupabaseClient }) => {
      if (disposed) {
        return;
      }

      const supabase = getSupabaseClient();

      if (!supabase) {
        onError('Admin dashboard needs Supabase sign-in.');
        return;
      }

      const supabaseClient = supabase;

      async function loadDashboard() {
        const [reportsResult, usersResult] = await Promise.all([
          supabaseClient.from('reports').select('*').order('created_at_ms', { ascending: false }).limit(100),
          supabaseClient.from('profiles').select('*').limit(250)
        ]);

        if (reportsResult.error) {
          onError(reportsResult.error.message || 'Admin reports could not load.');
          return;
        }

        if (usersResult.error) {
          onError(usersResult.error.message || 'Admin users could not load.');
          return;
        }

        onData(
          buildDashboardData(
            ((reportsResult.data ?? []) as Record<string, unknown>[]).map(reportFromSupabaseRow),
            ((usersResult.data ?? []) as Record<string, unknown>[]).map(userFromSupabaseRow)
          )
        );
      }

      void loadDashboard();

      const channel = supabaseClient
        .channel('admin-dashboard')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, () => {
          void loadDashboard();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
          void loadDashboard();
        })
        .subscribe();

      cleanup = () => {
        void supabaseClient.removeChannel(channel);
      };
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }

  const db = getAdminDb();

  if (!db) {
    onError('Admin dashboard needs Firebase sign-in.');
    return () => undefined;
  }

  let reports: AdminReport[] = [];
  let users: AdminUser[] = [];

  function publish() {
    onData(buildDashboardData(reports, users));
  }

  const unsubscribeReports = onSnapshot(
    query(collection(db, REPORT_COLLECTION), orderBy('createdAtMs', 'desc'), limit(100)),
    (snapshot) => {
      reports = snapshot.docs.map((item) => reportFromDoc(item.id, item.data()));
      publish();
    },
    (error) => onError(adminErrorMessage(error))
  );

  const unsubscribeUsers = onSnapshot(
    query(collection(db, USER_PROFILE_COLLECTION), limit(250)),
    (snapshot) => {
      users = snapshot.docs.map((item) => userFromDoc(item.id, item.data()));
      publish();
    },
    (error) => onError(adminErrorMessage(error))
  );

  return () => {
    unsubscribeReports();
    unsubscribeUsers();
  };
}

export async function banAdminUser(userId: string, reason = 'Banned by admin') {
  if (shouldUseSupabase()) {
    const { getSupabaseClient } = await import('./supabaseClient');
    const supabase = getSupabaseClient();
    const adminId = getCurrentAuthUserId();

    if (!supabase || !adminId) {
      throw new Error('Admin action needs Supabase sign-in.');
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        moderation: {
          isBanned: true,
          reason,
          bannedAt: new Date().toISOString(),
          bannedBy: adminId
        },
        updated_at_ms: Date.now(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      throw new Error(error.message || 'Admin ban failed.');
    }

    return;
  }

  const db = getAdminDb();
  const adminId = getCurrentFirebaseUserId();

  if (!db || !adminId) {
    throw new Error('Admin action needs Firebase sign-in.');
  }

  await setDoc(
    doc(db, USER_PROFILE_COLLECTION, userId),
    {
      moderation: {
        isBanned: true,
        reason,
        bannedAt: new Date().toISOString(),
        bannedBy: adminId
      },
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function unbanAdminUser(userId: string) {
  if (shouldUseSupabase()) {
    const { getSupabaseClient } = await import('./supabaseClient');
    const supabase = getSupabaseClient();
    const adminId = getCurrentAuthUserId();

    if (!supabase || !adminId) {
      throw new Error('Admin action needs Supabase sign-in.');
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        moderation: {
          isBanned: false,
          unbannedAt: new Date().toISOString(),
          unbannedBy: adminId
        },
        updated_at_ms: Date.now(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      throw new Error(error.message || 'Admin unban failed.');
    }

    return;
  }

  const db = getAdminDb();
  const adminId = getCurrentFirebaseUserId();

  if (!db || !adminId) {
    throw new Error('Admin action needs Firebase sign-in.');
  }

  await setDoc(
    doc(db, USER_PROFILE_COLLECTION, userId),
    {
      moderation: {
        isBanned: false,
        unbannedAt: new Date().toISOString(),
        unbannedBy: adminId
      },
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function manuallyVerifyAdminUser(userId: string) {
  if (shouldUseSupabase()) {
    const { getSupabaseClient } = await import('./supabaseClient');
    const supabase = getSupabaseClient();
    const adminId = getCurrentAuthUserId();

    if (!supabase || !adminId) {
      throw new Error('Admin action needs Supabase sign-in.');
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        verification: {
          status: 'verified',
          badgeVisible: true,
          method: 'manual',
          verifiedAt: new Date().toISOString(),
          verifiedBy: adminId
        },
        updated_at_ms: Date.now(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      throw new Error(error.message || 'Admin verification failed.');
    }

    return;
  }

  const db = getAdminDb();
  const adminId = getCurrentFirebaseUserId();

  if (!db || !adminId) {
    throw new Error('Admin action needs Firebase sign-in.');
  }

  await setDoc(
    doc(db, USER_PROFILE_COLLECTION, userId),
    {
      verification: {
        status: 'verified',
        badgeVisible: true,
        method: 'manual',
        verifiedAt: new Date().toISOString(),
        verifiedBy: adminId
      },
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export function adminErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';

  if (code.includes('permission-denied')) {
    return 'This account is not allowed to open the admin dashboard.';
  }

  return code ? `Admin dashboard failed because Firebase returned ${code}.` : 'Admin dashboard could not load.';
}
