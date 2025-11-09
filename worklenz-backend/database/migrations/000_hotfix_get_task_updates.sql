-- ============================================================================
-- HOTFIX: Update get_task_updates() function immediately
-- Purpose: Stop notification cron errors by handling duplicate team_members
-- Date: 2025-11-09
-- Issue: Cardinality violation - "more than one row returned by a subquery"
-- ============================================================================
--
-- This is an IMMEDIATE hotfix that can be deployed separately from the
-- full cleanup migration. It fixes the function to handle duplicates gracefully.
--
-- After deploying this hotfix:
-- 1. Run 001_identify_team_members_duplicates.sql to find duplicates
-- 2. Run 002_cleanup_team_members_duplicates.sql to clean them up
-- ============================================================================

CREATE OR REPLACE FUNCTION get_task_updates() RETURNS json
    LANGUAGE plpgsql
AS
$$
DECLARE
    _result JSON;
BEGIN
    SELECT COALESCE(ARRAY_TO_JSON(ARRAY_AGG(ROW_TO_JSON(rec))), '[]'::JSON)
    INTO _result
    FROM (SELECT name,
                 email,
                 (SELECT MIN(id)
                  FROM team_members
                  WHERE team_id = users.active_team
                    AND user_id = users.id) AS team_member_id,
                 (SELECT COALESCE(ARRAY_TO_JSON(ARRAY_AGG(ROW_TO_JSON(r))), '[]'::JSON) AS teams
                  FROM (SELECT id,
                               name,
                               (SELECT MIN(team_member_id)
                                FROM team_member_info_view
                                WHERE team_id = teams.id
                                  AND user_id = users.id) AS team_member_id,
                               (SELECT COALESCE(ARRAY_TO_JSON(ARRAY_AGG(ROW_TO_JSON(r))), '[]'::JSON) AS projects
                                FROM (SELECT id,
                                             name,
                                             (SELECT COALESCE(ARRAY_TO_JSON(ARRAY_AGG(ROW_TO_JSON(r))), '[]'::JSON) AS tasks
                                              FROM (SELECT t.id,
                                                           t.name AS name,
                                                           (SELECT name FROM users WHERE id = task_updates.reporter_id) AS updater_name,
                                                           (SELECT STRING_AGG(DISTINCT
                                                                              (SELECT name
                                                                               FROM team_member_info_view
                                                                               WHERE team_member_id = tasks_assignees.team_member_id),
                                                                              ', ')
                                                            FROM tasks_assignees
                                                            WHERE task_id = task_updates.task_id) AS members
                                                    FROM task_updates
                                                             INNER JOIN tasks t ON task_updates.task_id = t.id
                                                    WHERE task_updates.user_id = users.id
                                                      AND task_updates.project_id = projects.id
                                                      AND task_updates.type = 'ASSIGN'
                                                      AND is_sent IS FALSE
                                                    ORDER BY task_updates.created_at) r)
                                      FROM projects
                                      WHERE team_id = teams.id
                                        AND EXISTS(SELECT 1
                                                   FROM task_updates
                                                   WHERE project_id = projects.id
                                                     AND type = 'ASSIGN'
                                                     AND is_sent IS FALSE)) r)
                        FROM teams
                        WHERE EXISTS(SELECT 1 FROM team_members WHERE team_id = teams.id AND user_id = users.id)
                          AND (SELECT email_notifications_enabled
                               FROM notification_settings
                               WHERE team_id = teams.id
                                 AND user_id = users.id) IS TRUE) r)
          FROM users
          WHERE EXISTS(SELECT 1 FROM task_updates WHERE user_id = users.id)) rec;

    UPDATE task_updates SET is_sent = TRUE;

    RETURN _result;
END
$$;

-- ============================================================================
-- Changes made:
-- 1. Line 13: Changed "SELECT id" to "SELECT MIN(id)"
-- 2. Line 21: Changed "SELECT team_member_id" to "SELECT MIN(team_member_id)"
--
-- These changes ensure the subqueries always return a single row, even if
-- duplicate team_members exist. MIN(id) selects the oldest entry deterministically.
-- ============================================================================

-- Verify function was updated
SELECT proname, prosrc
FROM pg_proc
WHERE proname = 'get_task_updates';

SELECT 'Hotfix deployed successfully! Function get_task_updates() updated.' AS status;
