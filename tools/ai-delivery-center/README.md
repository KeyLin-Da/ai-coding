# AI Delivery Center

Spring Boot 协作中心服务，负责 AI 需求交付的团队、需求流程、Git 产物版本索引、Job、运行日志和实时事件。客户端仍在本机执行 Git、OpenSpec 和 Agent CLI；中心服务只保存共享事实和非敏感能力摘要，不保存用户 Git 私钥。

## Git-backed 产物事实源

- 项目创建必须配置 AI 产物 Git 仓，中心写入 `ad_project_repository`，创建后不支持修改仓库地址。
- 每个用户按 `clientSessionId` 配置自己的 `deliveryWorkspaceRoot`，中心仅对当前用户返回该本地路径。
- 用户 Git 凭证存储在 `ad_user_git_credential`，只保存公钥、fingerprint、platform 和状态；私钥由 Local Runner 保存在本机。
- 产物同步成功后，中心写入 `ad_artifact_sync` 和 `ad_artifact_git_version`，`ad_artifact.current_version_id` 指向 Git 版本索引。
- 旧 `ad_artifact_version` / COS 版本仅作为 `LEGACY_COS` 历史只读兼容，不再作为新产物事实源。
- WebSocket 事件包括 `project.repo.state-changed`、`project.repo.pull-required`、`artifact.git-sync.blocked`、`artifact.git-sync.completed`。

## 分层约定

- `controller`: 只做 HTTP 协议适配、参数校验和统一响应，不写业务逻辑。
- `service`: 承载业务编排、权限校验、事务、领域事件和外部服务调用。
- `mapper`: MyBatis-Plus 数据访问接口，只暴露数据库操作。
- `model/entity`: 数据库实体，字段与 `ad_*` 表对应。
- `model/dto`: 请求和服务间数据传输对象。
- `model/vo`: 响应视图对象。
- `common/api`: 统一响应、分页等接口基础结构。
- `common/error`: 错误码、业务异常和全局异常处理。
- `config`: Spring、Security、COS、Redis、MyBatis-Plus 等配置。

## MapStruct 约定

- 转换器放在 `converter` 包，命名为 `{Domain}Converter`。
- entity 与 VO/DTO 的简单字段直接映射，枚举值保持英文大写。
- 涉及 JSON、COS URL、权限字段的转换由 service 显式处理，避免 converter 隐式访问外部依赖。

## 本地启动

```bash
cd tools/ai-delivery-center
mvn spring-boot:run
```

默认端口为 `8728`。MySQL、Redis、COS、JWT 和 WebSocket 配置均可通过 `AI_DELIVERY_CENTER_*` 环境变量覆盖，也可由 Nacos 提供同名配置。

## WebSocket 实时通道

- STOMP endpoint: `/api/ai-delivery/ws`
- Ticket 接口: `POST /api/ai-delivery/ws-tickets`
- 应用前缀: `/app`
- 推送前缀: `/topic`、`/user/queue`

客户端先用 `clientSessionId` 换取短期 ticket，再连接 WebSocket。`GET /api/ai-delivery/events?projectId=&afterEventId=` 保留为断线补偿查询接口；`/api/ai-delivery/events/subscribe` SSE 订阅入口已迁移为 WebSocket。

## 部署文档

完整部署、配置和运维说明见 [DEPLOYMENT.md](DEPLOYMENT.md)。
