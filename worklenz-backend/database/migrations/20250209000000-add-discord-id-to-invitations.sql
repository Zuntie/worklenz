-- Migration: Add discord_id to email_invitations table
-- Date: 2025-02-09
-- Description: Allow admins to specify Discord ID during team member invitation

BEGIN;

-- Add discord_id column to email_invitations table
ALTER TABLE email_invitations
ADD COLUMN IF NOT EXISTS discord_id TEXT;

-- Add format validation constraint (17-19 digits)
ALTER TABLE email_invitations
ADD CONSTRAINT email_invitations_discord_id_format_check
CHECK (discord_id IS NULL OR discord_id ~ '^\d{17,19}$');

-- Add unique constraint for non-NULL discord_ids
-- This prevents same Discord ID being used in multiple active invitations
CREATE UNIQUE INDEX IF NOT EXISTS email_invitations_discord_id_unique_idx
ON email_invitations(discord_id)
WHERE discord_id IS NOT NULL;

-- Add documentation
COMMENT ON COLUMN email_invitations.discord_id IS
'Discord user ID specified by admin during invitation. When set, this Discord ID will be enforced during user registration, preventing the user from choosing their own Discord ID.';

COMMIT;

-- Verification
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'email_invitations'
        AND column_name = 'discord_id'
    ) THEN
        RAISE NOTICE 'Migration successful: discord_id column added to email_invitations';
    ELSE
        RAISE EXCEPTION 'Migration failed: discord_id column not found';
    END IF;
END $$;
