# AI Delivery Center 部署文档

`ai-delivery-center` 是 AI 需求交付桌面协作模式的共享事实源。它保存团队、用户、项目、需求流程、审核、issue、Job、运行日志索引、领域事件和产物业务版本；产物文件内容存放在腾讯云 COS，客户端本机路径和 Agent 密钥不进入中心库。

## 运行依赖

- JDK 11+
- Maven 3.8+
- MySQL 8.x
- Redis 6.x+
- 腾讯云 COS Bucket，建议开启 Bucket Versioning
- Nacos 可选，用于 OPP 微服务体系内统一配置和服务发现

## 数据库

服务启动时通过 Flyway 执行 `src/main/resources/db/migration/V1__create_ai_delivery_center_schema.sql`，创建 `ad_*` 表。

关键表：

- `ad_requirement`、`ad_workflow_stage`、`ad_review`、`ad_issue`: 共享流程、阶段、审核和问题
- `ad_artifact`、`ad_artifact_version`、`ad_file_object`: 逻辑产物、业务版本和 COS 对象元数据
- `ad_job`、`ad_run`、`ad_run_event`: Local Runner Job 和共享运行日志
- `ad_domain_event`、`ad_client_session`: 实时协作事件和在线客户端

`ad_run_event` 和 `ad_domain_event` 需要按月分区或按 `created_at` 做归档，默认事件保留窗口由 `AI_DELIVERY_CENTER_EVENT_RETAINED_WINDOW` 控制。

## 配置项

所有配置可通过环境变量覆盖，也可以由 Nacos 下发同名配置。

| 环境变量 | 说明 | 默认值 |
| --- | --- | --- |
| `AI_DELIVERY_CENTER_PORT` | HTTP 端口 | `8728` |
| `AI_DELIVERY_CENTER_DATASOURCE_URL` | MySQL JDBC URL | `jdbc:mysql://127.0.0.1:3306/ai_delivery_center...` |
| `AI_DELIVERY_CENTER_DATASOURCE_USERNAME` | MySQL 用户名 | `root` |
| `AI_DELIVERY_CENTER_DATASOURCE_PASSWORD` | MySQL 密码 | 空 |
| `AI_DELIVERY_CENTER_FLYWAY_ENABLED` | 是否启用 Flyway migration | `true` |
| `AI_DELIVERY_CENTER_FLYWAY_BASELINE_ON_MIGRATE` | 非空 schema 无历史表时是否自动 baseline | `true` |
| `AI_DELIVERY_CENTER_FLYWAY_BASELINE_VERSION` | baseline 版本，设为 0 后仍会执行 V1 | `0` |
| `AI_DELIVERY_CENTER_REDIS_HOST` | Redis host | `127.0.0.1` |
| `AI_DELIVERY_CENTER_REDIS_PORT` | Redis port | `6379` |
| `AI_DELIVERY_CENTER_REDIS_PASSWORD` | Redis 密码 | 空 |
| `AI_DELIVERY_CENTER_REDIS_DATABASE` | Redis database | `0` |
| `AI_DELIVERY_CENTER_REDIS_KEY_PREFIX` | Redis key 前缀 | `ai-delivery` |
| `AI_DELIVERY_CENTER_COS_BUCKET` | COS Bucket | 空 |
| `AI_DELIVERY_CENTER_COS_REGION` | COS Region | `ap-guangzhou` |
| `AI_DELIVERY_CENTER_COS_SECRET_ID` | COS SecretId | 空 |
| `AI_DELIVERY_CENTER_COS_SECRET_KEY` | COS SecretKey | 空 |
| `AI_DELIVERY_CENTER_COS_SIGNED_URL_TTL` | 预签名 URL 有效期 | `10m` |
| `AI_DELIVERY_CENTER_COS_BUCKET_VERSIONING_ENABLED` | 是否要求 Bucket Versioning | `true` |
| `AI_DELIVERY_CENTER_JOB_LEASE_TTL` | Job 领取租约 TTL | `60s` |
| `AI_DELIVERY_CENTER_JOB_HEARTBEAT_INTERVAL` | 客户端续约间隔 | `20s` |
| `AI_DELIVERY_CENTER_JOB_MAX_RETRY_TIMES` | Job 最大重试次数 | `3` |
| `AI_DELIVERY_CENTER_EVENT_RETAINED_WINDOW` | 事件补偿保留窗口 | `7d` |
| `AI_DELIVERY_CENTER_EVENT_PAGE_SIZE` | 事件补偿分页大小 | `500` |
| `AI_DELIVERY_CENTER_JWT_ISSUER` | JWT issuer | `ai-delivery-center` |
| `AI_DELIVERY_CENTER_JWT_SECRET` | JWT 签名密钥 | `change-me` |
| `AI_DELIVERY_CENTER_ACCESS_TOKEN_TTL` | Access token 有效期 | `8h` |
| `AI_DELIVERY_CENTER_NACOS_CONFIG_ENABLED` | 是否启用 Nacos 配置 | `false` |
| `AI_DELIVERY_CENTER_NACOS_DISCOVERY_ENABLED` | 是否启用 Nacos 注册发现 | `false` |
| `AI_DELIVERY_CENTER_NACOS_SERVER_ADDR` | Nacos 地址 | `127.0.0.1:8848` |
| `AI_DELIVERY_CENTER_NACOS_NAMESPACE` | Nacos namespace | 空 |
| `AI_DELIVERY_CENTER_NACOS_GROUP` | Nacos group | `DEFAULT_GROUP` |

生产环境必须覆盖 `AI_DELIVERY_CENTER_JWT_SECRET`、数据库密码和 COS 密钥，不要把这些值提交到仓库。

### Flyway 接管已有库

如果启动时报错 `Found non-empty schema(s) ... but no schema history table`，说明目标库里已经有表，但 Flyway 还没有 `flyway_schema_history`。默认配置已启用：

```yaml
spring.flyway.baseline-on-migrate: true
spring.flyway.baseline-version: 0
```

这样 Flyway 会先创建 history 表，再继续执行 `V1__create_ai_delivery_center_schema.sql`。当前 V1 使用 `CREATE TABLE IF NOT EXISTS`，不会删除或重建已有表。

生产环境接入已有库前仍建议先确认 `AI_DELIVERY_CENTER_DATASOURCE_URL` 指向正确 schema，并备份数据库。

## COS 版本管理

业务版本由数据库管理，COS 只保存不可变文件内容：

1. 客户端请求 `POST /api/ai-delivery/artifact-upload-sessions`，中心服务生成 COS key 和预签名上传 URL。
2. 客户端 PUT 文件到 COS。
3. 客户端请求 `POST /api/ai-delivery/artifact-versions/complete`。
4. 中心服务校验 COS 对象 `sha256`、`size`、`contentType`，创建 `ad_file_object` 和 `ad_artifact_version`。
5. 事务内更新 `ad_artifact.current_version_id`，写入 `ad_domain_event` 并广播。

推荐 COS key：

```text
teams/{teamId}/requirements/{requirementId}/artifacts/{artifactId}/versions/{versionNo}/{fileName}
```

COS 原生 Versioning 仅作为误删和覆盖保险；用户看到的当前版本、版本号、作者、来源 run、审核绑定和冲突检测均以数据库为准。

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

桌面客户端远程模式默认连接 `http://127.0.0.1:8728`，也可以在「设置 / 个人中心」中修改 `centerBaseUrl`。

## 权限与事件

- 所有需求、产物、审核、issue、Job、run event 和 domain event 访问都必须校验用户团队/项目成员关系。
- SSE 订阅支持 `X-User-Id` header；浏览器 EventSource 无法传自定义 header 时，可临时使用 `userId` query 参数。生产环境应切换为 JWT 或会话 token。
- `GET /api/ai-delivery/events?projectId=&afterEventId=` 用于断线补偿；事件过期时客户端需要做全量刷新。
- 多实例部署时，需用 Redis 保存在线会话和 Job 租约。后续如接入 RocketMQ，事件消费者应按 `eventId` 幂等处理。

## 运维检查

- MySQL 表结构已执行 Flyway migration，`ad_*` 表存在。
- Redis 可用，`ai-delivery:job:{jobId}:lease` 能正常设置过期时间。
- COS Bucket region、bucket、SecretId、SecretKey 配置正确，预签名上传/预览 URL 可用。
- Bucket Versioning 已开启或明确接受只使用业务不可变 key。
- `AI_DELIVERY_CENTER_JWT_SECRET` 已替换默认值。
- `ad_run_event` 和 `ad_domain_event` 已配置分区或归档任务。
- 客户端只上传 OS、capabilities、clientSession 心跳，不上传本机路径、Agent token 或终端命令密钥。
