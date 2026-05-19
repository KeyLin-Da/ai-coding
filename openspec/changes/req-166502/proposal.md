## Why

需求 166502 需要统一极友料微页在 APP 与营销助手小程序中的跳转和复制口径。当前后台列表只能直接复制单端 APP 路径，logo 导航组件也只有单一“跳转页面”配置，无法分别维护双端跳转，历史 UTM 字段还暴露在编辑 UI 中。

## What Changes

- 在 `opp-admin-news-vue` 的事业机会-微页管理、素材分类-微页管理列表中，将“复制链接/复制路径”改为打开“复制路径”弹窗。
- 弹窗展示 APP 与营销助手小程序两条只读路径，并分别支持复制成功/失败提示。
- 改造极友料微页编辑器 `navigation` logo 导航组件，将单一跳转改为“APP跳转链接”和“营销助手小程序跳转链接”，两者均非必填。
- 营销助手小程序跳转选择器隐藏“在无限极App中打开方式”，并不展示“极快测”应用。
- 移除 logo 导航组件 UI 中的 `utm_midium`、`utm_term`、`utm_content` 配置。
- 在 `opp-diy` 兼容保存和回显 `jumpLinks.app`、`jumpLinks.mka`，并支持历史数据迁移与校验。

## Capabilities

### New Capabilities

- `admin-micro-page-copy-path`: 后台微页管理列表双端路径展示与复制，覆盖事业机会和素材分类微页。
- `micro-page-logo-navigation-links`: logo 导航组件双端跳转配置、保存回显、历史迁移与营销助手路径映射。

### Modified Capabilities

- 无。

## Non-goals

- 不调整微页列表的筛选、上下架、删除等无关能力。
- 不重构 `opp-diy` 微页模板表结构，双端跳转继续存放在现有 JSON 字段中。
- 不改造 APP 或营销助手小程序端页面实现，只约定后台生成和保存的路径。

## Impact

- 前端：`opp-admin-news-vue` 的 `topicAdminDir1/microManagement.vue`、`topicAdminDir2/microManagement.vue`、`onlineOperation/micropageConfig.vue` 复制路径体验，以及 `components/micro/microEditor/components/attributeModules/navigation.vue`、`jump-link-model.vue`。
- 后端：`opp-diy` 微页配置保存、详情回显、`mini_page_template.img_url` JSON 兼容处理和历史迁移脚本。
- 数据：历史 logo 导航跳转需迁移到 `jumpLinks.app`，并按映射规则生成 `jumpLinks.mka`。

## Success Criteria

- 三个后台微页管理入口均可复制 APP 与营销助手小程序路径，并有成功/失败反馈。
- logo 导航组件支持双端跳转独立配置、仅配置单端也可保存，历史数据可正常回显。
- 迁移后已知 APP 路径能生成正确营销助手路径，未知路径不生成错误配置。
