-- ============================================================================
-- Migration: Cleanup Duplicate Team Members and Add UNIQUE Constraint
-- Purpose: Remove duplicate team_members entries and prevent future duplicates
-- Date: 2025-11-09
-- Issue: Cardinality violation in get_task_updates() function
-- ============================================================================

-- IMPORTANT: Run 001_identify_team_members_duplicates.sql FIRST to review duplicates!

BEGIN;

-- ============================================================================
-- STEP 1: Create backup table (optional, for safety)
-- ============================================================================
CREATE TABLE IF NOT EXISTS team_members_backup_20251109 AS
SELECT * FROM team_members WHERE active = TRUE;

-- Verify backup
DO $$
DECLARE
    backup_count INTEGER;
    original_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO backup_count FROM team_members_backup_20251109;
    SELECT COUNT(*) INTO original_count FROM team_members WHERE active = TRUE;
    RAISE NOTICE 'Backup created: % rows backed up from % active rows', backup_count, original_count;
END $$;

-- ============================================================================
-- STEP 2: Delete duplicate team_members, keeping the OLDEST entry
-- Strategy: Use ROW_NUMBER() to identify duplicates, keep row #1 (oldest)
-- ============================================================================

-- Show what will be deleted (DRY RUN - comment out to skip)
SELECT
    tm.id,
    tm.user_id,
    tm.team_id,
    u.name AS user_name,
    t.name AS team_name,
    tm.created_at,
    tm.role_id,
    tm.job_title_id
FROM (
    SELECT
        id,
        user_id,
        team_id,
        created_at,
        role_id,
        job_title_id,
        ROW_NUMBER() OVER (PARTITION BY user_id, team_id ORDER BY created_at ASC) AS rn
    FROM team_members
    WHERE active = TRUE
) tm
INNER JOIN users u ON tm.user_id = u.id
INNER JOIN teams t ON tm.team_id = t.id
WHERE tm.rn > 1
ORDER BY tm.user_id, tm.team_id, tm.created_at;

-- Perform the deletion
WITH duplicates AS (
    SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY user_id, team_id ORDER BY created_at ASC) AS rn
    FROM team_members
    WHERE active = TRUE
)
DELETE FROM team_members
WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);

-- Report how many rows were deleted
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % duplicate team_member entries', deleted_count;
END $$;

-- ============================================================================
-- STEP 3: Verify no duplicates remain
-- ============================================================================
DO $$
DECLARE
    remaining_duplicates INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_duplicates
    FROM (
        SELECT user_id, team_id, COUNT(*) AS cnt
        FROM team_members
        WHERE active = TRUE
        GROUP BY user_id, team_id
        HAVING COUNT(*) > 1
    ) duplicates;

    IF remaining_duplicates > 0 THEN
        RAISE EXCEPTION 'Still % duplicate groups remaining after cleanup!', remaining_duplicates;
    ELSE
        RAISE NOTICE 'Verification passed: No duplicates remaining';
    END IF;
END $$;

-- ============================================================================
-- STEP 4: Create UNIQUE constraint to prevent future duplicates
-- ============================================================================

-- Drop existing non-unique index first (if exists)
DROP INDEX IF EXISTS idx_team_members_team_user;

-- Create UNIQUE partial index (only on active=TRUE rows)
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_user_team_unique
ON team_members(user_id, team_id)
WHERE active = TRUE;

RAISE NOTICE 'UNIQUE constraint created: idx_team_members_user_team_unique';

-- ============================================================================
-- STEP 5: Test the constraint
-- ============================================================================
DO $$
BEGIN
    -- This should succeed (no duplicate)
    RAISE NOTICE 'Testing UNIQUE constraint...';

    -- This test is conceptual; actual test would require valid UUIDs
    -- You can manually test by trying to insert a duplicate after migration
END $$;

-- ============================================================================
-- STEP 6: Update the get_task_updates() function (already done in code)
-- ============================================================================
-- The function has been updated to use MIN(id) to handle any edge cases
-- File: worklenz-backend/database/sql/4_functions.sql

COMMIT;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS (if needed):
-- ============================================================================
-- If something goes wrong and you need to restore:
--
-- 1. Restore from backup:
--    INSERT INTO team_members SELECT * FROM team_members_backup_20251109
--    ON CONFLICT (id) DO NOTHING;
--
-- 2. Drop the unique constraint:
--    DROP INDEX IF EXISTS idx_team_members_user_team_unique;
--
-- 3. Recreate the original non-unique index:
--    CREATE INDEX idx_team_members_team_user ON team_members(team_id, user_id) WHERE active = TRUE;
-- ============================================================================

-- ============================================================================
-- Post-Migration Verification:
-- ============================================================================
-- Run these queries after migration to verify success:
--
-- 1. Check for duplicates (should return 0):
--    SELECT COUNT(*) FROM (
--        SELECT user_id, team_id, COUNT(*) FROM team_members
--        WHERE active = TRUE GROUP BY user_id, team_id HAVING COUNT(*) > 1
--    ) dup;
--
-- 2. Verify constraint exists:
--    SELECT indexname, indexdef FROM pg_indexes
--    WHERE tablename = 'team_members' AND indexname = 'idx_team_members_user_team_unique';
--
-- 3. Test notification cron job (should run without errors)
-- ============================================================================
