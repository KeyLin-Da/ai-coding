## 1. Baseline and Scope

- [x] 1.1 Confirm `FunActivityCalendarMapper.getIsCompleteClockIn` has no call sites outside `opp-learn/src/main/java/com/infinitus/opp/learn/service/impl/activity/FunTeamInfoServiceImpl.java`
- [x] 1.2 Capture the current SQL and representative `EXPLAIN` baseline for team sizes used by `/meeting/api/v1/activity-director/team-inspire/has-permission`
- [x] 1.3 Prepare a small regression dataset covering complete, incomplete, and no clock-in team members

## 2. Query Refactor

- [x] 2.1 Update `opp-learn/src/main/java/com/infinitus/opp/learn/mapper/activity/FunActivityCalendarMapper.java` to remove the `userIds` parameter from `getIsCompleteClockIn`
- [x] 2.2 Update `opp-learn/src/main/resources/mapper/course/FunActivityCalendarMapper.xml` to replace `fad.user_id IN (...)` with a team-member derived table joined by `teamId`
- [x] 2.3 Keep the existing filters for `fac.is_deleted`, `fad.is_deleted`, `fac.activity_id`, `fac.activity_day`, and `fad.team_id`
- [x] 2.4 Keep the existing completion rule based on `COUNT(fad.id) == differNumDays`
- [x] 2.5 Update `getClockInCompleteStatus` in `FunTeamInfoServiceImpl` to stop building and passing the large `userIds` list

## 3. Index and Migration

- [ ] 3.1 Check existing indexes for `fun_team_detail`, `fun_activity_data`, and `fun_activity_calendar` to avoid duplicate indexes
- [x] 3.2 Add or document the recommended indexes: `fun_team_detail(team_id, is_deleted, team_member)`, `fun_activity_data(team_id, user_id, is_deleted, calendar_id)`, and `fun_activity_calendar(activity_id, is_deleted, activity_day, id)`
- [ ] 3.3 Coordinate database index deployment separately from application release if the environment requires DBA approval

## 4. Verification

- [ ] 4.1 Verify optimized results match pre-optimization results for the regression dataset
- [ ] 4.2 Run `EXPLAIN` for the optimized SQL and confirm selective index usage without a large `user_id IN (...)` filter
- [ ] 4.3 Run the minimal relevant Maven test or mapper-level verification for `opp-learn`
- [ ] 4.4 Record before/after P95 timing for representative team sizes and confirm the target improvement is met
- [x] 4.5 Build or provide an interface regression comparison script that calls the test-environment old endpoint and local optimized endpoint with the same request cases
- [x] 4.6 Canonicalize response JSON before MD5 comparison by sorting object keys, excluding non-business dynamic fields, and handling array order explicitly
- [x] 4.7 Record per-case comparison output including `caseId`, request identifiers, old/new status, old/new MD5, old/new cost, match result, and diff path when mismatched
- [ ] 4.8 Run MD5 comparison for representative cases covering complete, incomplete, no clock-in, deleted records, other team, other activity, and large-team scenarios
