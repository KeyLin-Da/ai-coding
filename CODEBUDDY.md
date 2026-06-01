# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## 项目概述

OPP（展业平台）是一个基于 Spring Boot + Macula Boot 框架开发的微服务多模块 Maven 项目。项目采用领域驱动设计（DDD）思想，按业务领域划分为多个独立服务模块。

## 技术栈

### 后端技术栈

- **基础框架**: Spring Boot 2.x + Macula Boot 5.0.17
- **微服务架构**: Spring Cloud Alibaba（Nacos 服务注册与配置中心）
- **网关**: Spring Cloud Gateway
- **数据访问**: MyBatis-Plus + 动态数据源
- **缓存**: Redis + Spring Cache
- **消息队列**: RocketMQ
- **安全**: Spring Security + JWT
- **工具库**: Hutool, Lombok, MapStruct
- **Excel 处理**: EasyExcel, POI

### 前端技术栈

- **管理后台**: Vue 3 + Vite + Element Plus + Pinia
- **部分旧模块**: Vue 2 + Webpack + Element UI + Vuex
- **小程序**: Uni-app (Vue 2) 编译到微信小程序
- **问卷前端**: React + Umi Max + Ant Design 5 (opp-admin-survey-react)


## 常用命令

### 编译与构建

```bash
# 编译整个项目（在 opp-parent 目录执行）
mvn clean compile

# 打包整个项目
mvn clean package

# 打包跳过测试
mvn clean package -DskipTests

# 安装到本地仓库
mvn clean install

# 安装跳过测试
mvn clean install -DskipTests

# 编译单个模块（先进入模块目录）
cd opp-learn && mvn clean compile
```

### 运行单个服务

```bash
# 进入具体服务目录，如 opp-learn
cd opp-learn

# 使用默认 profile (local) 运行
mvn spring-boot:run

# 指定 profile 运行
mvn spring-boot:run -Dspring-boot.run.profiles=dev

# 直接运行 jar
java -jar target/opp-learn-1.0.0-SNAPSHOT.jar --spring.profiles.active=dev
```

### 测试

```bash
# 运行所有测试
mvn test

# 运行单个测试类
mvn test -Dtest=ClassName

# 运行单个测试方法
mvn test -Dtest=ClassName#methodName

# 运行测试并生成覆盖率报告
mvn test jacoco:report
```

### 前端项目命令

#### Vue 3 + Vite 项目（opp-admin-vue 等）

```bash
cd opp-admin-vue

# 安装依赖
npm install

# 开发模式运行
npm run dev

# 指定环境运行
npm run dev:dev

# 构建生产包
npm run build

# 指定环境构建
npm run build:dev
npm run build:test
npm run build:staging
npm run build:prd

# 代码检查
npm run lint

# 单元测试
npm run test:unit
```

#### Vue 2 + Webpack 项目（opp-admin-learn-vue 等）

```bash
cd opp-admin-learn-vue

# 安装依赖
npm install

# 开发模式运行
npm run serve

# 构建
npm run build

# 指定环境构建
npm run build:dev
npm run build:test
npm run build:staging
```

#### React + Umi Max 项目（opp-admin-survey-react）

```bash
cd opp-admin-survey-react

# 安装指定版本 pnpm（必须使用 pnpm，不能用 npm）
npm i -g pnpm@10.6.3

# 安装依赖
pnpm install

# 开发模式运行（测试环境）
npm run dev
# 或
npm run start

# 指定环境构建
npm run build:dev
npm run build:test
npm run build:stg
npm run build:prod

# 代码格式化
npm run format
```

#### Uni-app 小程序项目（opp-learn-uniapp）

```bash
cd opp-learn-uniapp

# 安装依赖
npm install

# 开发模式运行（微信小程序）
npm run dev:mp-weixin

# H5 开发模式
npm run dev:h5

# 指定环境 H5 开发
npm run dev:h5-dev
npm run dev:h5-test
npm run dev:h5-stg
npm run dev:h5-prod

# 构建微信小程序
npm run build:mp-weixin

# 构建 H5
npm run build:h5
```

### 多环境 Profile

项目支持以下环境：
- `local` (默认): 本地开发环境
- `dev`: 开发环境
- `test`: 测试环境
- `pet`: PET 环境
- `staging`: 预发布环境
- `prd`: 生产环境
- `gray`: 灰度环境

切换 profile：
```bash
mvn clean package -Pdev
```

## 架构规范

### 服务分层架构

每个领域服务（如 opp-learn、opp-user）采用以下分层结构：

```
src/main/java/com/infinitus/opp/{service}/
├── {Service}Application.java    # 应用入口
├── client/                      # Feign 客户端实现
│   └── impl/
├── config/                      # 配置类
├── constant/                    # 常量定义
├── controller/                  # REST API 控制器
├── convert/                     # 对象转换（MapStruct）
├── domain/                      # 领域模型
│   ├── bo/                      # 业务对象
│   └── entity/                  # 实体类
├── excel/                       # Excel 导入导出
├── exception/                   # 异常定义
├── handler/                     # 处理器
├── mapper/                      # MyBatis Mapper 接口
├── message/                     # 消息相关
├── redis/                       # Redis 操作
├── repository/                  # 仓储层（复杂查询）
└── service/                     # 业务逻辑层
    └── impl/
```

### API 模块规范

API 模块（opp-api/*-api）只包含接口定义：
- Feign 客户端接口（命名格式：`*Client.java`）
- DTO（数据传输对象，位于 `dto` 包）
- 常量定义

使用示例：
```java
// 注入 Feign 客户端
@Autowired
private CourseAndMemberClient courseAndMemberClient;

// 调用其他服务
CourseProgressDTO progress = courseAndMemberClient.getProgress(courseId);
```

### BFF 模块规范

BFF（Backend for Frontend）模块：
- 聚合多个领域服务的数据
- 为前端提供统一的 API 接口
- 处理前端特定的业务逻辑

### 数据访问规范

- **简单 CRUD**: 使用 MyBatis-Plus 的 `ServiceImpl` 和 `BaseMapper`
- **复杂查询**: 使用 `repository` 包下的自定义实现
- **多表关联**: 使用 `mybatis-plus-join` 库

**注意**: `opp-clock-in` 服务采用混合数据访问模式（JPA + MyBatis-Plus + JDBC），详见 `opp-clock-in/AGENTS.md`

### 错误码规范

错误码统一在 `{Service}Code.java` 中定义，格式为：
- 模块前缀 + 数字编码，如 `l10000`（学习服务）、`u1001`（用户服务）

### Feign 客户端规范

- API 接口定义在 `opp-api/{service}-api` 模块中
- 实现类在 `client/impl/` 目录下
- 服务消费者引入 API 模块依赖，自动注入 Feign 客户端

## 配置中心（Nacos）

- **服务端地址**: 不同环境配置在 `bootstrap.yml` 中
- **命名空间**: OPP_LOCAL（本地）、OPP_DEV（开发）、OPP_PRD（生产）等
- **共享配置**: `opp-common.yaml`
- **应用配置**: `{service-name}.yaml`

## 服务端口分配

| 服务 | 端口 | 说明 |
|------|------|------|
| opp-gateway | 8000 | 网关服务 |
| opp-learn | 9110 | 学习服务 |
| opp-clock-in | 9111 | 打卡服务 |
| opp-order | 9112 | 订单服务 |
| opp-user | 9113 | 用户服务 |
| opp-material | 9114 | 素材服务 |
| opp-meeting | 9115 | 会议服务 |
| opp-test | 9116 | 考试服务 |
| opp-diy | 9117 | DIY 服务 |
| opp-task | 9118 | 任务服务 |
| opp-triparty | 9119 | 三方服务 |
| opp-news-websocket | 9120 | 资讯 WebSocket |
| opp-openapi | 9121 | OpenAPI 服务 |

其他服务端口见各自 `bootstrap.yml` 配置。

## 开发注意事项

1. **Java 版本差异**:
   - 大部分服务: Java 11+
   - opp-survey: Java 1.8（基于芋道脚手架）
2. **Mapper 扫描**: 主类使用 `@MapperScan("com.infinitus.opp.{service}.mapper")` 扫描 Mapper
3. **Feign 客户端扫描**: 主类使用 `@EnableFeignClients(basePackages = "com.infinitus.opp.*.api")` 扫描 Feign 客户端
4. **组件扫描**: 主类使用 `@SpringBootApplication(scanBasePackages = "com.infinitus.opp.*")` 扫描组件
5. **缓存启用**: 主类使用 `@EnableCaching` 启用缓存
6. **异步支持**: 主类使用 `@EnableAsync` 启用异步方法

## 特殊模块说明

### opp-survey（问卷服务）

基于 SurveyKing 框架开发，采用独立的 Maven 结构：
- `surveyking-dependencies`: 依赖管理
- `surveyking-framework`: 框架 starters
- `surveyking-server`: 主服务
- `surveyking-module-*`: 业务模块

与其他 OPP 服务不同，该模块使用芋道脚手架，Java 版本为 1.8。

```bash
# 编译 opp-survey
cd opp-survey
mvn clean compile

# 运行问卷服务
mvn spring-boot:run -pl surveyking-server
```

### opp-survey 数据库初始化

```bash
# 数据库初始化脚本位置
opp-survey/sql/init-mysql.sql
```

## 模块级文档

部分模块有独立的 AGENTS.md 文件，提供模块特定的开发指南：

| 模块 | 文件 | 特殊说明 |
|------|------|----------|
| opp-learn | `opp-learn/AGENTS.md` | 详细的服务分层结构、缓存键定义 |
| opp-clock-in | `opp-clock-in/AGENTS.md` | JPA + MyBatis-Plus + JDBC 混合数据访问、Fenix 动态查询 |
| opp-material | `opp-material/AGENTS.md` | AI 功能模块、双云存储（OSS/COS） |
| opp-learn-uniapp | `opp-learn-uniapp/AGENTS.md` | Uni-app 开发规范、条件编译、平台差异处理 |

## OpenSpec 变更管理

项目使用 OpenSpec 进行结构化的变更管理，配置文件位于 `openspec/` 目录。使用以下技能进行变更流程：

- `/openspec-new-change`: 创建新的变更提案
- `/openspec-continue-change`: 继续变更工作流
- `/openspec-verify-change`: 验证实现与变更工件一致性
