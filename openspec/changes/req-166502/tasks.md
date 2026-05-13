## 1. 事业机会复制路径前端

- [ ] 1.1 在 `opp-admin-news-vue/src/views/topicAdminDir1/microManagement.vue` 将父级微页「复制链接」入口改为打开「复制路径」弹窗，并保留原操作栏权限/展示条件。
- [ ] 1.2 参考 `opp-admin-news-vue/src/views/onlineOperation/micropageConfig.vue` 增加 APP 与营销助手小程序两行只读路径展示，路径分别为 `/packages/mixHome/pages/microPage/index?configId=<id>` 和 `/pages/groupOperation/microPage?configId=<id>`。
- [ ] 1.3 为复制路径按钮增加成功与失败反馈，空 ID 时阻止复制或提示不可复制，关闭弹窗后不重置列表筛选状态。

## 2. logo导航双端配置前端

- [ ] 2.1 在 `opp-admin-news-vue/src/components/micro/microEditor/components/attributeModules/navigation.vue` 将样式一和样式二的单一「跳转页面」改为「APP跳转链接」与「营销助手小程序跳转链接」两套入口。
- [ ] 2.2 从 `navigation.vue` 中移除 `utm_midium`、`utm_term`、`utm_content` 的 UI 展示与新增编辑入口，保留历史字段容错读取，不因存在历史 UTM 字段导致报错。
- [ ] 2.3 在 `navigation.vue` 中维护每个 `imgUrl[n].jumpLinks.app`、`imgUrl[n].jumpLinks.mka`，保存 APP 配置时同步 `commonLink = jumpLinks.app`。
- [ ] 2.4 修改 `opp-admin-news-vue/src/components/PageDesigner/components/comp-dispose/components/jump-link-model.vue`，支持通过入参过滤小程序应用列表；营销助手入口过滤「极快测」并隐藏「在无限极App中打开方式」。
- [ ] 2.5 调整 `opp-admin-news-vue/src/components/micro/microEditor/validate.js` 的 `navigation` 校验，允许 APP 和营销助手跳转均为空，但继续校验图片等其它必要内容。
- [ ] 2.6 验证新增、编辑、样式切换、添加/删除导航项时，`jumpLinks` 与 `commonLink` 不丢失且可正确回显。

## 3. 后端跳转兼容与映射

- [ ] 3.1 在 `opp-api/opp-diy-api` 增加或复用跳转结构常量/VO 表达 `jumpLinks.app`、`jumpLinks.mka`，保持 `CommonLinkVO` 字段完整。
- [ ] 3.2 在 `opp-diy/src/main/java/com/infinitus/opp/diy/servicee/impl/MiniPageConfigServiceImpl.java` 的 `navigation` 处理逻辑中兼容旧数据：无 `jumpLinks` 时由旧字段或 `commonLink` 生成 `jumpLinks.app`。
- [ ] 3.3 在保存、回显、缓存构建路径中统一维护 `commonLink = jumpLinks.app`，确保其它平台读取 `commonLink` 时仍得到 APP 跳转配置。
- [ ] 3.4 实现营销助手页面映射工具：支持社群运营、微页、话题详情、素材视频详情、素材图文详情五类 PRD 映射，参数缺失或路径不匹配时返回空。
- [ ] 3.5 实现历史数据生成 `jumpLinks.mka` 的规则：外部小程序/外部 H5/营销助手/商城/新平衡生活+完整维持一致，极友料/极易学按映射表转换或置空。
- [ ] 3.6 对 JSON 解析异常、单个导航项异常和未知字典值增加容错与日志，避免整页保存或回显失败。

## 4. 历史数据迁移脚本

- [ ] 4.1 基于 `coding/prd/166502/files/166502.sql` 重写最终迁移 SQL，限定 `type = 'navigation'`、`img_url` 合法 JSON 数组且未迁移的记录。
- [ ] 4.2 迁移脚本必须从真实历史 `utm_medium`、`utm_term`、`utm_content` 及兼容拼写读取 UTM 值，不使用固定硬编码 UTM。
- [ ] 4.3 对每个数组项写入 `jumpLinks.app`、`jumpLinks.mka`，并同步或保留 `commonLink` 为 APP 配置。
- [ ] 4.4 提供迁移前备份 SQL、迁移后数量统计、按 `JSON_LENGTH(img_url)` 分布统计、抽样校验和遗漏记录查询 SQL。
- [ ] 4.5 提供按主键从备份表恢复 `img_url` 与 `updated_time` 的回滚 SQL，并注明避免覆盖迁移后新编辑数据的执行条件。

## 5. 验证与回归

- [ ] 5.1 在 `opp-admin-news-vue` 执行相关 lint 或最小可行构建命令，至少覆盖修改的 Vue 2 组件语法。
- [ ] 5.2 在 `opp-diy` 执行 `mvn test` 或针对修改类的最小 Maven 测试/编译命令。
- [ ] 5.3 手工验证事业机会微页管理复制路径弹窗：APP 路径、营销助手路径、复制成功、复制失败和关闭行为。
- [ ] 5.4 手工验证 `logo导航` 样式一与样式二：双端配置、仅配置一端、两端为空、营销助手过滤极快测、隐藏 APP 打开方式、保存后回显。
- [ ] 5.5 通过样例历史 JSON 验证迁移规则：APP UTM 拼接、营销助手映射成功、映射失败置空、`commonLink` 保持 APP 配置。
- [ ] 5.6 检查现有依赖 `commonLink` 的小程序或其它平台路径未被破坏，必要时抽取已发布微页缓存数据对比。
