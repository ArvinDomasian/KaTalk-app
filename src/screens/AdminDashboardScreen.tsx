import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../components/AppText';
import { PressableScale } from '../components/PressableScale';
import {
  adminErrorMessage,
  banAdminUser,
  manuallyVerifyAdminUser,
  subscribeAdminAccess,
  subscribeAdminDashboard,
  unbanAdminUser,
  type AdminDashboardData,
  type AdminReport,
  type AdminUser
} from '../services/adminService';
import { colors } from '../theme';

type Props = {
  darkMode: boolean;
  onClose: () => void;
};

const emptyDashboard: AdminDashboardData = {
  reports: [],
  users: [],
  stats: {
    totalUsers: 0,
    bannedUsers: 0,
    verifiedUsers: 0,
    pendingVerificationUsers: 0,
    reportedUsers: 0,
    openReports: 0
  }
};

export function AdminDashboardScreen({ darkMode, onClose }: Props) {
  const [accessState, setAccessState] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const [dashboard, setDashboard] = useState<AdminDashboardData>(emptyDashboard);
  const [status, setStatus] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => subscribeAdminAccess((isAdmin) => setAccessState(isAdmin ? 'allowed' : 'denied')), []);

  useEffect(() => {
    if (accessState !== 'allowed') {
      return undefined;
    }

    return subscribeAdminDashboard(
      (nextDashboard) => {
        setDashboard(nextDashboard);
        setStatus(null);
      },
      setStatus
    );
  }, [accessState]);

  const usersById = useMemo(() => {
    const map = new Map<string, AdminUser>();
    dashboard.users.forEach((user) => map.set(user.id, user));
    return map;
  }, [dashboard.users]);

  async function runAdminAction(userId: string, action: () => Promise<void>, successMessage: string) {
    setBusyUserId(userId);
    setStatus(null);

    try {
      await action();
      setStatus(successMessage);
    } catch (error) {
      setStatus(adminErrorMessage(error));
    } finally {
      setBusyUserId(null);
    }
  }

  function confirmBan(user: AdminUser) {
    Alert.alert(`Ban ${user.nickname}?`, 'This account will be blocked by moderation.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Ban',
        style: 'destructive',
        onPress: () =>
          void runAdminAction(
            user.id,
            () => banAdminUser(user.id, 'Admin moderation action'),
            `${user.nickname} was banned.`
          )
      }
    ]);
  }

  function verifyUser(user: AdminUser) {
    void runAdminAction(
      user.id,
      () => manuallyVerifyAdminUser(user.id),
      `${user.nickname} was manually verified.`
    );
  }

  function unbanUser(user: AdminUser) {
    void runAdminAction(user.id, () => unbanAdminUser(user.id), `${user.nickname} was unbanned.`);
  }

  if (accessState === 'checking') {
    return (
      <View style={[styles.centerRoot, darkMode && styles.rootDark]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <AppText style={[styles.centerTitle, darkMode && styles.textOnDark]}>Checking admin access</AppText>
      </View>
    );
  }

  if (accessState === 'denied') {
    return (
      <View style={[styles.centerRoot, darkMode && styles.rootDark]}>
        <View style={styles.lockIcon}>
          <Ionicons name="lock-closed-outline" size={34} color={colors.onAccent} />
        </View>
        <AppText style={[styles.centerTitle, darkMode && styles.textOnDark]}>Admin access only</AppText>
        <AppText style={[styles.centerCopy, darkMode && styles.mutedOnDark]}>
          This dashboard is hidden unless your account is listed as an admin.
        </AppText>
        <PressableScale accessibilityRole="button" onPress={onClose} style={styles.backButton}>
          <AppText style={styles.backButtonText}>Back to app</AppText>
        </PressableScale>
      </View>
    );
  }

  return (
    <View style={[styles.root, darkMode && styles.rootDark]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <AppText style={[styles.title, darkMode && styles.textOnDark]}>Admin Dashboard</AppText>
            <AppText style={[styles.subtitle, darkMode && styles.mutedOnDark]}>
              Reports, bans, verification, and user stats.
            </AppText>
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Close admin dashboard"
            onPress={onClose}
            style={[styles.closeButton, darkMode && styles.cardDark]}
          >
            <Ionicons name="close-outline" size={22} color={darkMode ? colors.onAccent : colors.ink} />
          </PressableScale>
        </View>

        {status ? (
          <View style={[styles.statusBox, darkMode && styles.cardDark]}>
            <AppText style={[styles.statusText, darkMode && styles.textOnDark]}>{status}</AppText>
          </View>
        ) : null}

        <View style={styles.statsGrid}>
          <StatCard label="Users" value={dashboard.stats.totalUsers} darkMode={darkMode} />
          <StatCard label="Reports" value={dashboard.stats.openReports} tone="warn" darkMode={darkMode} />
          <StatCard label="Banned" value={dashboard.stats.bannedUsers} tone="danger" darkMode={darkMode} />
          <StatCard label="Verified" value={dashboard.stats.verifiedUsers} tone="success" darkMode={darkMode} />
          <StatCard label="Pending Verify" value={dashboard.stats.pendingVerificationUsers} darkMode={darkMode} />
          <StatCard label="Reported Users" value={dashboard.stats.reportedUsers} tone="warn" darkMode={darkMode} />
        </View>

        <View style={styles.section}>
          <SectionTitle title="Reported users" count={dashboard.reports.length} darkMode={darkMode} />
          {dashboard.reports.length > 0 ? (
            dashboard.reports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                user={usersById.get(report.targetUserId)}
                busyUserId={busyUserId}
                darkMode={darkMode}
                onBan={confirmBan}
                onUnban={unbanUser}
                onVerify={verifyUser}
              />
            ))
          ) : (
            <EmptyCard text="No reports yet." darkMode={darkMode} />
          )}
        </View>

        <View style={styles.section}>
          <SectionTitle title="Users" count={dashboard.users.length} darkMode={darkMode} />
          {dashboard.users.length > 0 ? (
            dashboard.users.map((user) => (
              <UserModerationCard
                key={user.id}
                user={user}
                busyUserId={busyUserId}
                darkMode={darkMode}
                onBan={confirmBan}
                onUnban={unbanUser}
                onVerify={verifyUser}
              />
            ))
          ) : (
            <EmptyCard text="No user profiles loaded yet." darkMode={darkMode} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function StatCard({
  label,
  value,
  tone = 'accent',
  darkMode
}: {
  label: string;
  value: number;
  tone?: 'accent' | 'warn' | 'danger' | 'success';
  darkMode: boolean;
}) {
  const toneColor =
    tone === 'danger' ? colors.danger : tone === 'warn' ? colors.warn : tone === 'success' ? colors.success : colors.accent;

  return (
    <View style={[styles.statCard, darkMode && styles.cardDark]}>
      <AppText style={[styles.statValue, { color: toneColor }]}>{value}</AppText>
      <AppText style={[styles.statLabel, darkMode && styles.mutedOnDark]}>{label}</AppText>
    </View>
  );
}

function SectionTitle({ title, count, darkMode }: { title: string; count: number; darkMode: boolean }) {
  return (
    <View style={styles.sectionTitleRow}>
      <AppText style={[styles.sectionTitle, darkMode && styles.textOnDark]}>{title}</AppText>
      <View style={styles.countPill}>
        <AppText style={styles.countText}>{count}</AppText>
      </View>
    </View>
  );
}

function ReportCard({
  report,
  user,
  busyUserId,
  darkMode,
  onBan,
  onUnban,
  onVerify
}: {
  report: AdminReport;
  user?: AdminUser;
  busyUserId: string | null;
  darkMode: boolean;
  onBan: (user: AdminUser) => void;
  onUnban: (user: AdminUser) => void;
  onVerify: (user: AdminUser) => void;
}) {
  const targetUser = user ?? {
    id: report.targetUserId,
    nickname: report.targetNickname,
    authContact: '',
    gender: 'Unknown',
    preference: 'Unknown',
    interests: [],
    updatedAtMs: 0,
    verificationStatus: 'not_started' as const,
    isBanned: false
  };

  return (
    <View style={[styles.card, darkMode && styles.cardDark]}>
      <View style={styles.cardTop}>
        <View style={styles.avatarCircle}>
          <AppText style={styles.avatarInitial}>{targetUser.nickname.charAt(0).toUpperCase() || 'K'}</AppText>
        </View>
        <View style={styles.cardCopy}>
          <AppText style={[styles.cardTitle, darkMode && styles.textOnDark]}>{targetUser.nickname}</AppText>
          <AppText style={[styles.cardMeta, darkMode && styles.mutedOnDark]}>
            {report.source} report - {report.reason}
          </AppText>
          <AppText style={[styles.cardMetaSmall, darkMode && styles.mutedOnDark]}>
            Reporter: {shortId(report.reporterId)} / Target: {shortId(report.targetUserId)}
          </AppText>
        </View>
        <StatusBadge label={report.status} tone={report.status === 'open' ? 'warn' : 'neutral'} />
      </View>
      <ModerationActions
        user={targetUser}
        busy={busyUserId === targetUser.id}
        onBan={onBan}
        onUnban={onUnban}
        onVerify={onVerify}
      />
    </View>
  );
}

function UserModerationCard({
  user,
  busyUserId,
  darkMode,
  onBan,
  onUnban,
  onVerify
}: {
  user: AdminUser;
  busyUserId: string | null;
  darkMode: boolean;
  onBan: (user: AdminUser) => void;
  onUnban: (user: AdminUser) => void;
  onVerify: (user: AdminUser) => void;
}) {
  return (
    <View style={[styles.card, darkMode && styles.cardDark]}>
      <View style={styles.cardTop}>
        <View style={styles.avatarCircle}>
          <AppText style={styles.avatarInitial}>{user.nickname.charAt(0).toUpperCase() || 'K'}</AppText>
        </View>
        <View style={styles.cardCopy}>
          <AppText style={[styles.cardTitle, darkMode && styles.textOnDark]}>{user.nickname}</AppText>
          <AppText style={[styles.cardMeta, darkMode && styles.mutedOnDark]}>
            {user.gender} - Looking for {user.preference}
          </AppText>
          <AppText style={[styles.cardMetaSmall, darkMode && styles.mutedOnDark]}>
            {user.authContact || shortId(user.id)}
          </AppText>
        </View>
        <View style={styles.badgeStack}>
          <StatusBadge label={user.isBanned ? 'Banned' : 'Active'} tone={user.isBanned ? 'danger' : 'success'} />
          <StatusBadge
            label={user.verificationStatus === 'verified' ? 'Verified' : 'Unverified'}
            tone={user.verificationStatus === 'verified' ? 'success' : 'neutral'}
          />
        </View>
      </View>
      {user.interests.length > 0 ? (
        <View style={styles.chipRow}>
          {user.interests.slice(0, 4).map((interest) => (
            <View key={interest} style={styles.chip}>
              <AppText style={styles.chipText}>{interest}</AppText>
            </View>
          ))}
        </View>
      ) : null}
      <ModerationActions
        user={user}
        busy={busyUserId === user.id}
        onBan={onBan}
        onUnban={onUnban}
        onVerify={onVerify}
      />
    </View>
  );
}

function ModerationActions({
  user,
  busy,
  onBan,
  onUnban,
  onVerify
}: {
  user: AdminUser;
  busy: boolean;
  onBan: (user: AdminUser) => void;
  onUnban: (user: AdminUser) => void;
  onVerify: (user: AdminUser) => void;
}) {
  return (
    <View style={styles.actionRow}>
      <ActionButton
        label={user.isBanned ? 'Unban' : 'Ban'}
        tone={user.isBanned ? 'accent' : 'danger'}
        disabled={busy}
        onPress={() => (user.isBanned ? onUnban(user) : onBan(user))}
      />
      <ActionButton
        label={user.verificationStatus === 'verified' ? 'Verified' : 'Verify'}
        tone="success"
        disabled={busy || user.verificationStatus === 'verified'}
        onPress={() => onVerify(user)}
      />
    </View>
  );
}

function ActionButton({
  label,
  tone,
  disabled,
  onPress
}: {
  label: string;
  tone: 'accent' | 'danger' | 'success';
  disabled?: boolean;
  onPress: () => void;
}) {
  const background =
    tone === 'danger' ? colors.dangerSoft : tone === 'success' ? '#EAF8F0' : colors.accentSoft;
  const foreground =
    tone === 'danger' ? colors.danger : tone === 'success' ? colors.success : colors.accent;

  return (
    <PressableScale
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.actionButton, { backgroundColor: background }, disabled && styles.disabledButton]}
    >
      <AppText style={[styles.actionText, { color: foreground }]}>{disabled ? 'Working...' : label}</AppText>
    </PressableScale>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: 'neutral' | 'warn' | 'danger' | 'success' }) {
  const background =
    tone === 'danger'
      ? colors.dangerSoft
      : tone === 'warn'
        ? '#FFF5DA'
        : tone === 'success'
          ? '#EAF8F0'
          : colors.surfaceMuted;
  const foreground =
    tone === 'danger'
      ? colors.danger
      : tone === 'warn'
        ? colors.warn
        : tone === 'success'
          ? colors.success
          : colors.muted;

  return (
    <View style={[styles.statusBadge, { backgroundColor: background }]}>
      <AppText style={[styles.statusBadgeText, { color: foreground }]}>{label}</AppText>
    </View>
  );
}

function EmptyCard({ text, darkMode }: { text: string; darkMode: boolean }) {
  return (
    <View style={[styles.emptyCard, darkMode && styles.cardDark]}>
      <AppText style={[styles.emptyText, darkMode && styles.mutedOnDark]}>{text}</AppText>
    </View>
  );
}

function shortId(value: string) {
  if (!value) {
    return 'unknown';
  }

  return value.length > 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background
  },
  rootDark: {
    backgroundColor: '#101217'
  },
  centerRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: colors.background
  },
  textOnDark: {
    color: colors.onAccent
  },
  mutedOnDark: {
    color: '#BBC1CC'
  },
  cardDark: {
    borderColor: '#2A2E38',
    backgroundColor: '#171A22'
  },
  content: {
    padding: 16,
    paddingBottom: 28,
    gap: 16
  },
  header: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  headerCopy: {
    flex: 1
  },
  title: {
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '900'
  },
  subtitle: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700'
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface
  },
  statusBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    backgroundColor: colors.surface
  },
  statusText: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800'
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  statCard: {
    width: '48%',
    minHeight: 82,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    justifyContent: 'center',
    backgroundColor: colors.surface
  },
  statValue: {
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '900'
  },
  statLabel: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800'
  },
  section: {
    gap: 10
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  sectionTitle: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '900'
  },
  countPill: {
    minWidth: 34,
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  countText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: '900'
  },
  card: {
    gap: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    backgroundColor: colors.surface
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  avatarInitial: {
    color: colors.onAccent,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '900'
  },
  cardCopy: {
    flex: 1,
    minWidth: 0
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900'
  },
  cardMeta: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  cardMetaSmall: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700'
  },
  badgeStack: {
    gap: 5,
    alignItems: 'flex-end'
  },
  statusBadge: {
    minHeight: 24,
    borderRadius: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusBadgeText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    textTransform: 'capitalize'
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  chip: {
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted
  },
  chipText: {
    color: colors.ink,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800'
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8
  },
  actionButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  actionText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900'
  },
  disabledButton: {
    opacity: 0.5
  },
  emptyCard: {
    minHeight: 92,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    backgroundColor: colors.surface
  },
  emptyText: {
    color: colors.muted,
    fontWeight: '800'
  },
  centerTitle: {
    color: colors.ink,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
    textAlign: 'center'
  },
  centerCopy: {
    maxWidth: 320,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '700'
  },
  lockIcon: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  backButton: {
    minHeight: 46,
    borderRadius: 8,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent
  },
  backButtonText: {
    color: colors.onAccent,
    fontWeight: '900'
  }
});
