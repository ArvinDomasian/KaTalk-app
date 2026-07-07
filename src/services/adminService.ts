import type { ProfileVerificationStatus, UserModeration } from '../types';
import { getCurrentAuthUserId, subscribeAuthUser } from './authService';
import { getSupabaseClient } from './supabaseClient';

type Unsubscribe = () => void;

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
  let cleanup = () => undefined;
  let disposed = false;
  let activeUid: string | null = null;
  const supabase = getSupabaseClient();

  if (!supabase) {
    onChange(false);
    return () => undefined;
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

  return () => {
    disposed = true;
    cleanup();
  };
}

export function subscribeAdminDashboard(
  onData: (data: AdminDashboardData) => void,
  onError: (message: string) => void
): Unsubscribe {
  const supabase = getSupabaseClient();

  if (!supabase) {
    onError('Admin dashboard needs Supabase sign-in.');
    return () => undefined;
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

  return () => {
    void supabaseClient.removeChannel(channel);
  };
}

export async function banAdminUser(userId: string, reason = 'Banned by admin') {
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
}

export async function unbanAdminUser(userId: string) {
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
}

export async function manuallyVerifyAdminUser(userId: string) {
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
}

export function adminErrorMessage(error: unknown) {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';

  if (message.toLowerCase().includes('permission')) {
    return 'This account is not allowed to open the admin dashboard.';
  }

  return message || 'Admin dashboard could not load.';
}
