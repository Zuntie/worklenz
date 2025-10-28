import { Strategy as DiscordStrategy } from 'passport-discord';
import { guildCache } from '../../shared/discord/discord-guild-cache';
import { discordBot } from '../../shared/discord/discord-bot-service';
import { sendWelcomeEmail } from '../../shared/email-templates';
import { log_error } from '../../shared/utils';
import db from '../../config/db';
import { ERROR_KEY } from './passport-constants';
import { Request } from 'express';

/**
 * Discord OAuth2.0 Profile interface
 */
interface DiscordProfile {
  id: string;
  username: string;
  email: string;
  avatar: string;
  guilds?: Array<{ id: string; name: string }>;
}

/**
 * Handle Discord OAuth login and registration
 * Verifies guild membership, checks for account conflicts, and registers new users
 *
 * Flow:
 * 1. Verify user is member of required Discord guild
 * 2. Check for existing account with same email (prevents OAuth conflicts)
 * 3. Login existing Discord user or register new one
 * 4. Set active team if user came from team invitation
 *
 * @param {Request} req - Express request object with session
 * @param {string} _accessToken - Discord OAuth access token (unused)
 * @param {string} _refreshToken - Discord OAuth refresh token (unused)
 * @param {DiscordProfile} profile - Discord user profile from OAuth
 * @param {Function} done - Passport callback function
 * @returns {Promise<void>}
 */
async function handleDiscordLogin(
  req: Request,
  _accessToken: string,
  _refreshToken: string,
  profile: DiscordProfile,
  done: Function
): Promise<void> {
  try {
    const guildId = process.env.DISCORD_GUILD_ID;
    if (!guildId) {
      const message = 'Discord guild configuration missing';
      (req.session as any).error = message;
      return done(null, undefined, { message: req.flash(ERROR_KEY, message) });
    }

    // Step 1: Verify guild membership via cache (fast path)
    let isMember = guildCache.isMember(profile.id);

    // Cache miss - verify via live API
    if (!isMember) {
      isMember = await discordBot.isUserInGuild(profile.id, guildId);

      if (!isMember) {
        const message = 'Discord guild membership required. Join our server and try again in 5 minutes.';
        (req.session as any).error = message;
        return done(null, undefined, { message: req.flash(ERROR_KEY, message) });
      }
    }

    // Step 2: Check for existing local account with same email
    const localAccountResult = await db.query(
      'SELECT 1 FROM users WHERE email = $1 AND password IS NOT NULL AND is_deleted = FALSE;',
      [profile.email]
    );

    if (localAccountResult.rowCount) {
      const message = `An account already exists for ${profile.email}. Please login with your password.`;
      (req.session as any).error = message;
      return done(null, undefined, { message: req.flash(ERROR_KEY, message) });
    }

    // Extract OAuth state for team invitation
    const state = JSON.parse((req.query.state as string) || '{}');

    const body: any = {
      id: profile.id,
      email: profile.email,
      displayName: profile.username,
      avatar: profile.avatar,
      guilds: JSON.stringify((profile.guilds || []).map(g => g.id)),
      teamMember: state?.teamMember || null,
      team: state?.team || null
    };

    // Step 3: Check for existing Discord user
    const existingUserQuery = await db.query(
      'SELECT id, discord_id, name, email, active_team FROM users WHERE discord_id = $1 OR email = $2;',
      [profile.id, profile.email]
    );

    if (existingUserQuery.rowCount) {
      // Login existing user
      const user = existingUserQuery.rows[0];

      // Update active team if user came from invitation
      try {
        await db.query('SELECT set_active_team($1, $2);', [user.id || null, state?.team || null]);
      } catch (error) {
        log_error(error, user);
      }

      // Update Discord profile data
      await db.query(
        `UPDATE users SET
          discord_username = $1,
          discord_avatar = $2,
          discord_guilds = $3,
          updated_at = NOW()
        WHERE id = $4;`,
        [profile.username, profile.avatar, body.guilds, user.id]
      );

      return done(null, user, { message: 'User successfully logged in' });
    } else {
      // Register new Discord user
      const registerResult = await db.query(
        'SELECT register_discord_user($1) AS user;',
        [JSON.stringify(body)]
      );

      const registeredUser = registerResult.rows[0]?.user;

      if (!registeredUser) {
        const message = 'Failed to register Discord user';
        log_error(new Error(message));
        return done(null, undefined, { message: req.flash(ERROR_KEY, message) });
      }

      // Send welcome email
      sendWelcomeEmail(registeredUser.email, profile.username);

      return done(null, registeredUser, { message: 'User successfully registered' });
    }
  } catch (error: any) {
    log_error(error);

    // Handle specific database errors
    if (error.message?.includes('EMAIL_EXISTS')) {
      const message = 'Email already exists. Please login with your existing account.';
      (req.session as any).error = message;
      return done(null, undefined, { message: req.flash(ERROR_KEY, message) });
    }

    return done(error);
  }
}

/**
 * Passport Discord OAuth2.0 Strategy
 * Authenticates users via Discord OAuth with guild membership enforcement
 * Supports team invitations via state parameter
 *
 * Configuration:
 * - clientID: Discord application ID
 * - clientSecret: Discord application secret
 * - callbackURL: OAuth redirect URL after user authorization
 * - scope: ['identify', 'email', 'guilds'] for user info and guild list
 */
export default new DiscordStrategy(
  {
    clientID: process.env.DISCORD_CLIENT_ID as string,
    clientSecret: process.env.DISCORD_CLIENT_SECRET as string,
    callbackURL: process.env.DISCORD_CALLBACK_URL as string,
    scope: ['identify', 'email', 'guilds'],
    passReqToCallback: true
  },
  (req: Request, _accessToken: string, _refreshToken: string, profile: any, done: Function) =>
    void handleDiscordLogin(req, _accessToken, _refreshToken, profile, done)
);
