# AI Delivery Center

Spring Boot 协作中心服务，负责 AI 需求交付的团队、需求流程、产物版本、Job、运行日志和实时事件。客户端仍在本机执行 Git、OpenSpec 和 Agent CLI；中心服务只保存共享事实和非敏感能力摘要。

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

默认端口为 `8728`。MySQL、Redis、COS 和 JWT 配置均可通过 `AI_DELIVERY_CENTER_*` 环境变量覆盖，也可由 Nacos 提供同名配置。

## 部署文档

完整部署、配置和运维说明见 [DEPLOYMENT.md](DEPLOYMENT.md)。
