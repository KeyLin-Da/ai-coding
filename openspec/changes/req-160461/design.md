## Context

### 背景

组队学习功能当前在 `opp-admin-learn-vue` (Vue 2) 项目中运行，需要迁移到 `opp-admin-vue` (Vue 3) 项目。同时需要迭代 7 个新功能点以支持文化推广专区需求。

### 技术栈对比

| 维度 | 源项目 (opp-admin-learn-vue) | 目标项目 (opp-admin-vue) |
|------|------------------------------|--------------------------|
| 框架 | Vue 2.6.10 | Vue 3.2.47 |
| 路由 | Vue Router 3.0.1 | Vue Router 4.1.6 |
| 状态管理 | Vuex 3.1.1 | Pinia 2.0.33 |
| UI 组件库 | Element UI 2.x | Element Plus |
| 构建工具 | Webpack | Vite 4.1.0 |
| 代码风格 | Options API | Composition API (`<script setup>`) |

### 现有架构

```
opp-admin-learn-vue/src/
├── views/mark_learn2/          # 组队学习页面（主）
│   ├── team_learn.vue          # 活动列表
│   ├── add_activity.vue        # 新增/编辑活动
│   ├── add_activity_date.vue   # 日期配置
│   ├── learn_data.vue          # 学习数据
│   └── mixins/markLearn2Mixins.js
├── api/mark_learn/             # API 接口
└── components/                  # 公共组件
    └── upload/upload.vue       # 上传组件
```

### 约束条件

1. **后端服务不变**: 本次只涉及前端迁移和后端接口微调，不涉及后端架构变更
2. **数据兼容**: 历史数据需要平滑迁移，新字段需有默认值
3. **第三方系统**: 卷王考试系统、体验家问卷系统为外部依赖
4. **权限系统**: 复用现有的权限管理机制

## Goals / Non-Goals

**Goals:**

1. 完成 Vue 2 到 Vue 3 的前端迁移，保持功能完整性
2. 实现 7 个新功能点，支持文化推广专区业务
3. 保持与后端 opp-learn 服务的 API 兼容
4. 实现平滑的数据迁移，历史数据无感知升级

**Non-Goals:**

1. 不涉及后端微服务架构变更
2. 不涉及数据库底层设计重构
3. 不涉及 App 端（小程序）改动
4. 不涉及第三方系统（卷王、体验家）的改造

## Decisions

### 1. 前端迁移策略：完全重写 vs 渐进式迁移

**决策**: 采用**完全重写**策略

**理由**:
- Vue 2 到 Vue 3 存在大量破坏性变更（如移除 `$on/$off`、过滤器等）
- Options API 到 Composition API 的心智模型差异大
- Element UI 到 Element Plus 组件 API 有差异
- `avue-crud` 低代码组件在 Vue 3 生态不成熟，需替换为原生 `el-table`

**替代方案**:
- Vue 2.7 过渡版：增加迁移成本，不推荐
- @vue/compat 模式：仍需处理大量兼容性问题

### 2. 状态管理方案

**决策**: 使用 **Pinia** 配合 Composables

**理由**:
- Pinia 是 Vue 3 官方推荐的状态管理方案
- 与 Vuex 相比，API 更简洁，TypeScript 支持更好
- Composables 模式可替代 mixins，代码组织更清晰

**迁移映射**:
```javascript
// Vuex (源)
mapGetters(['permission', 'userInfo'])

// Pinia (目标)
const userStore = useUserStore()
const permissionStore = usePermissionStore()
```

### 3. 表格组件方案

**决策**: 使用 **Element Plus el-table** 替代 avue-crud

**理由**:
- avue-crud 在 Vue 3 生态不稳定
- Element Plus 原生组件更可控
- 表格逻辑相对简单，重写成本低

**影响**:
- 需要手动实现分页、排序、筛选功能
- 需要手动封装表格操作按钮区域

### 4. 后端 API 设计

**决策**: 采用**增量扩展**策略

**新增字段** (activity_info 表):

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| show_ranking | tinyint(1) | 是否展示排行榜 | 1 (历史数据默认展示) |
| activity_category | varchar(64) | 活动分类 | NULL |

**任务配置扩展** (activity_calendar 表):

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| task_type | varchar(20) | 任务类型: study/exam/survey | 'study' |
| task_name | varchar(100) | 任务名称 | NULL |
| button_text | varchar(20) | 按钮文案 | '去学习' |
| unlock_date | date | 任务开启日期 | NULL |
| display_date | date | 任务显示日期 | NULL |
| exam_id | varchar(64) | 卷王考试ID | NULL |
| survey_id | varchar(64) | 体验家问卷ID | NULL |
| homework_list | json | 课后作业列表 | NULL |

**字段变更**:
- `invite_points` 字段改为**可空**（原为必填）

### 5. 第三方系统对接方案

**决策**: 通过**后端代理**方式对接

```
┌──────────┐    ┌──────────┐    ┌──────────────┐
│  前端    │───▶│  opp-learn│───▶│ 卷王/体验家   │
│ admin-vue│    │  后端     │    │ 第三方系统    │
└──────────┘    └──────────┘    └──────────────┘
```

**理由**:
- 避免前端直接暴露第三方系统凭证
- 统一错误处理和日志记录
- 便于后续切换第三方服务商

**新增接口**:
```java
GET /admin/api/v2/exam/juanwang/list     // 获取卷王考试列表
GET /admin/api/v2/survey/tyj/list        // 获取体验家问卷列表
```

### 6. 数据迁移方案

**决策**: **数据库默认值 + 后端兼容**策略

**步骤**:
1. 数据库新增字段设置默认值
2. 历史数据自动获得默认值（show_ranking=1）
3. 后端接口返回新字段，前端适配显示

**回滚方案**:
- 新字段均为可空或带默认值
- 删除新字段即可回滚
- 前端独立部署，可快速回退版本

## Risks / Trade-offs

### 风险 1: avue-crud 功能迁移遗漏

**风险**: avue-crud 封装了大量功能，迁移时可能遗漏

**缓解措施**:
- 详细对比 avue-crud 功能清单
- 编写迁移 Checklist
- 充分的回归测试

### 风险 2: 第三方系统稳定性

**风险**: 卷王/体验家系统故障影响组队学习功能

**缓解措施**:
- 对接接口设置超时和重试机制
- 前端展示降级提示
- 监控告警

### 风险 3: 历史数据兼容

**风险**: 新字段对历史数据的影响

**缓解措施**:
- 所有新字段设置合理默认值
- 历史数据迁移脚本验证
- 灰度发布验证

### 风险 4: 前端迁移工期

**风险**: 迁移工作量评估不足导致延期

**缓解措施**:
- 分阶段交付，优先核心功能
- 复用 Element Plus 现有组件
- 代码 Review 确保质量

## Migration Plan

### 阶段一: 基础设施 (Week 1)

1. 创建前端目录结构
2. 迁移 API 接口定义
3. 迁移工具函数和 Composables
4. 配置路由和权限

### 阶段二: 核心页面 (Week 2-3)

1. 迁移活动列表页 (team_learn.vue)
2. 迁移活动表单页 (add_activity.vue)
3. 迁移日期配置页 (add_activity_date.vue)
4. 迁移数据弹窗 (learn_data.vue)

### 阶段三: 新功能开发 (Week 3-4)

1. 排行榜配置功能
2. 任务类型扩展（考试/调研）
3. 多作业配置
4. 第三方系统对接

### 阶段四: 测试与上线 (Week 4-5)

1. 功能测试
2. 接口联调
3. UAT 验收
4. 灰度发布

### 回滚策略

| 组件 | 回滚方案 |
|------|----------|
| 前端 | 保留旧版本部署包，一键切换 |
| 后端 | 新字段可空，删除不影响旧逻辑 |
| 数据库 | 删除新增字段即可 |

## Open Questions

1. **富文本编辑器选型**: Vue 3 生态推荐哪个编辑器？（候选: wangEditor, TinyMCE, Quill）
2. **卷王/体验家对接细节**: 具体的 API 文档和认证方式？
3. **活动分类数据源**: 分类列表是否需要后台管理？还是硬编码？
4. **白名单上传格式**: 是否有模板要求？是否需要支持批量导入？
