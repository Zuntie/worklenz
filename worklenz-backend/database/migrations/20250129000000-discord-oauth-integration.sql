-- Discord OAuth Integration Migration
-- Adds Discord authentication columns and constraints for guild-based access control

-- Add Discord authentication columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_avatar TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_guilds JSONB DEFAULT '[]'::jsonb;

-- Create index for efficient Discord ID lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_discord_id ON users(discord_id) WHERE discord_id IS NOT NULL;

-- Add constraint ensuring at least one authentication method
-- Either password (local), google_id (Google OAuth), or discord_id (Discord OAuth)
ALTER TABLE users ADD CONSTRAINT chk_oauth_or_password
  CHECK (password IS NOT NULL OR google_id IS NOT NULL OR discord_id IS NOT NULL);

-- Add column documentation
COMMENT ON COLUMN users.discord_id IS 'Discord user ID for OAuth authentication';
COMMENT ON COLUMN users.discord_username IS 'Discord username from OAuth profile';
COMMENT ON COLUMN users.discord_avatar IS 'Discord avatar URL from OAuth profile';
COMMENT ON COLUMN users.discord_guilds IS 'JSON array of Discord guild IDs user belongs to';
