/* eslint-disable no-console */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const exportDir = process.argv[2];
const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!exportDir || !supabaseUrl || !serviceRoleKey) {
  console.error(
    'Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-firebase-export-to-supabase.js ./firebase-export'
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

function readJsonFile(name, fallback = []) {
  const filePath = path.join(exportDir, name);

  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function arrayFromExport(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).map(([id, data]) => ({ id, ...data }));
  }

  return [];
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function safeDateOfBirth(value) {
  return typeof value === 'string' && value ? value : '2000-01-01';
}

function safeInterests(value, fallback = ['Coffee', 'Music', 'Deep talks']) {
  return Array.isArray(value) && value.length > 0 ? value.map(String) : fallback;
}

function temporaryPassword() {
  return `KaTalk-${crypto.randomUUID()}-ResetMe1`;
}

async function listAuthUsersByEmail() {
  const usersByEmail = new Map();
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });

    if (error) {
      throw new Error(`Could not list Supabase users: ${error.message}`);
    }

    for (const user of data.users) {
      if (user.email) {
        usersByEmail.set(user.email.toLowerCase(), user.id);
      }
    }

    if (data.users.length < 1000) {
      break;
    }

    page += 1;
  }

  return usersByEmail;
}

async function resolveSupabaseUserIds(profiles) {
  const usersByEmail = await listAuthUsersByEmail();
  const legacyToSupabase = new Map();

  for (const profile of profiles) {
    if (profile.supabaseUserId && isUuid(profile.supabaseUserId)) {
      legacyToSupabase.set(profile.id, profile.supabaseUserId);
      continue;
    }

    if (isUuid(profile.id)) {
      legacyToSupabase.set(profile.id, profile.id);
      continue;
    }

    const email = String(profile.authContact || '').toLowerCase();

    if (!email.includes('@')) {
      console.warn(`Skipping ${profile.id}: no email/authContact available for Supabase Auth creation.`);
      continue;
    }

    const existingUserId = usersByEmail.get(email);

    if (existingUserId) {
      legacyToSupabase.set(profile.id, existingUserId);
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: temporaryPassword(),
      email_confirm: true,
      user_metadata: {
        display_name: profile.nickname || 'KaTalk member',
        legacy_firebase_uid: profile.id
      }
    });

    if (error || !data.user) {
      console.warn(`Skipping ${profile.id}: could not create Supabase user (${error?.message || 'unknown error'}).`);
      continue;
    }

    usersByEmail.set(email, data.user.id);
    legacyToSupabase.set(profile.id, data.user.id);
  }

  return legacyToSupabase;
}

function mapLegacyId(value, legacyToSupabase) {
  if (!value) {
    return null;
  }

  if (isUuid(value)) {
    return value;
  }

  return legacyToSupabase.get(value) || null;
}

function attachSupabaseId(item, legacyToSupabase, idValue = item.id) {
  const supabaseUserId = mapLegacyId(idValue, legacyToSupabase);

  if (!supabaseUserId) {
    return null;
  }

  return {
    ...item,
    supabaseUserId
  };
}

function profileRowsFromFirebaseProfiles(profiles) {
  return profiles.map((profile) => {
    const interests = safeInterests(profile.interests);

    return {
      id: profile.supabaseUserId,
      legacy_firebase_uid: profile.id,
      nickname: profile.nickname || 'KaTalk member',
      avatar_url: profile.avatarUrl || null,
      date_of_birth: safeDateOfBirth(profile.dateOfBirth),
      gender: profile.gender || 'Prefer not to say',
      preference: profile.preference || 'Everyone',
      age_range: profile.ageRange || '21-35',
      interests,
      comfort: profile.comfort || 'balanced',
      auth_method: profile.authMethod || 'google',
      auth_contact: profile.authContact || null,
      accepted_terms: profile.acceptedTerms !== false,
      accepted_privacy: profile.acceptedPrivacy !== false,
      accepted_rules: profile.acceptedRules !== false,
      subscription: profile.subscription || null,
      economy: profile.economy || null,
      verification: profile.verification || { status: 'not_started', badgeVisible: false },
      moderation: profile.moderation || { isBanned: false },
      updated_at_ms: Date.now(),
      updated_at: new Date().toISOString()
    };
  });
}

function publicRowsFromProfiles(profiles) {
  return profiles.map((profile) => {
    const interests = safeInterests(profile.interests, ['Quiet conversations']);

    return {
      id: profile.supabaseUserId,
      legacy_firebase_uid: profile.id,
      nickname: profile.nickname || 'KaTalk member',
      photo_url: profile.avatarUrl || profile.photoUrl || null,
      date_of_birth: safeDateOfBirth(profile.dateOfBirth),
      gender: profile.gender || 'Prefer not to say',
      preference: profile.preference || 'Everyone',
      age_range: profile.ageRange || '21-35',
      interests,
      comfort: profile.comfort || 'balanced',
      prompt: profile.prompt || `Registered KaTalk member who likes ${interests.slice(0, 2).join(' and ')}.`,
      updated_at_ms: Date.now(),
      updated_at: new Date().toISOString()
    };
  });
}

function postRowsFromFirebasePosts(posts, legacyToSupabase) {
  return posts
    .map((post) => {
      const profileId = mapLegacyId(post.profileId, legacyToSupabase);

      return {
        id: post.id,
        profile_id: profileId,
        author_nickname: post.authorNickname || 'KaTalk member',
        body: post.body || '',
        photo_url: post.photoUrl || null,
        emoji: post.emoji || null,
        voice_url: post.voiceUrl || null,
        music_url: post.musicUrl || null,
        music_title: post.musicTitle || null,
        visibility: post.visibility === 'private' ? 'private' : 'public',
        created_at_ms: Number(post.createdAtMs || Date.now()),
        created_at: new Date(Number(post.createdAtMs || Date.now())).toISOString(),
        updated_at: new Date().toISOString()
      };
    })
    .filter((post) => post.profile_id);
}

function reportRowsFromFirebaseReports(reports, legacyToSupabase) {
  return reports
    .map((report) => ({
      source: report.source || 'report',
      action: report.action || 'report',
      reporter_id: mapLegacyId(report.reporterId || report.actorId, legacyToSupabase),
      actor_id: mapLegacyId(report.actorId || report.reporterId, legacyToSupabase),
      target_user_id: mapLegacyId(report.targetUserId, legacyToSupabase),
      target_id: report.targetId || report.targetUserId || null,
      target_nickname: report.targetNickname || null,
      match_id: report.matchId || null,
      reason: report.reason || 'User report',
      status: report.status || 'open',
      created_at_ms: Number(report.createdAtMs || Date.now()),
      created_at: new Date(Number(report.createdAtMs || Date.now())).toISOString(),
      updated_at: new Date().toISOString()
    }))
    .filter((report) => report.reporter_id);
}

function blockRowsFromFirebaseBlocks(blocks, legacyToSupabase) {
  return blocks
    .map((block) => {
      const blockerId = mapLegacyId(block.blockerId, legacyToSupabase);
      const blockedId = mapLegacyId(block.blockedId, legacyToSupabase);

      return {
        id: blockerId && blockedId ? `${blockerId}_${blockedId}` : block.id,
        blocker_id: blockerId,
        blocked_id: blockedId,
        match_id: block.matchId || block.videoMatchId || null,
        source: block.videoMatchId ? 'video' : 'message_match',
        created_at: new Date().toISOString()
      };
    })
    .filter((block) => block.blocker_id && block.blocked_id);
}

async function upsertInChunks(table, rows, chunkSize = 100) {
  if (rows.length === 0) {
    console.log(`No ${table} rows to migrate.`);
    return;
  }

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk);

    if (error) {
      throw new Error(`${table} migration failed: ${error.message}`);
    }
  }

  console.log(`Migrated ${rows.length} ${table} rows.`);
}

async function main() {
  const profiles = arrayFromExport(readJsonFile('userProfiles.json'));
  const publicProfiles = arrayFromExport(readJsonFile('liveProfiles.json'));
  const posts = arrayFromExport(readJsonFile('profilePosts.json'));
  const reports = arrayFromExport(readJsonFile('reports.json'));
  const admins = arrayFromExport(readJsonFile('admins.json'));
  const blocks = arrayFromExport(readJsonFile('liveBlocks.json'));
  const legacyToSupabase = await resolveSupabaseUserIds(profiles);
  const mappedProfiles = profiles
    .map((profile) => attachSupabaseId(profile, legacyToSupabase))
    .filter(Boolean);
  const mappedPublicProfiles = (publicProfiles.length > 0 ? publicProfiles : profiles)
    .map((profile) => attachSupabaseId(profile, legacyToSupabase, profile.id || profile.uid))
    .filter(Boolean);

  await upsertInChunks('profiles', profileRowsFromFirebaseProfiles(mappedProfiles));
  await upsertInChunks('public_profiles', publicRowsFromProfiles(mappedPublicProfiles));
  await upsertInChunks('profile_posts', postRowsFromFirebasePosts(posts, legacyToSupabase));
  await upsertInChunks('reports', reportRowsFromFirebaseReports(reports, legacyToSupabase));
  await upsertInChunks('blocks', blockRowsFromFirebaseBlocks(blocks, legacyToSupabase));
  await upsertInChunks(
    'admins',
    admins
      .map((admin) => ({
        id: mapLegacyId(admin.id, legacyToSupabase),
        role: admin.role || 'admin',
        disabled: admin.disabled === true,
        created_at: new Date().toISOString()
      }))
      .filter((admin) => admin.id)
  );
  await upsertInChunks(
    'legacy_id_map',
    mappedProfiles.map((profile) => ({
      legacy_firebase_uid: profile.id,
      supabase_user_id: profile.supabaseUserId,
      email: profile.authContact || null,
      migrated_at: new Date().toISOString()
    }))
  );

  console.log('Firebase export migration completed. Existing users must use Supabase password reset before logging in.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
