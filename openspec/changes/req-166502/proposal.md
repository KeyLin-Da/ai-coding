## Why

OPP 后台极友料微页当前只支持单一跳转配置和单路径复制，无法同时满足 APP 与营销助手小程序的投放使用。需求 166502 需要让后台配置、历史数据和其它平台消费方在同一数据结构下兼容演进，避免改造后影响仍依赖 `commonLink` 的链路。

## What Changes

- 在事业机会-微页管理中，将操作栏复制入口调整为「复制路径」弹窗，展示 APP 与营销助手小程序两条只读路径，并支持复制成功/失败反馈。
- 在极友料微页编辑器的 `logo导航` 组件中，将原「跳转页面」改为「APP跳转链接」和「营销助手小程序跳转链接」，两者均非必填。
- 营销助手跳转选择弹窗通过参数过滤「极快测」，并隐藏「在无限极App中打开方式」；APP 跳转不受该过滤影响。
- 去除 `logo导航` 组件 UI 中的 `utm_midium`、`utm_term`、`utm_content` 配置入口。
- 历史单跳转数据迁移为 `jumpLinks.app`，按 PRD 读取真实历史 UTM 字段拼接到 APP 跳转地址；按映射规则生成 `jumpLinks.mka`。
- 保留并维护 `commonLink`，使其镜像 APP 跳转配置，供其它平台继续消费。

## Capabilities

### New Capabilities
- `micro-page-copy-paths`: 事业机会微页管理复制路径弹窗、双端路径展示与复制反馈。
- `logo-navigation-dual-links`: logo 导航组件双端跳转配置、历史数据迁移、营销助手映射与 `commonLink` 兼容。

### Modified Capabilities

- 无。当前仓库未发现已有 OpenSpec 主规格可复用，本次以新 capability 承接。

## Non-goals

- 不改造非 PRD 覆盖的微页组件跳转能力。
- 不删除 `commonLink` 或强制其它平台切换到 `jumpLinks`。
- 不改变微页发布、上下架、分类、主题绑定等既有业务规则。

## Impact

- 前端：`opp-admin-news-vue`，主要涉及 Vue 2 Options API 的 `topicAdminDir1/microManagement.vue`、`components/micro/microEditor/components/attributeModules/navigation.vue`、`jump-link-model.vue` 与相关校验。
- 后端：`opp-diy` 与 `opp-api/opp-diy-api`，主要涉及 `MiniPageConfigServiceImpl`、`MiniPageTemplateServiceImpl` 的 `navigation` 链接兼容处理。
- 数据：`mini_page_template.img_url` 历史 JSON 迁移，需备份、校验与可回滚 SQL。

## Success Criteria

- 事业机会微页列表可复制 APP 与营销助手小程序路径，并给出明确 Toast。
- `logo导航` 新增、编辑、回显、保存均支持 `jumpLinks.app/mka`，且两个跳转均可为空。
- 历史数据迁移后 APP 跳转保留原配置与真实历史 UTM，营销助手跳转按 PRD 映射或置空。
- `commonLink` 在保存、回显、缓存处理后仍可用且指向 APP 跳转配置。
