## Why

`/meeting/api/v1/activity-director/team-inspire/has-permission` 相关链路存在慢 SQL：当前先在 Java 中取团队成员，再把大量 `userId` 拼入 `IN` 条件查询打卡完成状态，导致 SQL 文本过长、执行计划不稳定，并放大 `fun_activity_data` 聚合成本。该接口属于高频权限判断路径，需要在不改变业务口径的前提下提升响应效率。

## What Changes

- 优化团队激励权限判断中的打卡完成状态查询，减少或消除大 `user_id IN (...)`。
- 保持现有成员范围、活动日、团队、删除标识和完成天数判定语义不变。
- 补充必要的 MyBatis/MyBatis-Plus 查询与数据库索引设计建议。
- 增加慢 SQL 优化后的验收标准：执行计划稳定命中合适索引，P95 响应耗时明显下降。

## Non-goals

- 不调整接口入参、出参或权限业务规则。
- 不引入新的缓存一致性模型或汇总表，除非后续设计阶段证明单 SQL 优化不足。
- 不改造与本接口无关的打卡、组队、活动日历流程。

## Capabilities

### New Capabilities

- `team-inspire-permission-performance`: 约束团队激励权限判断链路的查询性能、语义保持和验收标准。

### Modified Capabilities

- 无。

## Impact

影响 `opp-learn` 中团队成员与打卡完成状态查询相关 Mapper/Service；可能涉及 `fun_team_detail`、`fun_activity_data`、`fun_activity_calendar` 的联合索引。需遵循现有 Spring Boot、MyBatis-Plus、多模块 Maven 项目结构，不改变 Feign/API 合约。

## Success Criteria

- 慢 SQL 不再依赖超长 `user_id IN (...)`，或在保留等价语义下显著降低扫描行数。
- `EXPLAIN` 显示核心表命中预期索引，避免大范围扫描。
- 典型团队规模下接口 P95 耗时较现状下降至少 50%，且返回权限结果与优化前一致。
