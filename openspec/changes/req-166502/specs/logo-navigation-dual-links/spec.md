## ADDED Requirements

### Requirement: logo导航支持双端跳转配置
系统必须在 `logo导航` 组件中为每个导航图片项提供「APP跳转链接」和「营销助手小程序跳转链接」两套配置，且两套配置均为非必填。

#### Scenario: 样式一展示双端配置
- **WHEN** 用户编辑样式一的 `logo导航` 组件
- **THEN** 系统必须针对唯一图片项展示 APP 跳转链接和营销助手小程序跳转链接配置入口

#### Scenario: 样式二展示双端配置
- **WHEN** 用户编辑样式二的 `logo导航` 组件
- **THEN** 系统必须针对每个导航图片项展示 APP 跳转链接和营销助手小程序跳转链接配置入口

#### Scenario: 两端均为空也允许保存
- **WHEN** 用户未配置任一跳转链接但其它必填内容有效
- **THEN** 系统必须允许保存 `logo导航` 组件

#### Scenario: 仅配置一端
- **WHEN** 用户仅配置 APP 或仅配置营销助手小程序跳转链接
- **THEN** 系统必须保存已配置端并保留另一端为空

### Requirement: APP跳转链接使用完整跳转选择能力
系统必须在用户配置 APP 跳转链接时提供现有跳转选择能力，包括跳转方式、小程序应用、跳转页面地址和无限极 APP 内打开方式。

#### Scenario: 打开 APP 跳转选择弹窗
- **WHEN** 用户点击 APP 跳转链接的「请选择跳转到的页面」
- **THEN** 系统必须打开「选择链接跳转页面」弹窗并展示完整跳转选项

#### Scenario: 回填 APP 跳转
- **WHEN** 用户在 APP 跳转选择弹窗中保存有效配置
- **THEN** 系统必须将配置回填到该导航项的 APP 跳转链接区域

### Requirement: 营销助手小程序跳转选择受限
系统必须在用户配置营销助手小程序跳转链接时过滤「极快测」应用，并隐藏「在无限极App中打开方式」。

#### Scenario: 过滤极快测
- **WHEN** 用户打开营销助手小程序跳转选择弹窗
- **THEN** 跳转小程序应用下拉项中不得展示「极快测」

#### Scenario: 隐藏无限极App打开方式
- **WHEN** 用户打开营销助手小程序跳转选择弹窗且跳转方式为公司内部小程序
- **THEN** 系统不得展示「在无限极App中打开方式」选项

#### Scenario: 回填营销助手小程序跳转
- **WHEN** 用户在营销助手小程序跳转选择弹窗中保存有效配置
- **THEN** 系统必须将配置回填到该导航项的营销助手小程序跳转链接区域

### Requirement: logo导航不再展示 UTM 配置项
系统必须从 `logo导航` 组件编辑 UI 中移除 `utm_midium`、`utm_term`、`utm_content` 配置项。

#### Scenario: 新增组件不展示 UTM
- **WHEN** 用户新增 `logo导航` 组件
- **THEN** 系统不得展示 `utm_midium`、`utm_term`、`utm_content` 配置项

#### Scenario: 编辑历史组件不展示 UTM
- **WHEN** 用户编辑存在历史 UTM 数据的 `logo导航` 组件
- **THEN** 系统不得展示 UTM 配置项，且不得因字段存在导致回显或保存失败

### Requirement: 保存双端跳转结构并保留 commonLink
系统必须在每个导航图片项下保存 `jumpLinks.app` 与 `jumpLinks.mka`，并必须保留 `commonLink` 作为 APP 跳转配置的兼容镜像。

#### Scenario: 保存双端配置
- **WHEN** 用户为同一导航图片项配置 APP 与营销助手小程序跳转并保存
- **THEN** 系统必须保存 `jumpLinks.app`、`jumpLinks.mka` 和指向 APP 配置的 `commonLink`

#### Scenario: 回显双端配置
- **WHEN** 用户再次打开已保存双端配置的 `logo导航` 组件
- **THEN** 系统必须分别回显 APP 跳转链接和营销助手小程序跳转链接

#### Scenario: 其它平台读取 commonLink
- **WHEN** 其它平台读取导航图片项的 `commonLink`
- **THEN** `commonLink` 必须仍表示 APP 跳转配置

### Requirement: 历史单跳转迁移为 APP 跳转
系统必须将历史 `logo导航` 单一跳转配置迁移为 `jumpLinks.app`，并按 PRD 使用真实历史 UTM 字段拼接到 APP 跳转地址。

#### Scenario: 迁移历史 commonLink
- **WHEN** 历史导航图片项存在 `commonLink` 且不存在 `jumpLinks`
- **THEN** 系统必须将 `commonLink` 迁移为 `jumpLinks.app` 并保留 `commonLink`

#### Scenario: 拼接历史 UTM
- **WHEN** 历史导航图片项存在 APP 跳转地址和 UTM 字段
- **THEN** 系统必须将真实历史 UTM 参数拼接到 `jumpLinks.app.jumpUrl`

#### Scenario: 不硬编码 UTM
- **WHEN** 执行历史迁移
- **THEN** 系统不得使用固定 UTM 值替代历史记录中的真实 UTM 字段

#### Scenario: APP 跳转地址为空
- **WHEN** 历史导航图片项没有跳转地址
- **THEN** 系统不得拼接 UTM，且不得生成无效 APP 跳转地址

### Requirement: 按规则生成营销助手小程序跳转
系统必须根据 APP 跳转配置生成历史数据的 `jumpLinks.mka`，并在无法安全映射时置空营销助手配置。

#### Scenario: 维持一致的配置
- **WHEN** APP 跳转为外部小程序、外部 H5、或内部小程序且应用为营销助手/商城/新平衡生活+
- **THEN** 系统必须将完整跳转配置复制为 `jumpLinks.mka`

#### Scenario: 映射极友料或极易学页面
- **WHEN** APP 跳转为极友料或极易学内部小程序且页面地址匹配 PRD 映射表
- **THEN** 系统必须生成对应营销助手页面地址

#### Scenario: 无法映射
- **WHEN** APP 跳转为极友料或极易学内部小程序但页面地址不匹配 PRD 映射表
- **THEN** 系统必须将 `jumpLinks.mka` 置空，并保留 `jumpLinks.app`

#### Scenario: 参数缺失
- **WHEN** APP 页面地址匹配映射路径但缺少 `categoryId`、`configId` 或 `id` 参数
- **THEN** 系统必须将 `jumpLinks.mka` 置空，并不得生成错误地址

### Requirement: 历史迁移可校验和回滚
系统必须为 `mini_page_template.img_url` 历史 JSON 迁移提供备份、迁移结果校验和回滚能力。

#### Scenario: 迁移前备份
- **WHEN** 执行历史迁移脚本前
- **THEN** 系统必须创建 `mini_page_template` 的备份表或等效备份

#### Scenario: 跳过非法 JSON
- **WHEN** 历史记录的 `img_url` 不是合法 JSON 数组
- **THEN** 迁移脚本必须跳过该记录且不得中断整批迁移

#### Scenario: 校验遗漏记录
- **WHEN** 迁移完成后
- **THEN** 系统必须能查询仍缺失 `jumpLinks` 且存在历史跳转配置的记录

#### Scenario: 回滚异常记录
- **WHEN** 迁移结果异常且需要回滚
- **THEN** 系统必须能按主键从备份恢复 `img_url` 和 `updated_time`
