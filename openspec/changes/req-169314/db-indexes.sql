-- req-169314 index deployment notes
-- Run the SHOW INDEX statements in the target database before adding indexes.
-- MySQL does not support CREATE INDEX IF NOT EXISTS in all supported versions,
-- so create the indexes only when an equivalent index is not already present.

SHOW INDEX FROM fun_team_detail;
SHOW INDEX FROM fun_activity_data;
SHOW INDEX FROM fun_activity_calendar;

-- Recommended indexes for the optimized query path:

CREATE INDEX idx_ftd_team_deleted_member
ON fun_team_detail(team_id, is_deleted, team_member);

CREATE INDEX idx_fad_team_user_deleted_calendar
ON fun_activity_data(team_id, user_id, is_deleted, calendar_id);

CREATE INDEX idx_fac_activity_deleted_day_id
ON fun_activity_calendar(activity_id, is_deleted, activity_day, id);
