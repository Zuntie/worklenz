import { discordBot } from './discord-bot-service';
import { log_error } from '../utils';

/**
 * In-memory cache for Discord guild members
 * Maintains a synchronized member list to reduce API calls
 * Prevents performance degradation from repeated Discord API queries
 *
 * @class DiscordGuildCache
 * @singleton
 */
export class DiscordGuildCache {
  private memberIds: Set<string> = new Set();
  private lastSync: Date | null = null;
  private syncInProgress = false;

  /**
   * Synchronize guild member list from Discord API
   * Updates the in-memory cache with current guild members
   * Prevents concurrent sync operations to avoid race conditions
   *
   * @throws {Error} If guild ID is missing or sync fails
   * @returns {Promise<void>}
   */
  public async syncGuildMembers(): Promise<void> {
    if (this.syncInProgress) {
      console.log('[Discord Cache] Sync already in progress, skipping...');
      return;
    }

    const guildId = process.env.DISCORD_GUILD_ID;
    if (!guildId) {
      throw new Error('DISCORD_GUILD_ID environment variable is required');
    }

    this.syncInProgress = true;

    try {
      const members = await discordBot.fetchGuildMembers(guildId);
      this.memberIds = new Set(members.map(m => m.user.id));
      this.lastSync = new Date();

      console.log(`[Discord Cache] Synced ${this.memberIds.size} members at ${this.lastSync.toISOString()}`);
    } catch (error: any) {
      log_error(error);
      throw new Error(`Guild sync failed: ${error?.message || 'Unknown error'}`);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Check if Discord user ID exists in cached member list
   * Fast O(1) lookup against cached members
   *
   * @param {string} discordId - Discord user ID
   * @returns {boolean} True if user is cached guild member
   */
  public isMember(discordId: string): boolean {
    return this.memberIds.has(discordId);
  }

  /**
   * Get total cached member count
   *
   * @returns {number} Number of cached members
   */
  public getMemberCount(): number {
    return this.memberIds.size;
  }

  /**
   * Get last sync timestamp
   *
   * @returns {Date | null} Last sync date or null if never synced
   */
  public getLastSync(): Date | null {
    return this.lastSync;
  }

  /**
   * Check if sync is currently in progress
   *
   * @returns {boolean} True if sync operation is active
   */
  public isSyncInProgress(): boolean {
    return this.syncInProgress;
  }

  /**
   * Clear cache (useful for testing or manual reset)
   *
   * @returns {void}
   */
  public clear(): void {
    this.memberIds.clear();
    this.lastSync = null;
  }

  /**
   * Get all cached member IDs (for debugging)
   *
   * @returns {string[]} Array of cached Discord user IDs
   */
  public getMemberIds(): string[] {
    return Array.from(this.memberIds);
  }
}

// Singleton instance for application-wide use
export const guildCache = new DiscordGuildCache();
