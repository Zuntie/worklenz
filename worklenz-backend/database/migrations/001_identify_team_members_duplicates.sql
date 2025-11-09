-- ============================================================================
-- Migration: Identify Duplicate Team Members
-- Purpose: Read-only query to identify duplicate team_members entries
-- Date: 2025-11-09
-- Issue: Cardinality violation in get_task_updates() function
-- ============================================================================

-- 1. Find duplicate team memberships (same user_id + team_id)
-- This query shows which users have multiple team_member entries for the same team
SELECT
    tm.user_id,
    tm.team_id,
    u.name AS user_name,
    u.email AS user_email,
    t.name AS team_name,
    COUNT(*) AS duplicate_count,
    ARRAY_AGG(tm.id ORDER BY tm.created_at) AS team_member_ids,
    ARRAY_AGG(tm.created_at ORDER BY tm.created_at) AS created_dates,
    ARRAY_AGG(tm.active ORDER BY tm.created_at) AS active_status
FROM team_members tm
INNER JOIN users u ON tm.user_id = u.id
INNER JOIN teams t ON tm.team_id = t.id
WHERE tm.active = TRUE
GROUP BY tm.user_id, tm.team_id, u.name, u.email, t.name
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, u.name;

-- 2. Summary statistics
SELECT
    COUNT(*) AS total_duplicate_groups,
    SUM(duplicate_count) AS total_duplicate_entries,
    SUM(duplicate_count) - COUNT(*) AS entries_to_delete
FROM (
    SELECT user_id, team_id, COUNT(*) AS duplicate_count
    FROM team_members
    WHERE active = TRUE
    GROUP BY user_id, team_id
    HAVING COUNT(*) > 1
) duplicates;

-- 3. Check if any duplicates have different data (role_id, job_title_id)
-- This helps determine if merging/consolidation is needed
SELECT
    tm.user_id,
    tm.team_id,
    u.name AS user_name,
    t.name AS team_name,
    COUNT(DISTINCT tm.role_id) AS distinct_roles,
    COUNT(DISTINCT tm.job_title_id) AS distinct_job_titles,
    ARRAY_AGG(DISTINCT tm.role_id) AS role_ids,
    ARRAY_AGG(DISTINCT tm.job_title_id) AS job_title_ids
FROM team_members tm
INNER JOIN users u ON tm.user_id = u.id
INNER JOIN teams t ON tm.team_id = t.id
WHERE tm.active = TRUE
GROUP BY tm.user_id, tm.team_id, u.name, t.name
HAVING COUNT(*) > 1 AND (COUNT(DISTINCT tm.role_id) > 1 OR COUNT(DISTINCT tm.job_title_id) > 1);

-- ============================================================================
-- Next Steps:
-- 1. Review the output of these queries
-- 2. If duplicates exist, run 002_cleanup_team_members_duplicates.sql
-- 3. If duplicates have different roles/job_titles, manual review may be needed
-- ============================================================================
