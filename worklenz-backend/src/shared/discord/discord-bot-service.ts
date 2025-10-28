import { Client, Intents, Guild, GuildMember } from 'discord.js';
import { log_error } from '../utils';

/**
 * Discord bot service for guild member verification
 * Maintains a persistent connection to Discord API via WebSocket
 * Handles bot initialization, guild member fetching, and reconnection logic
 *
 * @class DiscordBotService
 * @singleton
 */
export class DiscordBotService {
  private client: Client | null = null;
  private initialized = false;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;

  /**
   * Initialize Discord bot client and authenticate with Discord API
   * Establishes WebSocket connection and event handlers
   *
   * @throws {Error} If bot token is missing or authentication fails
   * @returns {Promise<void>}
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[Discord Bot] Already initialized, skipping...');
      return;
    }

    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) {
      throw new Error('DISCORD_BOT_TOKEN environment variable is required');
    }

    try {
      this.client = new Client({
        intents: [
          Intents.FLAGS.GUILDS,
          Intents.FLAGS.GUILD_MEMBERS
        ]
      });

      // Handle connection errors
      this.client.on('error', (error) => {
        log_error(error);
        this.handleReconnect();
      });

      // Handle successful connection
      this.client.on('ready', () => {
        console.log(`[Discord Bot] Connected as ${this.client!.user?.tag}`);
        this.initialized = true;
        this.reconnectAttempts = 0;
      });

      await this.client.login(botToken);
    } catch (error: any) {
      log_error(error);
      throw new Error(`Discord bot initialization failed: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Fetch all members of a specific guild
   * Requires bot to have GUILD_MEMBERS intent and appropriate permissions
   *
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<GuildMember[]>} Array of guild members
   * @throws {Error} If guild fetch fails or bot not initialized
   */
  public async fetchGuildMembers(guildId: string): Promise<GuildMember[]> {
    if (!this.client || !this.initialized) {
      throw new Error('Discord bot not initialized');
    }

    try {
      const guild: Guild = await this.client.guilds.fetch(guildId);
      const members = await guild.members.fetch({ force: true });
      return Array.from(members.values());
    } catch (error: any) {
      log_error(error);
      throw new Error(`Failed to fetch guild members: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Check if user is a member of specified guild
   * Returns false if bot is not initialized rather than throwing
   *
   * @param {string} userId - Discord user ID
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<boolean>} True if user is guild member, false otherwise
   */
  public async isUserInGuild(userId: string, guildId: string): Promise<boolean> {
    if (!this.client || !this.initialized) {
      return false;
    }

    try {
      const guild = await this.client.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId);
      return !!member;
    } catch (error) {
      // User not in guild or guild not found
      return false;
    }
  }

  /**
   * Handle reconnection logic with exponential backoff
   * Attempts to reconnect up to MAX_RECONNECT_ATTEMPTS times
   * with increasing delays between attempts
   *
   * @private
   * @returns {Promise<void>}
   */
  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error('[Discord Bot] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    console.log(`[Discord Bot] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`);

    setTimeout(() => {
      this.initialized = false;
      void this.initialize();
    }, delay);
  }

  /**
   * Gracefully shutdown bot connection
   * Destroys client connection and marks as uninitialized
   *
   * @returns {Promise<void>}
   */
  public async shutdown(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.initialized = false;
      console.log('[Discord Bot] Connection closed');
    }
  }

  /**
   * Get current initialization status
   *
   * @returns {boolean} True if bot is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }
}

// Singleton instance for application-wide use
export const discordBot = new DiscordBotService();
