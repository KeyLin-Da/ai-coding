## ADDED Requirements

### Requirement: Preserve team inspire permission results

The system SHALL preserve the existing permission result and team member clock-in completion result when optimizing the team inspire permission query path.

#### Scenario: Same input returns same permission result

- **WHEN** the has-permission endpoint is called with the same `teamId`, `thirdActivityId`, and team-up information before and after the optimization
- **THEN** the response fields `hasPermission`, `hasOpenInspire`, `hasOpenInspireEnd`, and `inspireReMainNum` MUST remain unchanged

#### Scenario: Same team member completion result

- **WHEN** a team contains members with complete, incomplete, and no clock-in records
- **THEN** each member's `isCompleteClockIn` value MUST match the value returned by the pre-optimization logic

#### Scenario: Canonical interface response MD5 matches

- **WHEN** the same request cases are sent to the pre-optimization test environment endpoint and the optimized local endpoint
- **THEN** the canonicalized business response JSON MD5 values MUST match for every case

#### Scenario: MD5 mismatch produces actionable diff

- **WHEN** the canonicalized MD5 values are different
- **THEN** the verification output MUST include the response field paths and values that differ

### Requirement: Avoid large user id IN conditions

The system SHALL avoid constructing SQL with a large `user_id IN (...)` list for the team inspire clock-in completion query when the checked user set is the current team member set.

#### Scenario: Team member set is resolved by team id

- **WHEN** the completion status is queried for a team
- **THEN** the database query MUST derive the eligible members from the team membership data using `teamId` and active-member filters

#### Scenario: Member scope remains equivalent

- **WHEN** eligible members are derived without passing the expanded `userId` list
- **THEN** the eligible member scope MUST match the existing `findTeamInfo(teamId, false)` member scope

### Requirement: Maintain clock-in completion semantics

The system SHALL keep the existing clock-in completion semantics while improving query performance.

#### Scenario: Activity calendar filters are preserved

- **WHEN** completion status is calculated
- **THEN** only records matching the requested activity, team, non-deleted calendar rows, non-deleted clock-in rows, and requested activity days MUST be counted

#### Scenario: Completion count rule is preserved

- **WHEN** a member has matching clock-in rows
- **THEN** the member MUST be marked complete only when the counted clock-in rows equal the expected activity day count

### Requirement: Meet performance acceptance criteria

The system SHALL demonstrate measurable performance improvement for the optimized has-permission query path.

#### Scenario: Execution plan uses selective access

- **WHEN** `EXPLAIN` is run for the optimized completion query
- **THEN** the plan MUST show selective index usage for team membership and clock-in data instead of relying on a broad scan followed by a large `user_id IN (...)` filter

#### Scenario: Response time improves

- **WHEN** the endpoint is tested with representative team sizes
- **THEN** the P95 response time SHOULD decrease by at least 50% compared with the current slow SQL baseline without changing returned results

### Requirement: Canonicalize responses before comparison

The system SHALL compare interface responses using a stable canonical representation before calculating MD5.

#### Scenario: Object field order is stable

- **WHEN** a response JSON object is prepared for MD5 comparison
- **THEN** object keys MUST be sorted recursively before hashing

#### Scenario: Dynamic fields are excluded

- **WHEN** a response contains non-business dynamic fields such as `traceId`, `requestId`, `timestamp`, `cost`, or `serverTime`
- **THEN** those fields MUST be excluded from the canonical MD5 input

#### Scenario: Business array ordering is explicit

- **WHEN** a response contains arrays
- **THEN** the comparison MUST either preserve the API-defined order or explicitly sort unordered arrays by stable business keys before hashing
