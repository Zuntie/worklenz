import { CronJob } from 'cron';
import { guildCache } from '../shared/discord/discord-guild-cache';
import db from '../config/db';
import { log_error } from '../shared/utils';

/**
 * Discord Guild Verification Cronjob
 *
 * Purpose: Enforce guild membership by:
 * 1. Refreshing guild member cache every 5 minutes
 * 2. Invalidating sessions of users who left the Discord server
 * 3. Maintaining cache consistency with actual guild membership
 *
 * Schedule: every 5 minutes
 * Cron Format: second minute hour day month day-of-week
 */

const CRON_SCHEDULE = '*/5 * * * *'; // Every 5 minutes

/**
 * Execute guild verification tick
 * Synchronizes cache and invalidates sessions for non-members
 *
 * @private
 * @returns {Promise<void>}
 */
async function onGuildVerificationTick(): Promise<void> {
  console.log('[Discord Cronjob] Starting guild verification...');

  try {
    // Step 1: Refresh guild member cache from Discord API
    await guildCache.syncGuildMembers();

    // Step 2: Find all active Discord user sessions from database
    const sessionsQuery = await db.query(`
      SELECT
        sess->'passport'->'user'->>'id' as user_id,
        sess->'passport'->'user'->>'discord_id' as discord_id,
        sid
      FROM pg_sessions
      WHERE
        sess->'passport'->'user'->>'discord_id' IS NOT NULL
        AND expire > NOW()
    `);

    let deletedCount = 0;

    // Step 3: Verify each session against guild cache
    for (const session of sessionsQuery.rows) {
      const { user_id, discord_id, sid } = session;

      if (!discord_id) continue;

      const isMember = guildCache.isMember(discord_id);

      if (!isMember) {
        // User left guild - invalidate session to force re-authentication
        await db.query('DELETE FROM pg_sessions WHERE sid = $1', [sid]);
        deletedCount++;

        console.log(
          `[Discord Cronjob] Session invalidated: User ${user_id} (Discord: ${discord_id}) left guild`
        );
      }
    }

    console.log(
      `[Discord Cronjob] Verification complete. ${deletedCount} sessions invalidated. Cache size: ${guildCache.getMemberCount()}`
    );
  } catch (error) {
    log_error(error);
    console.error('[Discord Cronjob] Guild verification failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * Start Discord guild verification cronjob
 * Runs verification every 5 minutes to maintain access control
 * Continues running until process exit
 *
 * @public
 * @returns {void}
 */
export function startDiscordGuildVerificationJob(): void {
  const job = new CronJob(
    CRON_SCHEDULE,
    () => void onGuildVerificationTick(),
    null,
    true // Start job immediately
  );

  job.start();
  console.log(`[Discord Cronjob] Started with schedule: ${CRON_SCHEDULE}`);
}
