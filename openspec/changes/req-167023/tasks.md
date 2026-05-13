## 1. 数据模型和 API 契约

- [x] 1.1 向 `fun_activity_info` 添加可空列：`launch_crowd_nos`、`attend_crowd_nos`；不添加人群包名称列。
- [x] 1.2 向 `opp-learn/src/main/java/com/infinitus/opp/learn/domain/entity/activity/FunActivityInfoEntity.java` 添加 `launchCrowdNos`、`attendCrowdNos` 字段。
- [x] 1.3 向 `opp-api/opp-learn-api/src/main/java/com/infinitus/opp/learn/vo/activity/FunActivityInfoVO.java` 添加 `launchCrowdNos`、`attendCrowdNos` 字段，用于创建、更新和详情基础编码传输。
- [x] 1.4 新增或复用活动人群包 DTO，例如 `opp-api/opp-learn-api/src/main/java/com/infinitus/opp/learn/dto/activity/CrowdDTO.java`，字段为 `code`、`name`。
- [x] 1.5 向 `opp-api/opp-learn-api/src/main/java/com/infinitus/opp/learn/vo/activity/FunActivityDetailVO.java` 添加 `launchCrowdNoList: List<CrowdDTO>`、`attendCrowdNoList: List<CrowdDTO>`。
- [x] 1.6 更新 `opp-learn/src/main/resources/mapper/activity/FunActivityInfoMapper.xml` 和 `opp-learn/src/main/resources/mapper/course/FunActivityMapper.xml` 的相关 select 投影，使详情和 APP 权限流程能读取 `launch_crowd_nos`、`attend_crowd_nos`。

## 2. 后端详情回显

- [x] 2.1 在 `opp-learn` 中增加人群包详情组装逻辑，解析 `launchCrowdNos` 和 `attendCrowdNos`，合并去重后批量查询名称。
- [x] 2.2 使用 `MemberGroupBmoFeignClient#getMemberAllCrowdListByPage` 和 `MemberCrowdListPageQuery.crowdNos` 获取人群包名称，并设置 `scene = CrowdSceneEnum.OPP.getValue()`。
- [x] 2.3 将 `CrowdVO.crowdNo` / `CrowdVO.crowdName` 映射为 `CrowdDTO.code` / `CrowdDTO.name`，分别回填到 `launchCrowdNoList` 和 `attendCrowdNoList`。
- [x] 2.4 处理会员中心未返回某个编码的情况：详情响应必须保留该编码，并提供可显示的降级名称，避免后台编辑丢失已保存配置。
- [x] 2.5 更新 `FunActivityController.getActivityDetail` 或对应服务层，确保后台编辑页从详情接口即可获取人群包名称列表。

## 3. 后端 APP 权限逻辑

- [x] 3.1 在 `opp-learn/src/main/java/com/infinitus/opp/learn/service/impl/activity/FunActivityServiceImpl.java` 中增加人群包权限助手，封装适用范围判断、员工直接通过、空配置默认开放、会员中心命中和失败关闭逻辑。
- [x] 3.2 更新 `authActivity(Long activityId, UserVO memberData)`：适用新人群包逻辑时使用 `attendCrowdNos` 判断参与资格；非适用范围继续走旧 `checkAuth`。
- [x] 3.3 更新 `launchAuthActivity(Long activityId, UserVO memberData, Long teamId)`：适用新人群包逻辑时使用 `launchCrowdNos` 判断发起资格，不再复用或覆盖为参与人权限。
- [x] 3.4 集成会员中心人群命中接口，例如 `MemberGroupBmoFeignClient.queryMemberInCrowd`，使用当前用户编码、配置的人群包编码和 OPP 场景判断是否命中任一人群包。
- [x] 3.5 对配置了人群包但会员中心调用失败的情况采用失败关闭策略，并记录 activityId、用户编码、人群包编码和异常信息。

## 4. 后端保存和迁移

- [x] 4.1 验证 `createActivityRecords` 和 `updateActivityRecords` 通过现有 `BeanUtil.copyProperties` 路径持久化 `launchCrowdNos`、`attendCrowdNos`；如无法自动映射则添加显式处理。
- [x] 4.2 在 `opp-learn/src/main/resources/sql/` 下补充数据库迁移 SQL，包含新增列和可选历史权限映射说明。
- [x] 4.3 按 PRD 对照表准备历史数据迁移脚本或操作说明：公开、需要绑定卡号、分公司、职称等映射到已确认的人群包编码；未确认编码输出待处理清单。
- [x] 4.4 确认历史活动在新字段为空时仍可按兼容默认或旧权限行为访问，不阻断线上活动。

## 5. 管理后台前端

- [x] 5.1 更新 `opp-admin-vue/src/views/learnManagement/activity/hooks/useCheckInLearningDetail.ts`，在 `CheckInLearningFormModel` 和提交 payload 中新增 `launchCrowdNos`、`attendCrowdNos`、`launchCrowdNoList`、`attendCrowdNoList`，并提供 `CrowdDTO(code, name)` 与弹窗行数据的转换。
- [x] 5.2 更新 `opp-admin-vue/src/views/learnManagement/activity/components/ActivityBaseStep.vue`，在打卡学习和组队学习的参与人适用场景中将旧 `attentRange` 选择改为"选择投放对象"，绑定 `attendCrowdNos` 并展示 `attendCrowdNoList` 的名称。
- [x] 5.3 更新 `opp-admin-vue/src/views/learnManagement/activity/components/ActivityBaseStep.vue`，仅在组队学习中将发起人权限改为"选择投放对象"，绑定 `launchCrowdNos` 并展示 `launchCrowdNoList` 的名称。
- [x] 5.4 复用 `opp-admin-vue/src/components/crowdPacksModal/index.vue` 的多选、搜索、分页和跨页保留选择能力；确认 `confirm` 结果按 `crowdNo` 组装为逗号分隔编码，并按 `crowdName` 展示名称。
- [x] 5.5 编辑/查看模式从活动详情的 `launchCrowdNoList` / `attendCrowdNoList` 初始化已选人群包，不再额外调用接口解析名称；会员中心名称缺失时保留编码并展示降级名称。
- [x] 5.6 对非适用范围活动保留原市场、分公司、职级和白名单控件及旧表单行为；切换活动类型时清理不再适用的人群包选择。
- [x] 5.7 保持 `opp-admin-vue/src/views/learnManagement/activity/list.vue` 列表页无新增人群包列。
- [x] 5.8 更新 `opp-admin-vue/src/api/learnActivity.ts` 的请求和响应类型，包含 `launchCrowdNos`、`attendCrowdNos`、`launchCrowdNoList`、`attendCrowdNoList`。

## 6. 验证

- [ ] 6.1 添加或更新后端单元测试：详情接口编码到 `CrowdDTO` 名称回显、名称缺失降级、非适用范围走旧逻辑、空配置默认开放、员工直接通过。
- [ ] 6.2 添加或更新后端单元测试：`authActivity` 使用 `attendCrowdNos`，`launchAuthActivity` 使用 `launchCrowdNos`，登录非员工命中、未命中和会员中心失败关闭。
- [ ] 6.3 在 `opp-learn` 中运行最小相关 Maven 测试。
- [x] 6.4 在 `opp-admin-vue/src/views/learnManagement/activity/hooks/useCheckInLearningDetail.spec.ts` 中为人群包选择、编辑回显和保存编码转换添加或更新前端单元测试。
- [x] 6.5 在 `opp-admin-vue` 中运行最小相关前端验证，例如 `npm run lint` 或目标单元测试。
- [ ] 6.6 手动验证 `learnManagement/activity` 创建、编辑、详情回显、APP 参与资格、APP 发起资格，以及列表页无新增人群包列。
