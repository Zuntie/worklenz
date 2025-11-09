import bcrypt from "bcrypt";
import {Strategy as LocalStrategy} from "passport-local";

import {DEFAULT_ERROR_MESSAGE} from "../../shared/constants";
import {sendWelcomeEmail} from "../../shared/email-templates";
import {log_error} from "../../shared/utils";
import {discordBot} from "../../shared/discord/discord-bot-service";

import db from "../../config/db";
import {Request} from "express";
import {ERROR_KEY, SUCCESS_KEY} from "./passport-constants";

async function isGoogleAccountFound(email: string) {
  const q = `
    SELECT 1
    FROM users
    WHERE LOWER(email) = $1
      AND google_id IS NOT NULL;
  `;
  const result = await db.query(q, [email.toLowerCase().trim()]);
  return !!result.rowCount;
}

async function isAccountDeactivated(email: string) {
  const q = `
    SELECT 1
    FROM users
    WHERE LOWER(email) = $1
      AND is_deleted = TRUE;
  `;
  const result = await db.query(q, [email.toLowerCase().trim()]);
  return !!result.rowCount;
}

/**
 * Validate Discord ID format (17-19 digits)
 * @param discordId Discord user ID to validate
 * @returns true if format is valid
 */
function isValidDiscordIdFormat(discordId: string): boolean {
  return /^\d{17,19}$/.test(discordId);
}

/**
 * Check if Discord ID is already in use
 * @param discordId Discord user ID to check
 * @returns true if Discord ID already exists
 */
async function isDiscordIdTaken(discordId: string): Promise<boolean> {
  const q = `
    SELECT 1
    FROM users
    WHERE discord_id = $1;
  `;
  const result = await db.query(q, [discordId]);
  return !!result.rowCount;
}

/**
 * Validate Discord ID against guild membership
 * @param discordId Discord user ID
 * @param guildId Discord guild ID
 * @returns true if user is in the guild
 */
async function isDiscordUserInGuild(discordId: string, guildId: string): Promise<boolean> {
  try {
    return await discordBot.isUserInGuild(discordId, guildId);
  } catch (error) {
    log_error(error);
    return false;
  }
}

async function registerUser(password: string, team_id: string, name: string, team_name: string, email: string, timezone: string, team_member_id: string, discord_id: string) {
  const salt = bcrypt.genSaltSync(10);
  const encryptedPassword = bcrypt.hashSync(password, salt);

  const teamId = team_id || null;
  const q = "SELECT register_user($1) AS user;";

  const body = {
    name,
    team_name,
    email: email.toLowerCase().trim(),
    password: encryptedPassword,
    timezone,
    invited_team_id: teamId,
    team_member_id,
    discord_id,
  };

  const result = await db.query(q, [JSON.stringify(body)]);
  const [data] = result.rows;
  return data.user;
}

async function handleSignUp(req: Request, email: string, password: string, done: any) {
  (req.session as any).flash = {};
  // team = Invited team_id if req.body.from_invitation is true
  const {name, team_name, team_member_id, team_id, timezone} = req.body;
  let discord_id = req.body.discord_id; // User-provided (will be overridden)

  if (!team_name) return done(null, null, req.flash(ERROR_KEY, "Team name is required"));

  // ENFORCE: Block self-registration (only invite-based registration allowed)
  if (!team_member_id) {
    return done(null, null, req.flash(ERROR_KEY, "Registration is invite-only. Please request an invite from your team."));
  }

  // CRITICAL: Retrieve discord_id from invitation (admin-specified)
  const invitationQuery = `
    SELECT discord_id
    FROM email_invitations
    WHERE team_member_id = $1 AND email = $2 AND team_id = $3
  `;
  const invitationResult = await db.query(invitationQuery, [
    team_member_id,
    email.toLowerCase().trim(),
    team_id
  ]);

  if (!invitationResult.rowCount) {
    return done(null, null, req.flash(ERROR_KEY, "Invalid invitation. Please request a new invitation from your admin."));
  }

  const invitationDiscordId = invitationResult.rows[0].discord_id;

  // ENFORCE: Invitation must have Discord ID
  if (!invitationDiscordId) {
    return done(null, null, req.flash(ERROR_KEY, "This invitation is missing a Discord ID. Please contact your admin to resend the invitation with a Discord ID."));
  }

  // Use invitation's Discord ID (ignore user input if provided)
  discord_id = invitationDiscordId;

  // Log if user attempted to provide different Discord ID (security monitoring)
  if (req.body.discord_id && req.body.discord_id !== invitationDiscordId) {
    log_error(new Error(
      `User ${email} attempted signup with discord_id ${req.body.discord_id} but invitation specifies ${invitationDiscordId}`
    ));
  }

  // Validate Discord ID format (defensive check - should already be validated)
  if (!isValidDiscordIdFormat(discord_id)) {
    return done(null, null, req.flash(ERROR_KEY, "Invalid Discord ID in invitation. Please contact your admin."));
  }

  // Check if Discord ID is already in use (defensive check)
  const discordIdTaken = await isDiscordIdTaken(discord_id);
  if (discordIdTaken) {
    return done(null, null, req.flash(ERROR_KEY, "Discord ID from invitation is already in use. Please contact support."));
  }

  // Validate Discord guild membership
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) {
    log_error(new Error("DISCORD_GUILD_ID not configured"));
    return done(null, null, req.flash(ERROR_KEY, DEFAULT_ERROR_MESSAGE));
  }

  const inGuild = await isDiscordUserInGuild(discord_id, guildId);
  if (!inGuild) {
    return done(null, null, req.flash(ERROR_KEY, "The Discord ID specified in your invitation is not a member of the ESX Discord server. Please contact your admin."));
  }

  const googleAccountFound = await isGoogleAccountFound(email);
  if (googleAccountFound)
    return done(null, null, req.flash(ERROR_KEY, `${req.body.email} is already linked with a Google account.`));

  const accountDeactivated = await isAccountDeactivated(email);
  if (accountDeactivated)
    return done(null, null, req.flash(ERROR_KEY, `Account for email ${email} has been deactivated. Please contact support to reactivate your account.`));

  try {
    const user = await registerUser(password, team_id, name, team_name, email, timezone, team_member_id, discord_id);
    sendWelcomeEmail(email, name);
    return done(null, user, req.flash(SUCCESS_KEY, "Registration successful. Please check your email for verification."));
  } catch (error: any) {
    const message = (error?.message) || "";

    if (message === "ERROR_INVALID_JOINING_EMAIL") {
      return done(null, null, req.flash(ERROR_KEY, `No invitations found for email ${req.body.email}.`));
    }

    // if error.message is "email already exists" then it should have the email address in the error message after ":".
    if (message.includes("EMAIL_EXISTS_ERROR") || error.constraint === "users_google_id_uindex") {
      const [, value] = error.message.split(":");
      return done(null, null, req.flash(ERROR_KEY, `Worklenz account already exists for email ${value}.`));
    }


    if (message.includes("TEAM_NAME_EXISTS_ERROR")) {
      const [, value] = error.message.split(":");
      return done(null, null, req.flash(ERROR_KEY, `Team name "${value}" already exists. Please choose a different team name.`));
    }

    // The Team name is already taken.
    if (error.constraint === "teams_url_uindex" || error.constraint === "teams_name_uindex") {
      return done(null, null, req.flash(ERROR_KEY, `Team name "${team_name}" is already taken. Please choose a different team name.`));
    }

    log_error(error, req.body);
    return done(null, null, req.flash(ERROR_KEY, DEFAULT_ERROR_MESSAGE));
  }
}

export default new LocalStrategy({
  usernameField: "email",
  passwordField: "password",
  passReqToCallback: true
}, (req, email, password, done) => void handleSignUp(req, email, password, done));
