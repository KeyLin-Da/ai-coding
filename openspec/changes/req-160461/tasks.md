## 1. 数据库变更

- [ ] 1.1 创建数据库迁移脚本 - 新增 `activity_info` 表字段
  - 新增字段：`show_ranking` (tinyint, 默认 1)
  - 新增字段：`activity_category` (varchar(64), 可空)
  - 编写迁移脚本并验证

- [ ] 1.2 创建数据库迁移脚本 - 新增 `activity_calendar` 表字段
  - 新增字段：`task_type` (varchar(20), 默认 'study')
  - 新增字段：`task_name` (varchar(100), 可空)
  - 新增字段：`button_text` (varchar(20), 默认 '去学习')
  - 新增字段：`unlock_date` (date, 可空)
  - 新增字段：`display_date` (date, 可空)
  - 新增字段：`exam_id` (varchar(64), 可空)
  - 新增字段：`survey_id` (varchar(64), 可空)
  - 新增字段：`homework_list` (json, 可空)
  - 编写迁移脚本并验证

- [ ] 1.3 修改 `invite_points` 字段为可空
  - ALTER TABLE 修改字段约束
  - 验证历史数据兼容性

## 2. 后端实体与 DTO

- [ ] 2.1 更新 `ActivityInfoEntity` 实体类
  - 新增字段：`showRanking`, `activityCategory`
  - 更新字段：`invitePoints` 改为可空

- [ ] 2.2 更新 `ActivityCalendarEntity` 实体类
  - 新增字段：`taskType`, `taskName`, `buttonText`, `unlockDate`, `displayDate`, `examId`, `surveyId`
  - 新增字段：`homeworkList` (List<HomeworkDTO>)

- [ ] 2.3 创建 `HomeworkDTO` 数据传输对象
  - 字段：`type`, `url`, `name`

- [ ] 2.4 创建 `TaskDetailVO` 视图对象
  - 封装任务详情返回结构

## 3. 后端接口开发

- [ ] 3.1 更新活动列表查询接口
  - `GET /admin/api/v2/activityInfo/getActivityListVoPage`
  - 返回值新增 `showRanking` 字段

- [ ] 3.2 更新活动详情查询接口
  - `GET /admin/api/v2/activityInfo/getActivityDetail`
  - 返回值包含完整的任务配置信息

- [ ] 3.3 更新活动创建接口
  - `POST /admin/api/v2/activityInfo/saveActivity`
  - 支持新字段：`showRanking`, `activityCategory`
  - 移除 `invitePoints` 必填校验

- [ ] 3.4 更新活动更新接口
  - `POST /admin/api/v2/activityInfo/updateActivity`
  - 支持更新新字段

- [ ] 3.5 新增卷王考试列表接口
  - `GET /admin/api/v2/exam/juanwang/list`
  - 参数：`keyword`, `pageNum`, `pageSize`
  - 返回考试列表

- [ ] 3.6 新增体验家问卷列表接口
  - `GET /admin/api/v2/survey/tyj/list`
  - 参数：`keyword`, `pageNum`, `pageSize`
  - 返回问卷列表

## 4. 第三方系统对接

- [ ] 4.1 创建 `JuanwangClient` 客户端类
  - 封装卷王系统 API 调用
  - 配置超时和重试机制
  - 实现认证逻辑

- [ ] 4.2 创建 `TyjClient` 客户端类
  - 封装体验家系统 API 调用
  - 配置超时和重试机制
  - 实现认证逻辑

- [ ] 4.3 配置第三方系统凭证
  - Nacos 配置中心添加 API 密钥
  - 配置不同环境的 endpoint

## 5. 业务逻辑开发

- [ ] 5.1 更新活动创建逻辑
  - `showRanking` 默认值处理
  - `taskType` 默认值处理
  - 多作业配置验证（最多 3 个）

- [ ] 5.2 更新任务解锁逻辑
  - 支持"按日期解锁"方式
  - 任务开启日期判断

- [ ] 5.3 更新学习内容/课件校验逻辑
  - 改为二选一必填
  - 前端传递时校验

- [ ] 5.4 更新邀请积分逻辑
  - 积分为 0 或 null 时隐藏相关 UI
  - 历史数据兼容

- [ ] 5.5 更新排行榜展示逻辑
  - 根据 `showRanking` 字段控制展示
  - 历史数据默认展示

- [ ] 5.6 更新活动分类展示逻辑
  - 未配置分类的活动不在热门活动显示

## 6. 前端基础迁移

- [ ] 6.1 创建前端目录结构
  - 创建 `src/views/teamLearn/` 目录
  - 创建 `src/api/teamLearn/` 目录
  - 创建路由配置文件

- [ ] 6.2 迁移 API 接口定义
  - 创建 `src/api/teamLearn/index.ts`
  - 迁移所有 API 接口
  - 适配 axios 封装

- [ ] 6.3 创建 Composables
  - 创建 `useTeamLearn.ts` (替代 mixins)
  - 创建 `useActivityForm.ts`
  - 创建 `useWhiteList.ts`

- [ ] 6.4 配置路由
  - 创建 `src/router/modules/teamLearn.ts`
  - 配置菜单和权限

## 7. 前端页面迁移

- [ ] 7.1 迁移活动列表页
  - 创建 `src/views/teamLearn/index.vue`
  - 使用 Element Plus `el-table` 替代 avue-crud
  - 实现搜索、分页、操作按钮

- [ ] 7.2 迁移活动表单页
  - 创建 `src/views/teamLearn/components/ActivityForm.vue`
  - 实现基础信息表单
  - 实现参与范围配置
  - 实现时间配置

- [ ] 7.3 迁移任务配置组件
  - 创建 `src/views/teamLearn/components/TaskConfig.vue`
  - 支持任务类型选择
  - 支持考试/调研选择
  - 支持多作业配置

- [ ] 7.4 迁移日期配置组件
  - 创建 `src/views/teamLearn/components/DateConfig.vue`
  - 支持按日期解锁配置

- [ ] 7.5 迁移数据统计弹窗
  - 创建 `src/views/teamLearn/components/DataDialog.vue`
  - 实现数据展示和导出

- [ ] 7.6 迁移分享二维码功能
  - 创建分享弹窗组件
  - 实现二维码显示和下载

## 8. 前端新功能开发

- [ ] 8.1 开发排行榜配置功能
  - 表单新增开关组件
  - 数据绑定和提交

- [ ] 8.2 开发任务类型选择功能
  - 任务类型单选组件
  - 考试选择下拉框
  - 调研选择下拉框

- [ ] 8.3 开发多作业配置功能
  - 作业列表组件
  - 添加/删除作业按钮
  - 文件上传组件

- [ ] 8.4 开发按日期解锁功能
  - 日期选择器
  - 解锁方式切换

- [ ] 8.5 开发学习内容图片上传
  - 更新文件类型限制
  - 更新提示文案

- [ ] 8.6 开发活动分类配置
  - 分类下拉选择
  - 展示控制逻辑

## 9. 测试

- [ ] 9.1 编写后端单元测试
  - ActivityInfoService 测试
  - JuanwangClient 测试
  - TyjClient 测试

- [ ] 9.2 编写前端组件测试
  - ActivityForm 组件测试
  - TaskConfig 组件测试

- [ ] 9.3 接口联调测试
  - 活动增删改查
  - 第三方系统对接
  - 文件上传

- [ ] 9.4 端到端测试
  - 完整活动创建流程
  - 任务配置流程
  - 数据展示流程

## 10. 文档与发布

- [ ] 10.1 更新接口文档
  - Swagger 注解
  - 接口变更说明

- [ ] 10.2 编写前端组件文档
  - 组件使用说明
  - Props 和 Events 说明

- [ ] 10.3 编写迁移文档
  - 数据库迁移说明
  - 前端迁移说明
  - 配置变更说明

- [ ] 10.4 准备发布包
  - 后端服务打包
  - 前端资源打包
  - 数据库迁移脚本

- [ ] 10.5 UAT 验收
  - 功能验收
  - 性能测试
  - 兼容性测试
