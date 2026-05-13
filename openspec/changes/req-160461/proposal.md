## Why

将组队学习（极易学）功能从 `opp-admin-learn-vue` 项目迁移到 `opp-admin-vue` 项目，同时迭代新功能以支持文化推广专区需求。

**背景**:
- 当前组队学习功能分散在旧版 Vue 2 项目中，维护成本高
- 需要统一内管前端架构，所有新功能开发基于 Vue 3 + Element Plus
- 同时需要迭代 7 个新功能点以支持文化推广专区业务需求

## What Changes

### 功能迁移（从 Vue 2 到 Vue 3）
- 迁移组队学习活动管理页面
- 迁移活动新增/编辑表单
- 迁移活动日期配置功能
- 迁移学习数据统计页面
- 迁移白名单管理功能
- 迁移分享二维码功能

### 新增功能迭代

1. **【新增】解锁方式 = 按日期解锁**
   - 支持按指定日期解锁任务
   - 前端需适配日期选择器

2. **【新增】是否展示排行榜配置**
   - 后台新增「是否展示排行榜」字段
   - 默认值：历史数据=true，新创建可配置
   - 前端需适配显示/隐藏逻辑

3. **【调整】成功邀请好友获得奖励改为选填**
   - `invitePoints` 字段由必填改为选填
   - 支持配置为 0

4. **【新增】活动内容按指定日期显示**
   - 支持配置每个任务的显示日期
   - 新增字段：`displayDate`

5. **【优化】学习内容/学习课件必填校验优化**
   - 原逻辑：分别必填
   - 新逻辑：两者至少填一个即可

6. **【新增】测评和问卷配置**
   - 新增任务类型：考试、调研
   - 对接卷王考试系统
   - 对接体验家问卷系统
   - 新增字段：`examId`, `surveyId`, `taskType`

7. **【新增】支持多个课后作业（最多 3 个）**
   - 原功能：单个课后作业
   - 新功能：支持配置 1-3 个课后作业
   - 新增字段：`homeworkList` (array, max=3)

8. **【新增】学习内容支持图片格式**
   - 原支持：mp3, mp4
   - 新增支持：jpg, jpeg, png

### 技术变更（Breaking Changes）
- Vue 2 → Vue 3 框架升级
- Element UI → Element Plus 组件库升级
- Vuex → Pinia 状态管理升级
- Options API → Composition API (`<script setup>`)
- `avue-crud` 低代码表格 → Element Plus `el-table`

## New Capabilities

- `team-learn-migration`: 组队学习功能从 Vue 2 迁移到 Vue 3
- `task-type-config`: 任务类型配置（学习/考试/调研）
- `multi-homework`: 多课后作业配置能力
- `ranking-toggle`: 排行榜展示开关配置
- `date-unlock`: 按日期解锁能力

### Modified Capabilities

- `invite-reward`: 邀请好友奖励由必填改为选填

## Impact

### 代码影响范围

**前端项目**:
- `opp-admin-vue`: 新增组队学习模块代码
- `opp-admin-learn-vue`: 功能迁移后逐步废弃

**后端项目**:
- `opp-learn`: 需要新增/修改接口支持新功能点

### 需要新增的文件

```
opp-admin-vue/
├── src/
│   ├── api/
│   │   └── teamLearn/
│   │       └── index.js              # API 接口
│   ├── views/
│   │   └── teamLearn/
│   │       ├── index.vue             # 活动列表页
│   │       ├── components/
│   │       │   ├── ActivityForm.vue  # 活动表单
│   │       │   ├── DateForm.vue      # 日期配置
│   │       │   └── DataDialog.vue    # 数据弹窗
│   │       └── composables/
│   │           └── useTeamLearn.js   # 业务逻辑
│   └── router/
│       └── modules/
│           └── teamLearn.js          # 路由配置
```

### 需要修改的文件

**后端 opp-learn 项目**:
- 数据库表结构新增字段
- API 接口新增参数和返回值
- 对接卷王/体验家第三方系统

### 依赖系统

- 卷王考试系统（第三方）
- 体验家问卷系统（第三方）
- DAM 素材管理系统（已有）

## Success Criteria

1. 所有现有组队学习功能在新项目中正常运行
2. 7 个新功能点全部实现并可配置
3. 单元测试覆盖率 ≥ 80%
4. 前后端接口联调通过
5. UAT 验收通过
