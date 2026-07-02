# AI Delivery Center 部署文档

`ai-delivery-center` 是 AI 需求交付 remote-only 协作模式的共享事实源。它保存团队、用户、项目、需求流程、审核、issue、Job、运行日志索引、领域事件、bootstrap import 记录和 Git 产物版本索引；产物文件内容以项目 AI 产物 Git 仓 commit/blob/hash 为准，客户端本机路径和 Agent 密钥不进入中心库。

## 运行依赖

- JDK 11+
- Maven 3.8+
- MySQL 8.x
- Redis 6.x+
- Nacos 可选，用于 OPP 微服务体系内统一配置和服务发现

## 数据库

服务启动时通过 Flyway 执行 `src/main/resources/db/migration/V1__create_ai_delivery_center_schema.sql`，创建 `ad_*` 表。

关键表：

- `ad_requirement`、`ad_workflow_stage`、`ad_review`、`ad_issue`: 共享流程、阶段、审核和问题
- `ad_artifact`、`ad_artifact_git_version`、`ad_artifact_sync`: 逻辑产物、Git 版本索引和公开同步记录
- `ad_import_session`、`ad_import_item`: bootstrap import 会话和逐项导入结果
- `ad_job`、`ad_run`、`ad_run_event`: Local Runner Job 和共享运行日志
- `ad_domain_event`、`ad_client_session`、`ad_ws_session`: 实时协作事件、桌面客户端和 WebSocket 在线会话
- `ad_execution_lock`: 人工阶段动作占用
- `ad_collab_document`、`ad_collab_operation`、`ad_collab_snapshot`: 文本类协同草稿预留模型

`ad_run_event` 和 `ad_domain_event` 需要按月分区或按 `created_at` 做归档，默认事件保留窗口由 `AI_DELIVERY_CENTER_EVENT_RETAINED_WINDOW` 控制。

## 配置项

所有配置可通过环境变量覆盖，也可以由 Nacos 下发同名配置。

| 环境变量 | 说明 | 默认值 |
| --- | --- | --- |
| `AI_DELIVERY_CENTER_PORT` | HTTP 端口 | `8728` |
| `AI_DELIVERY_CENTER_DATASOURCE_URL` | MySQL JDBC URL | `jdbc:mysql://127.0.0.1:3306/ai_delivery_center...` |
| `AI_DELIVERY_CENTER_DATASOURCE_USERNAME` | MySQL 用户名 | `root` |
| `AI_DELIVERY_CENTER_DATASOURCE_PASSWORD` | MySQL 密码 | 空 |
| `AI_DELIVERY_CENTER_FLYWAY_ENABLED` | 是否启用 Flyway migration | `false` |
| `AI_DELIVERY_CENTER_FLYWAY_BASELINE_ON_MIGRATE` | 非空 schema 无历史表时是否自动 baseline | `true` |
| `AI_DELIVERY_CENTER_FLYWAY_BASELINE_VERSION` | baseline 版本，设为 0 后仍会执行 V1 | `0` |
| `AI_DELIVERY_CENTER_REDIS_HOST` | Redis host | `127.0.0.1` |
| `AI_DELIVERY_CENTER_REDIS_PORT` | Redis port | `6379` |
| `AI_DELIVERY_CENTER_REDIS_PASSWORD` | Redis 密码 | 空 |
| `AI_DELIVERY_CENTER_REDIS_DATABASE` | Redis database | `0` |
| `AI_DELIVERY_CENTER_REDIS_KEY_PREFIX` | Redis key 前缀 | `ai-delivery` |
| `AI_DELIVERY_CENTER_JOB_LEASE_TTL` | Job 领取租约 TTL | `60s` |
| `AI_DELIVERY_CENTER_JOB_HEARTBEAT_INTERVAL` | 客户端续约间隔 | `20s` |
| `AI_DELIVERY_CENTER_JOB_MAX_RETRY_TIMES` | Job 最大重试次数 | `3` |
| `AI_DELIVERY_CENTER_EVENT_RETAINED_WINDOW` | 事件补偿保留窗口 | `7d` |
| `AI_DELIVERY_CENTER_EVENT_PAGE_SIZE` | 事件补偿分页大小 | `500` |
| `AI_DELIVERY_CENTER_WEBSOCKET_ENDPOINT` | WebSocket STOMP endpoint | `/api/ai-delivery/ws` |
| `AI_DELIVERY_CENTER_WEBSOCKET_TICKET_TTL` | WebSocket ticket 有效期 | `2m` |
| `AI_DELIVERY_CENTER_WEBSOCKET_HEARTBEAT_INTERVAL` | 客户端心跳建议间隔 | `20s` |
| `AI_DELIVERY_CENTER_WEBSOCKET_SESSION_IDLE_TIMEOUT` | WebSocket session 空闲离线阈值 | `90s` |
| `AI_DELIVERY_CENTER_WEBSOCKET_BROKER` | 实时事件广播实现：`local` 或 `redis` | `local` |
| `AI_DELIVERY_CENTER_WEBSOCKET_REDIS_CHANNEL_PREFIX` | Redis Pub/Sub channel 前缀 | `ai-delivery:ws-events` |
| `AI_DELIVERY_CENTER_WEBSOCKET_REDIS_REQUIRED` | 是否把 Redis 不可用视为阻断失败 | `false` |
| `AI_DELIVERY_CENTER_IMPORT_MAX_FILE_SIZE` | bootstrap import 单文件大小上限 | `104857600` |
| `AI_DELIVERY_CENTER_IMPORT_MANIFEST_RETENTION_DAYS` | import manifest 保留天数 | `30` |
| `AI_DELIVERY_CENTER_JWT_ISSUER` | JWT issuer | `ai-delivery-center` |
| `AI_DELIVERY_CENTER_JWT_SECRET` | JWT 签名密钥 | `change-me` |
| `AI_DELIVERY_CENTER_ACCESS_TOKEN_TTL` | Access token 有效期 | `8h` |
| `AI_DELIVERY_CENTER_NACOS_CONFIG_ENABLED` | 是否启用 Nacos 配置 | `false` |
| `AI_DELIVERY_CENTER_NACOS_DISCOVERY_ENABLED` | 是否启用 Nacos 注册发现 | `false` |
| `AI_DELIVERY_CENTER_NACOS_SERVER_ADDR` | Nacos 地址 | `127.0.0.1:8848` |
| `AI_DELIVERY_CENTER_NACOS_NAMESPACE` | Nacos namespace | 空 |
| `AI_DELIVERY_CENTER_NACOS_GROUP` | Nacos group | `DEFAULT_GROUP` |

生产环境必须覆盖 `AI_DELIVERY_CENTER_JWT_SECRET` 和数据库密码，不要把这些值提交到仓库。多实例部署建议设置 `AI_DELIVERY_CENTER_WEBSOCKET_BROKER=redis`，并将 `AI_DELIVERY_CENTER_WEBSOCKET_REDIS_REQUIRED=true` 纳入预检阻断项。

### Flyway 接管已有库

如果启动时报错 `Found non-empty schema(s) ... but no schema history table`，说明目标库里已经有表，但 Flyway 还没有 `flyway_schema_history`。默认配置已启用：

```yaml
spring.flyway.baseline-on-migrate: true
spring.flyway.baseline-version: 0
```

这样 Flyway 会先创建 history 表，再继续执行 `V1__create_ai_delivery_center_schema.sql`。当前 V1 使用 `CREATE TABLE IF NOT EXISTS`，不会删除或重建已有表。

生产环境接入已有库前仍建议先确认 `AI_DELIVERY_CENTER_DATASOURCE_URL` 指向正确 schema，并备份数据库。

## Git-backed 产物版本管理

业务版本由数据库索引，文件内容由项目 AI 产物 Git 仓保存：

1. Local Runner 在项目仓中生成或更新 `docs/{需求号}`、`openspec/changes`、`docs/code_review` 等受控产物。
2. 用户在页面确认公开同步计划，Runner 执行 `git add`、`commit`、`pull --rebase`、`push`。
3. push 成功后 Runner 回写中心 `ad_artifact_sync` 和 `ad_artifact_git_version`。
4. 中心在事务内更新 `ad_artifact.current_version_id`，写入 `ad_domain_event` 并广播。
5. 其他客户端收到 `artifact.git-sync.completed` 或 `project.repo.pull-required` 后拉取项目仓最新 commit。

受控产物目录：

```text
docs/{需求号}/
docs/code_review/
openspec/changes/
openspec/specs/
.codex/skills/
.codebuddy/skills/
.qoder/skills/
.qwen/skills/
```

旧 `ad_artifact_version` / COS 版本只作为 `LEGACY_COS` 历史只读兼容。`V6__git_only_artifacts_cleanup.sql` 已删除旧上传会话和 COS 版本表，新流程不得再把 COS 作为产物事实源。

## Bootstrap Import

旧本地工作区迁入中心时，先在 Local Runner 侧生成 dry-run 计划：

```bash
cd tools/ai-delivery-console
npm run bootstrap:plan -- \
  --workspaceRoot /path/to/old-workspace \
  --centerBaseUrl http://127.0.0.1:8728 \
  --projectId 1 \
  --userId 1
```

确认 `conflicts` 和 `skippedArtifacts` 后执行正式导入：

```bash
npm run bootstrap:import -- \
  --workspaceRoot /path/to/old-workspace \
  --centerBaseUrl http://127.0.0.1:8728 \
  --projectId 1 \
  --userId 1 \
  --clientSessionId 16
```

中心导入 API：

- `POST /api/ai-delivery/import-sessions`
- `POST /api/ai-delivery/import-sessions/{sessionId}/records`
- `GET /api/ai-delivery/import-sessions/{sessionId}`
- `POST /api/ai-delivery/import-sessions/{sessionId}/complete`

导入流程按 `logicalPath + sha256` 幂等去重，重复导入返回 `DUPLICATED`。正式导入必须提供 `clientSessionId`，用于定位当前客户端项目仓和 Git 同步状态。敏感字段、本机绝对路径和不受控产物路径会被拒绝或标记为 conflict。

## Preflight

上线前调用：

```bash
curl -X POST "http://127.0.0.1:8728/api/ai-delivery/preflight" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 1" \
  -d '{"projectId":1}'
```

默认检查项：

- `CENTER`: 中心服务可达。
- `PROJECT_PERMISSION`: 当前用户具备项目权限。
- `DB`: import 表、Git artifact 表、同步表、项目仓表和 hash 索引存在。
- `REDIS`: runtime namespace、job lease 前缀和 WebSocket Redis channel 可用。
- `WEBSOCKET`: endpoint 和 broker 配置可用。

返回 `PASS`、`WARN` 或 `FAIL`。单实例 `local` broker 下 Redis 失败会降级为 `WARN`；多实例或 `redis` broker 下 Redis 失败会返回 `FAIL`。当前 Git-only 模式不执行 COS 上传链路检查。

## 启动

本地验证：

```bash
cd tools/ai-delivery-center
mvn -q test
mvn spring-boot:run
```

打包运行：

```bash
cd tools/ai-delivery-center
mvn -q -DskipTests package
java -jar target/ai-delivery-center-0.1.0-SNAPSHOT.jar
```

健康检查：

```bash
curl http://127.0.0.1:8728/actuator/health
```

桌面客户端和网页版默认连接 `http://127.0.0.1:8728`，也可以在「设置 / 个人中心」中修改 `centerBaseUrl`。

## WebSocket 实时协作

中心服务使用 WebSocket/STOMP 作为唯一远程实时通道：

- Endpoint: `/api/ai-delivery/ws`
- Ticket: `POST /api/ai-delivery/ws-tickets`
- Project subscription: `/app/projects/{projectId}/subscribe`
- Requirement subscription: `/app/requirements/{requirementPk}/subscribe`
- Run subscription: `/app/runs/{runId}/subscribe`
- Ack: `/app/events/ack`
- Heartbeat: `/app/presence/heartbeat`

客户端断线重连时携带 `lastEventId`，服务端先通过 `ad_domain_event` 补偿缺失事件，再继续推送实时事件。若事件超过 `AI_DELIVERY_CENTER_EVENT_RETAINED_WINDOW`，服务端返回刷新要求，客户端执行全量刷新。

多实例部署时，将 `AI_DELIVERY_CENTER_WEBSOCKET_BROKER` 设为 `redis`。事件会发布到 `ai-delivery:ws-events:{scopeId}` 格式的 Redis channel，各实例只向本机 WebSocket session 投递，客户端按 `eventId` 去重并通过 ack 记录最大已处理事件。

## 权限与事件

- 所有需求、产物、审核、issue、Job、run event 和 domain event 访问都必须校验用户团队/项目成员关系。
- WebSocket 连接使用短期 ticket，订阅项目、需求和 run topic 时继续校验项目成员关系。
- `GET /api/ai-delivery/events?projectId=&afterEventId=` 用于断线补偿；`/api/ai-delivery/events/subscribe` SSE 入口已废弃。
- 多实例部署时，需用 Redis Pub/Sub 分发实时事件，并用客户端 `eventId` 去重。后续如接入 RocketMQ，事件消费者仍应按 `eventId` 幂等处理。

## 故障排查

- `B70031`: ticket 缺失、过期或已被错误客户端使用。重新调用 `/ws-tickets` 并确认 `clientSessionId` 属于当前用户。
- `B70032`: 订阅的 project、requirement 或 run 不属于当前用户可访问项目。检查 `X-User-Id`、`projectId` 和团队成员关系。
- `B70033`: `lastEventId` 已超过保留窗口。客户端需要刷新列表和详情后重新订阅。
- `B70034`: 阶段动作被其他客户端占用。等待占用释放、过期，或由持有人主动释放。
- `B70041` 至 `B70046`: bootstrap import 或 preflight 失败。检查项目权限、manifest hash、敏感字段、Git artifact hash 索引和导入会话状态。
- 连接建立但无事件：确认 `AI_DELIVERY_CENTER_WEBSOCKET_ENDPOINT`、反向代理 WebSocket upgrade、Redis broker 配置和客户端 `ack` 逻辑。

## 运维检查

- MySQL 表结构已执行 Flyway migration，`ad_*` 表存在。
- `ad_import_session`、`ad_import_item`、`ad_artifact_git_version`、`ad_artifact_sync`、`ad_project_repository`、`ad_user_project_repo_state` 存在。
- `ad_artifact_git_version.content_sha256` 和 `idx_content_hash` 索引存在。
- Redis 可用，`ai-delivery:job:{jobId}:lease` 能正常设置过期时间。
- Redis Pub/Sub 可用；多实例模式下可观察到 `ai-delivery:ws-events:*` channel 消息。
- `AI_DELIVERY_CENTER_JWT_SECRET` 已替换默认值。
- `ad_run_event` 和 `ad_domain_event` 已配置分区或归档任务。
- 客户端只上传 OS、capabilities、clientSession 心跳，不上传本机路径、Agent token 或终端命令密钥。
