import bcrypt from "bcrypt";
import { Strategy as LocalStrategy } from "passport-local";
import { log_error } from "../../shared/utils";
import db from "../../config/db";
import { Request } from "express";
import { ERROR_KEY, SUCCESS_KEY } from "./passport-constants";
import { guildCache } from "../../shared/discord/discord-guild-cache";
import { discordBot } from "../../shared/discord/discord-bot-service";

async function handleLogin(req: Request, email: string, password: string, done: any) {
  // Clear any existing flash messages
  (req.session as any).flash = {};

  if (!email || !password) {
    const errorMsg = "Please enter both email and password";
    req.flash(ERROR_KEY, errorMsg);
    return done(null, false);
  }

  try {
    // Normalize email to lowercase for case-insensitive comparison
    const normalizedEmail = email.toLowerCase().trim();

    const q = `SELECT id, email, google_id, password, discord_id
               FROM users
               WHERE LOWER(email) = $1
                 AND google_id IS NULL
                 AND is_deleted IS FALSE;`;
    const result = await db.query(q, [normalizedEmail]);
    
    const [data] = result.rows;

    if (!data?.password) {
      const errorMsg = "No account found with this email";
      req.flash(ERROR_KEY, errorMsg);
      return done(null, false);
    }

    const passwordMatch = bcrypt.compareSync(password, data.password);

    if (passwordMatch) {
      // Enforce Discord ID requirement for password-based accounts
      if (!data.discord_id) {
        const errorMsg = "Your account requires Discord verification. Please contact support or rejoin our Discord server to continue.";
        req.flash(ERROR_KEY, errorMsg);
        return done(null, false);
      }

      // Verify Discord guild membership (using cache for performance)
      const guildId = process.env.DISCORD_GUILD_ID;
      if (!guildId) {
        log_error(new Error("DISCORD_GUILD_ID not configured"));
        const errorMsg = "Server configuration error. Please contact support.";
        req.flash(ERROR_KEY, errorMsg);
        return done(null, false);
      }

      // Step 1: Check cache first (fast path)
      let isMember = guildCache.isMember(data.discord_id);

      // Step 2: Cache miss - verify via Discord API
      if (!isMember) {
        try {
          isMember = await discordBot.isUserInGuild(data.discord_id, guildId);
        } catch (error) {
          log_error(error);
          const errorMsg = "Failed to verify Discord membership. Please try again later.";
          req.flash(ERROR_KEY, errorMsg);
          return done(null, false);
        }

        if (!isMember) {
          const errorMsg = "You must be a member of our Discord server to login. Please rejoin and try again in 5 minutes.";
          req.flash(ERROR_KEY, errorMsg);
          return done(null, false);
        }
      }

      // All checks passed - allow login
      delete data.password;
      const successMsg = "User successfully logged in";
      req.flash(SUCCESS_KEY, successMsg);
      return done(null, data);
    }
    
    const errorMsg = "Incorrect email or password";
    req.flash(ERROR_KEY, errorMsg);
    return done(null, false);
  } catch (error) {
    console.error("Login error:", error);
    log_error(error, req.body);
    return done(error);
  }
}

export default new LocalStrategy({
  usernameField: "email",
  passwordField: "password",
  passReqToCallback: true
}, (req, email, password, done) => void handleLogin(req, email, password, done));