## ADDED Requirements

### Requirement: 管理员可以配置发起人人群包

系统 SHALL 允许管理员仅为极易学组队学习活动配置一个或多个人群包作为发起人权限范围。

#### Scenario: 选择发起人人群包

- **WHEN** 管理员在极易学组队学习创建或编辑表单中选择多个发起人人群包
- **THEN** 系统必须显示所选人群包名称，并在保存活动时提交对应的人群包编码

#### Scenario: 发起人人群包仅适用于组队学习

- **WHEN** 活动类型不是组队学习
- **THEN** 系统不得要求配置发起人人群包，也不得返回发起人人群包列表

#### Scenario: 未选择发起人人群包

- **WHEN** 管理员保存未选择发起人人群包的极易学组队学习活动
- **THEN** 系统必须将发起权限视为默认开放给所有登录用户

### Requirement: 管理员可以配置参与人人群包

系统 SHALL 允许管理员为适用的极易学活动配置一个或多个人群包作为参与人权限范围。

#### Scenario: 选择参与人人群包

- **WHEN** 管理员在极易学活动创建或编辑表单中选择多个参与人人群包
- **THEN** 系统必须显示所选人群包名称，并在保存活动时提交对应的人群包编码

#### Scenario: 参与人人群包适用于打卡学习和组队学习

- **WHEN** 活动类型为打卡学习或组队学习
- **THEN** 系统必须支持保存和回显参与人人群包配置

#### Scenario: 未选择参与人人群包

- **WHEN** 管理员保存未选择参与人人群包的极易学活动
- **THEN** 系统必须将参与权限视为默认开放给所有登录用户

### Requirement: 人群包编码必须持久化在活动表

系统在创建或更新活动时 SHALL 仅持久化人群包编码，不得在活动表中持久化人群包名称。

#### Scenario: 保存人群包编码

- **WHEN** 管理员保存包含发起人或参与人人群包的活动
- **THEN** 系统必须将发起人人群包编码保存到 `launch_crowd_nos`，将参与人人群包编码保存到 `attend_crowd_nos`

#### Scenario: 更新人群包编码

- **WHEN** 管理员编辑活动并更改所选人群包
- **THEN** 系统必须使用新的人群包编码替换原有 `launch_crowd_nos` 或 `attend_crowd_nos`

### Requirement: 活动详情必须返回人群包名称列表

系统 SHALL 在活动详情中统一返回已保存人群包编码对应的名称，供后台编辑页直接回显。

#### Scenario: 返回发起人人群包列表

- **WHEN** 极易学组队学习活动存在 `launch_crowd_nos`
- **THEN** 活动详情必须返回 `launchCrowdNoList`，且列表元素必须包含 `code` 和 `name`

#### Scenario: 返回参与人人群包列表

- **WHEN** 极易学活动存在 `attend_crowd_nos`
- **THEN** 活动详情必须返回 `attendCrowdNoList`，且列表元素必须包含 `code` 和 `name`

#### Scenario: 人群包名称缺失

- **WHEN** 会员中心无法返回某个已保存人群包编码对应的名称
- **THEN** 活动详情必须保留该编码并提供可显示的降级名称，避免后台编辑页丢失选择

### Requirement: 人群包名称必须由接口统一解析

系统 SHALL 由 `opp-learn` 使用会员中心分页人群包接口解析人群包名称，而不是要求后台编辑页自行解析。

#### Scenario: 按编码查询人群包名称

- **WHEN** 活动详情需要回显人群包名称
- **THEN** 系统必须使用 `getMemberAllCrowdListByPage` 按 `crowdNos` 查询，并将 `crowdNo` 和 `crowdName` 映射为 `CrowdDTO.code` 和 `CrowdDTO.name`

#### Scenario: 后台编辑页回显人群包

- **WHEN** 后台编辑页加载活动详情
- **THEN** 后台必须直接使用 `launchCrowdNoList` 和 `attendCrowdNoList` 展示已选人群包名称

### Requirement: 列表页不得展示人群包列

系统 SHALL 保持组队学习列表页现有展示逻辑，不新增发起人或参与人人群包列。

#### Scenario: 查看组队学习列表

- **WHEN** 管理员进入组队学习列表页
- **THEN** 系统必须展示现有列表字段，且不得额外展示发起人或参与人人群包信息列

### Requirement: APP 参与资格必须使用参与人人群包

系统 SHALL 在 APP 参与资格接口中使用参与人人群包配置进行权限判断。

#### Scenario: 调用参与资格接口

- **WHEN** APP 调用 `/api/v2/activityInfo/authActivity` 检查活动参与资格
- **THEN** 系统必须使用该活动的 `attend_crowd_nos` 判断当前用户是否具备参与权限

#### Scenario: 用户命中参与人人群包

- **WHEN** 当前登录非员工用户命中 `attend_crowd_nos` 中任一人群包
- **THEN** 系统必须授予参与权限

#### Scenario: 用户未命中参与人人群包

- **WHEN** 当前登录非员工用户未命中 `attend_crowd_nos` 中任何人群包
- **THEN** 系统必须拒绝参与权限

### Requirement: APP 发起资格必须使用发起人人群包

系统 SHALL 在 APP 发起资格接口中使用发起人人群包配置进行权限判断。

#### Scenario: 调用发起资格接口

- **WHEN** APP 调用 `/api/v2/activityInfo/launchAuthActivity` 检查活动发起资格
- **THEN** 系统必须使用该活动的 `launch_crowd_nos` 判断当前用户是否具备发起权限

#### Scenario: 用户命中发起人人群包

- **WHEN** 当前登录非员工用户命中 `launch_crowd_nos` 中任一人群包
- **THEN** 系统必须授予发起权限

#### Scenario: 用户未命中发起人人群包

- **WHEN** 当前登录非员工用户未命中 `launch_crowd_nos` 中任何人群包
- **THEN** 系统必须拒绝发起权限

### Requirement: 员工必须保留直接通过行为

系统 SHALL 保留现有员工身份权限行为，员工不受活动人群包配置限制。

#### Scenario: 员工检查参与资格

- **WHEN** 员工用户检查活动参与资格
- **THEN** 系统必须授予参与权限

#### Scenario: 员工检查发起资格

- **WHEN** 员工用户检查活动发起资格
- **THEN** 系统必须授予发起权限

### Requirement: 非适用范围必须保留旧权限逻辑

系统 SHALL 仅在适用的人群包权限场景中使用新字段；其他场景必须保留旧权限逻辑。

#### Scenario: 非极易学活动

- **WHEN** 非极易学活动检查发起或参与权限
- **THEN** 系统必须继续使用原有权限逻辑，而不是读取人群包编码

#### Scenario: 兼容历史活动

- **WHEN** 历史活动没有人群包编码配置
- **THEN** 系统必须采用兼容的默认或遗留权限行为，而不是阻止所有用户

### Requirement: 会员中心异常必须失败关闭

系统在配置了人群包但无法完成会员中心命中判断时 MUST 拒绝权限，并暴露可排查信息。

#### Scenario: 人群命中接口失败

- **WHEN** 登录非员工用户检查配置了人群包的活动权限且会员中心接口失败
- **THEN** 系统必须拒绝该权限并记录活动、人群包和用户相关的错误信息
