## 背景

极易学中的学习活动权限仍然使用本地权限枚举、白名单、市场、公司和经销商岗位代码进行配置。需求 167023 将发起人和参与人权限迁移到会员中心人群包，使运营人员可以在 OPP 后台使用统一的受众模型，并让 APP 端资格判断使用最新配置。

## 变更内容

- 在 `opp-admin-vue` 的活动新增/编辑表单中，将适用场景的发起人权限和参与人权限配置替换为"选择投放对象"的人群包选择。
- 后台前端实现落点为 `opp-admin-vue/src/views/learnManagement/activity` 下的学习活动页面，不使用不存在的 `views/markLearn` 目录。
- 复用现有人群包选择组件和人群包查询 API，不在 `opp-learn` 中新增后台人群包列表接口。
- 仅将发起人和参与人人群包编码与活动持久化存储，不在活动表中冗余存储人群包名称。
- `opp-learn` 活动详情接口统一返回 `launchCrowdNoList` 和 `attendCrowdNoList`，元素为 `CrowdDTO(code, name)`，名称通过会员中心 `/getMemberAllCrowdListByPage` 查询。
- 组队学习列表页不展示人群包列，保持 PRD 澄清后的现有列表展示逻辑。
- 更新 APP 端 `/authActivity` 和 `/launchAuthActivity` 权限检查以分别使用参与人和发起人人群包配置。
- 保留员工身份行为：员工继续保持直接权限访问。
- 保持无人群包配置作为所有登录用户可见/可操作的默认设置。
- 为仍使用遗留权限字段的历史活动提供迁移和兼容性处理。

## 能力

### 新增能力

- `team-learning-crowd-permission`：涵盖极易学学习活动的后台人群包配置、详情回显、活动权限持久化、员工权限语义以及 APP 运行时权限检查。

### 修改的能力

- 无。

## 非目标

- 不在 `opp-learn` 中构建新的会员中心人群包列表 API。
- 不在此变更中删除遗留权限字段。
- 不更改无关的课程、考试、AI 练习或非组队学习权限模型。
- 不在组队学习列表页新增人群包展示列。

## 影响范围

- 前端：`opp-admin-vue/src/views/learnManagement/activity/detail.vue`、`components/ActivityBaseStep.vue`、`hooks/useCheckInLearningDetail.ts`、`src/api/learnActivity.ts` 复用现有人群包模态框；`learnManagement/activity/list.vue` 列表页保持无变更。
- 后端：`opp-learn` 活动创建/更新/详情模型、`fun_activity_info.launch_crowd_nos` / `attend_crowd_nos` 持久化，以及 APP 发起/参与资格检查。
- API：现有 `/api/v2/activityInfo/*` 请求体添加人群包编码字段；详情响应新增 `launchCrowdNoList` / `attendCrowdNoList`。
- 外部依赖：通过 `MemberGroupBmoFeignClient#getMemberAllCrowdListByPage` 按 `crowdNos` 获取人群包名称。
- 数据：历史活动需要从遗留权限配置到人群包配置的兼容性处理或迁移。

## 成功标准

- 管理员可为适用的极易学活动配置发起人和参与人人群包，活动表只保存人群包编码。
- 活动详情由 `opp-learn` 返回所选人群包编码和名称，后台编辑页可直接回显。
- APP 发起和参与控制分别与 `launch_crowd_nos` 和 `attend_crowd_nos` 匹配。
- 员工继续直接通过权限检查。
- 管理后台选择不需要新的 `opp-learn` 人群包列表端点。
