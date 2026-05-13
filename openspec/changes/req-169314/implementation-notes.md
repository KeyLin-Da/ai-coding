## Baseline

Current slow SQL pattern:

```sql
SELECT fad.user_id AS userId,
       CASE count(fad.id) WHEN 7 THEN 1 ELSE 0 END AS isComplete
FROM fun_activity_calendar fac
LEFT JOIN fun_activity_data fad ON fad.calendar_id = fac.id
WHERE fac.is_deleted = 0
  AND fad.is_deleted = 0
  AND fac.activity_id = 2025050822000306
  AND fac.activity_day IN (1, 2, 3, 4, 5, 6, 7)
  AND fad.user_id IN (...)
  AND fad.team_id = 2026032916117105
GROUP BY fad.user_id;
```

Representative baseline EXPLAIN provided during exploration:

| id | table | type | possible_keys | key | rows | filtered | Extra |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | fac | ref | PRIMARY,activityId_index | activityId_index | 7 | 50.0 | Using where; Using index; Using temporary |
| 1 | fad | ref | userId_index,teamId_index,calendarId_index | calendarId_index | 393 | 0.01 | Using index condition; Using where |

Interpretation: the plan starts from seven calendar rows, looks up many `fun_activity_data` rows by `calendar_id`, then filters by team and a large `user_id IN (...)`.

## Regression Dataset

Use one representative `teamId` and `activityId` with seven expected activity days.

Prepare at least these team members:

- Member A: has exactly seven matching non-deleted clock-in rows and should be complete.
- Member B: has fewer than seven matching non-deleted clock-in rows and should be incomplete.
- Member C: has no matching clock-in rows and should be incomplete through the existing Java fallback.
- Member D: has clock-in rows from another team or deleted rows and should not be counted.

Compare `isCompleteClockIn` for every returned `teamInfos` item before and after the SQL change.

## Optimized Query Shape

The implementation removes the expanded `userId` list from the mapper call and derives the checked member set from `fun_team_detail` using the same active team member scope as `findTeamInfo(teamId, false)`.

The completion rule intentionally remains `COUNT(fad.id) == differNumDays`.

## Verification Targets

- The optimized SQL must not contain `fad.user_id IN (...)`.
- The optimized result must match pre-optimization `isCompleteClockIn` values for the regression dataset.
- `EXPLAIN` should show selective access through team/member and clock-in indexes.
- P95 response time should improve by at least 50% for representative team sizes.

## Interface MD5 Comparison

Use interface-level comparison as a regression gate in addition to mapper-level checks.

Compare:

- Old behavior: test-environment endpoint running the pre-optimization logic.
- New behavior: local endpoint running the optimized logic against the same test data source or an equivalent reproducible dataset.

Recommended flow:

1. Prepare request cases with stable `caseId`, `teamId`, `thirdActivityId`, request body, and expected scenario label.
2. Call the test-environment endpoint and local endpoint with the same request.
3. Parse both response bodies as JSON.
4. Canonicalize JSON before hashing:
   - Sort object keys recursively.
   - Exclude non-business dynamic fields such as `traceId`, `requestId`, `timestamp`, `cost`, `serverTime`.
   - Preserve array order when the API order is meaningful.
   - For unordered business arrays, sort by explicit stable keys before hashing.
5. Calculate MD5 from the canonical JSON string.
6. When MD5 differs, output field-level diff paths and values.

Script:

```bash
python3 openspec/changes/req-169314/scripts/compare_interface_md5.py \
  --old-base-url "https://test.example.com" \
  --new-base-url "http://localhost:9115" \
  --cases openspec/changes/req-169314/scripts/cases.sample.json \
  --header "Authorization: Bearer <token>" \
  --output /tmp/req-169314-interface-md5.csv
```

Use `--ignore-field <name>` for extra non-business dynamic fields. Use `sortArraysBy` in the case file only for arrays whose business ordering is not meaningful.

Recommended per-case output:

| field | description |
| --- | --- |
| caseId | Stable case identifier |
| teamId | Team id used by the case |
| thirdActivityId | Activity id used by the case |
| oldStatus/newStatus | HTTP status codes |
| oldMd5/newMd5 | Canonical response MD5 values |
| oldCostMs/newCostMs | Request cost in milliseconds |
| match | Whether canonical MD5 values match |
| diffPath | Differing JSON paths when mismatch occurs |

Representative cases:

- All checked team members complete.
- Some members incomplete.
- Some members have no clock-in records.
- Deleted clock-in rows or deleted calendar rows exist.
- Clock-in rows from other teams exist.
- Clock-in rows from other activities or days exist.
- Large team, such as 200+ members, to observe response time.
