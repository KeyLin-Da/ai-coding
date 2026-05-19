## 1. 微页列表复制路径弹窗

- [ ] 1.1 在 `opp-admin-news-vue/src/views/onlineOperation/micropageConfig.vue` 补齐复制失败提示，确保 APP 与营销助手小程序路径复制均反馈“复制路径成功/失败”。
- [ ] 1.2 在 `opp-admin-news-vue/src/views/topicAdminDir1/microManagement.vue` 新增“复制路径”弹窗状态、模板和复制方法，路径规则覆盖 APP 与营销助手小程序。
- [ ] 1.3 在 `opp-admin-news-vue/src/views/topicAdminDir1/microManagement.vue` 将父级微页的“复制链接”操作改为打开弹窗，并保留现有复制任务 CODE 行为。
- [ ] 1.4 在 `opp-admin-news-vue/src/views/topicAdminDir2/microManagement.vue` 新增与事业机会一致的“复制路径”弹窗、路径生成和复制反馈。
- [ ] 1.5 手工验证社群微页配置、事业机会-微页管理、素材分类-微页管理三个入口的 APP 与营销助手小程序路径展示、复制成功、复制失败和关闭弹窗行为。

## 2. logo 导航前端双端跳转配置

- [ ] 2.1 在 `opp-admin-news-vue/src/components/PageDesigner/components/comp-dispose/components/jump-link-model.vue` 增加营销助手跳转上下文参数，支持隐藏“在无限极App中打开方式”并过滤“极快测”应用。
- [ ] 2.2 在 `opp-admin-news-vue/src/components/micro/microEditor/components/attributeModules/navigation.vue` 将样式一单图的“跳转页面”改为“APP跳转链接”和“营销助手小程序跳转链接”两块展示。
- [ ] 2.3 在 `opp-admin-news-vue/src/components/micro/microEditor/components/attributeModules/navigation.vue` 将样式二每个导航项的“跳转页面”改为双端跳转配置，并按当前项回显已选应用与页面地址。
- [ ] 2.4 在 `navigation.vue` 中新增当前编辑端和当前图片下标状态，弹窗提交时分别写入 `jumpLinks.app` 或 `jumpLinks.mka`。
- [ ] 2.5 在 `navigation.vue` 中保存 APP 跳转时同步旧字段 `jumpUrl`、`jumpType`、`appName`、`appId`、`originalAppId`、`wxjAppOpenMethod`、`commonLink`，保持现有消费链路兼容。
- [ ] 2.6 在 `navigation.vue` 中移除 `utm_midium`、`utm_term`、`utm_content` 的可见表单项，并清理不再使用的事件、数据和导入。
- [ ] 2.7 在 `opp-admin-news-vue/src/components/micro/microEditor/validate.js` 调整 `navigation` 校验：保留图片必填相关校验，移除跳转链接必填限制。

## 3. opp-diy 双端跳转兼容处理

- [ ] 3.1 在 `opp-diy/src/main/java/com/infinitus/opp/diy/servicee/impl/MiniPageConfigServiceImpl.java` 为 logo 导航补充 `jumpLinks` 解析、旧字段转 `CommonLinkVO`、`CommonLinkVO` 转旧字段的辅助方法。
- [ ] 3.2 更新 `MiniPageConfigServiceImpl#getLogTypeTemplateData`：已存在 `jumpLinks` 时保留双端数据，缺失时从旧 `commonLink/jumpUrl` 派生 `jumpLinks.app`。
- [ ] 3.3 确认 `MiniPageConfigServiceImpl#save` 和相关模板保存流程不丢失 `jumpLinks` JSON；必要时补充保存前兼容处理。
- [ ] 3.4 为 logo 导航 JSON 解析异常增加包含 `configId/templateId/type` 的日志，并确保异常项不阻断其它模板回显。
- [ ] 3.5 验证 `MiniPageTemplateServiceImpl#processTemplateResponseList` 在后台回显和小程序查询场景下仍能正确处理 `LOG` 类型模板。

## 4. 历史数据迁移与回滚

- [ ] 4.1 基于 `coding/prd/166502/files/166502.sql` 梳理正式迁移 SQL，限定 `mini_page_template.type = 'navigation'` 且 `img_url` 为合法 JSON。
- [ ] 4.2 迁移 SQL 必须先备份 `mini_page_template`，并仅处理缺失 `jumpLinks` 的图片项，避免覆盖新编辑数据。
- [ ] 4.3 在迁移 SQL 中实现旧跳转到 `jumpLinks.app` 的复制和历史 UTM 参数拼接，兼容已有 query 参数。
- [ ] 4.4 在迁移 SQL 或配套脚本中实现五类 APP 路径到营销助手路径的映射，参数缺失或未知路径时保持 `jumpLinks.mka` 为空。
- [ ] 4.5 编写迁移校验 SQL：总量、按 `JSON_LENGTH(img_url)` 分组、已生成 `jumpLinks` 数量、映射成功数量、仍缺失 `jumpLinks` 且存在旧跳转的记录。
- [ ] 4.6 编写回滚 SQL，支持按备份表主键恢复 `img_url` 和 `updated_time`，并说明如何避开迁移后用户新编辑记录。

## 5. 自动化测试

- [ ] 5.1 为 `jump-link-model.vue` 增加或更新前端测试，覆盖营销助手上下文下隐藏 APP 打开方式和过滤“极快测”。
- [ ] 5.2 为 `navigation.vue` 增加或更新前端测试，覆盖样式一、样式二、仅 APP、仅营销助手、两端均空和旧字段同步。
- [ ] 5.3 为 `microEditor/validate.js` 增加或更新测试，覆盖 logo 导航缺少跳转链接仍可通过、缺少图片仍失败。
- [ ] 5.4 为 `MiniPageConfigServiceImpl#getLogTypeTemplateData` 增加后端单元测试，覆盖旧数据派生 APP、保留双端数据、非法 JSON 降级和营销助手数据不覆盖旧单端字段。
- [ ] 5.5 为历史路径映射工具或迁移脚本准备样例用例，覆盖五类成功映射、参数缺失、未知路径、已有 query 和已有 `jumpLinks` 不覆盖。

## 6. 验证与发布准备

- [ ] 6.1 在 `opp-admin-news-vue` 运行最小相关前端验证，例如 `npm run lint:nofix` 或目标单元测试命令。
- [ ] 6.2 在 `opp-diy` 运行最小相关 Maven 测试，例如 `mvn test` 或指定测试类。
- [ ] 6.3 手工验证微页编辑器新增、编辑、保存、重新打开、样式切换和双端跳转回显。
- [ ] 6.4 手工验证历史数据迁移前后的后台回显、APP 旧字段兼容、小程序侧读取不报错。
- [ ] 6.5 整理上线说明，包含前后端发布顺序、迁移执行窗口、校验 SQL、回滚 SQL 和遗留待确认项。
