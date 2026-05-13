## Ad\xc Requirements

### REQ-001: 活动列表查询

**Given** 用户进入组队学习活动管理页面  
**When** 页面加载完成  
**Then** 系统显示活动列表，**So that** 用户可以查看和搜索活动

#### API
```
GET /admin/api/v2/activityInfo/getActivityListVoPage?current=0&size=10&version=2&activityName=xxx&activityStatus=xxx&terminalType=xxx&channelType=xxx
```

#### Response
```json
{
  "code": 200,
  "data": {
    "records": [
      {
        "id": "2021102917000026",
        "activityName": "组队学习活动名称",
        "channelType": 2,
        "activityStatus": "1",
        "groundStartTime": "2024-01-01 00:00:00",
        "groundEndTime": "2024-12-31 23:59:59",
        "taskStartTime": "2024-01-01 00:00:00",
        "taskEndTime": "2024-12-31 23:59:59",
        "process": "10/30",
        "onlineAttentNums": 100,
        "type": "0",
        "createUser": "admin",
        "createTime": "2024-01-01 10:00:00",
        "showRanking": true,
        "isShowToUser": true
      }
    ],
    "total": 100
  }
}
```

#### New Fields
| 字段 | 类型 | 说明 |
|------|------|------|
| showRanking | boolean | 是否展示排行榜 |

---

### REQ-002: 创建活动

**Given** 用户点击"新建打卡学习"按钮  
**When** 用户填写活动信息并提交  
**Then** 系统创建活动记录
**So that** 用户可以继续配置活动详情

#### Request
```json
{
  "type": "1",
  "activityName": "活动名称",
  "promotionalImageUrl": "https://xxx.com/image.png",
  "content": "报名页面介绍内容",
  "groundStartTime": "2024-01-01 00:00:00",
  "groundEndTime": "2024-12-31 23:59:59",
  "taskStartTime": "2024-01-01 00:00:00",
  "taskEndTime": "2024-12-31 23:59:59",
  "repairFlag": true,
  "attentRange": "1",
  "onlineUnlockType": "1",
  "onlineUnlockTime": "2024-01-01",
  "invitePoints": 100,
  "showRanking": true,
  "activityCategory": "",
  "isShowToUser": true,
  "terminalType": "1",
  "channelType": "2"
}
```

#### Validation Rules
| 字段 | 规则 | 说明 |
|------|------|------|
| activityName | 必填， 最大 50 字符 | 活动名称 |
| groundStartTime | 必填 | 上架开始时间 |
| groundEndTime | 必填 | 上架结束时间 |
| invitePoints | 选填， 最大 99999 | 邀请积分， 改为选填 |
| showRanking | 选填， 默认 true | 是否展示排行榜 |
| activityCategory | 选填 | 活动分类 |

---

### REQ-003: 活动详情查询

**Given** 用户点击活动列表中的"编辑"按钮  
**When** 系统查询活动详情  
**Then** 显示活动编辑表单
**So that** 用户可以修改活动信息

#### API
```
GET /admin/api/v2/activityInfo/getActivityDetail?activityId=xxx
```

#### Response
```json
{
  "code": 200,
  "data": {
    "id": "2021102917000026",
    "activityName": "组队学习活动名称",
    "type": "1",
    "promotionalImageUrl": "https://xxx.com/image.png",
    "content": "报名页面介绍内容",
    "activityDesc": "内容介绍",
    "groundStartTime": "2024-01-01 00:00:00",
    "groundEndTime": "2024-12-31 23:59:59",
    "taskStartTime": "2024-01-01 00:00:00",
    "taskEndTime": "2024-12-31 23:59:59",
    "repairFlag": "1",
    "attentRange": "1",
    "onlineUnlockType": "1",
    "onlineUnlockTime": "2024-01-01",
    "invitePoints": 100,
    "showRanking": true,
    "activityCategory": "",
    "activityCalendarList": [
      {
        "id": "calendar_001",
        "theme": "任务主题",
        "taskName": "学习任务一",
        "taskType": "study",
        "buttonText": "去学习",
        "unlockDate": "2024-01-15",
        "displayDate": "2024-01-15",
        "examId": null,
        "surveyId": null,
        "homeworkList": []
      }
    ],
    "courseCertificateEntity": {
      "name": "完成证书"
    },
    "terminalType": "1",
    "channelType": "2",
    "isShowToUser": true,
    "isShowInHotRecommend": false
  }
}
```

---

### REQ-004: 更新活动

**Given** 用户修改活动信息并保存  
**When** 系统更新活动记录  
**Then** 显示更新成功提示
**So that** 用户可以看到修改后的活动

#### API
```
POST /admin/api/v2/activityInfo/updateActivity
Content-Type: application/json

{
  "id": "2021102917000026",
  "activityName": "更新后的活动名称",
  "showRanking": false,
  "invitePoints": 0,
  "activityCalendarList": [...]
}
```

---

### REQ-005: 活动上架

**Given** 用户点击"上架"按钮  
**When** 活动状态为已下架  
**Then** 系统上架活动
**So that** 活动在 APP 端可见

#### API
```
POST /admin/api/v2/activityInfo/shelfActivitySample?activityId=xxx
```

---

### REQ-006: 活动下架

**Given** 用户点击"下架"按钮  
**When** 活动状态为已上架  
**Then** 系统下架活动
**So that** 活动在 APP 端不可见

#### API
```
POST /admin/api/v2/activityInfo/downActivitySample?activityId=xxx
```

---

### REQ-007: 活动删除

**Given** 用户点击"删除"按钮  
**When** 活动状态为已下架  
**Then** 系统删除活动记录
**So that** 用户不再看到该活动

#### API
```
POST /admin/api/v2/activityInfo/deleteActivityRecords?id=xxx
```

---

### REQ-008: 获取分享信息

**Given** 用户点击"分享"按钮  
**When** 活动状态为已上架或进行中  
**Then** 系统返回分享二维码和链接
**So that** 用户可以分享活动

#### API
```
GET /admin/api/v2/activityInfo/share/{id}
```

#### Response
```json
{
  "code": 200,
  "data": {
    "activityName": "活动名称",
    "activityLink": "https://xxx.com/activity/xxx",
    "activityQRCode": "https://xxx.com/qrcode/xxx.png"
  }
}
```

---

## Modified Requirements

### REQ-MOD-001: 邀请积分改为选填

**Original**: `invitePoints` 为必填字段  
**Modified**: `invitePoints` 改为选填字段

**Behavior Change**:
- 前端：积分输入框移除必填标识
- 后端：移除 `invitePoints` 必填校验
- 默认值：null
- 前端显示逻辑：
  - 积分 > 0：显示"邀请好友领积分"
  - 积分 = 0 或未配置：显示"邀请好友"

---

### REQ-MOD-002: 新增排行榜展示配置

**Original**: 排行榜默认展示，**Modified**: 后台可配置是否展示排行榜

**Behavior Change**:
- 后端新增字段：`showRanking` (tinyint, 默认 1)
- 前端新增开关配置项
- 历史数据：`showRanking` = 1 (默认展示)
- 新建活动：可选择是否展示

---

## New Capabilities

### CAP-001: 按日期解锁

**Feature**: 支持按日期解锁任务

**Description**:
- 解锁方式新增"按日期解锁"选项
- 任务配置新增"任务开启日期"字段
- 任务开启日期 <= 当前日期时，任务可见

#### Fields

| 字段 | 类型 | 说明 |
|------|------|------|
| taskType | varchar(20) | 任务类型: study/exam/survey |
| unlockDate | date | 任务开启日期（按日期解锁时使用） |

#### UI Behavior
```
解锁方式: [○ 立即解锁] [○ 按日期解锁]

当选择"按日期解锁"时:
任务开启日期: [日期选择器]
```

---

### CAP-002: 任务类型扩展

**Feature**: 支持考试和调研任务类型

**Description**:
- 任务类型从单一"学习"扩展为：学习、考试、调研
- 考试类型：对接卷王考试系统
- 调研类型：对接体验家问卷系统

#### Fields

| 字段 | 类型 | 说明 |
|------|------|------|
| taskType | varchar(20) | study/exam/survey |
| examId | varchar(64) | 卷王考试ID (taskType=exam时必填) |
| surveyId | varchar(64) | 体验家问卷ID (taskType=survey时必填) |

#### UI Behavior
```
任务类型: [○ 学习] [○ 考试] [○ 调研]

当选择"考试"时:
考试选择: [下拉选择卷王考试列表]

当选择"调研"时:
问卷选择: [下拉选择体验家问卷列表]
```

---

### CAP-003: 多作业配置

**Feature**: 支持配置多个课后作业

**Description**:
- 原功能：单个课后作业
- 新功能：支持配置 1-3 个课后作业
- 每个作业支持图片或视频类型

#### Fields

| 字段 | 类型 | 说明 |
|------|------|------|
| homeworkList | json | 课后作业数组，最大长度 3 |

#### JSON Structure
```json
{
  "homeworkList": [
    {
      "type": "image",
      "url": "https://xxx.com/hw1.png",
      "name": "作业1"
    },
    {
      "type": "video",
      "url": "https://xxx.com/hw2.mp4",
      "name": "作业2"
    }
  ]
}
```

#### UI Behavior
```
课后作业配置:
┌─────────────────────────────────┐
│ 作业1: [图片] [视频] [删除]     │
│ URL: [上传或输入链接]           │
├─────────────────────────────────┤
│ 作业2: [图片] [视频] [删除]     │
│ URL: [上传或输入链接]           │
├─────────────────────────────────┤
│ [+ 添加作业] (最多3个)           │
└─────────────────────────────────┘
```

---

### CAP-004: 学习内容支持图片

**Feature**: 学习内容上传支持图片格式

**Description**:
- 原支持格式：mp3, mp4
- 新增支持格式：jpg, jpeg, png

#### UI Change
```
原: 支持的文件格式：mp3、mp4格式
新: 支持的文件格式：jpg、jpeg、png、mp3、mp4格式
```

---

### CAP-005: 学习内容/课件二选一

**Feature**: 学习内容和学习课件改为二选一必填

**Description**:
- 原逻辑：学习内容和课件分别必填
- 新逻辑：两者至少填一个即可

#### Validation Change
```
原:
- 学习内容: 必填
- 学习课件: 必填

新:
- 学习内容/学习课件: 至少填一个
```

---

### CAP-006: 第三方系统对接

**Feature**: 对接卷王考试系统和体验家问卷系统

**Description**:
- 新增卷王考试列表查询接口
- 新增体验家问卷列表查询接口
- 通过后端代理方式对接

#### APIs

**卷王考试列表**
```
GET /admin/api/v2/exam/juanwang/list?keyword=xxx&pageNum=1&pageSize=20
```

**体验家问卷列表**
```
GET /admin/api/v2/survey/tyj/list?keyword=xxx&pageNum=1&pageSize=20
```

---

### CAP-007: 活动分类展示控制

**Feature**: 活动分类影响热门活动展示

**Description**:
- 如不配置活动分类，则在 APP 热门活动-全部 tab 中不显示该活动
- 新增字段：`activityCategory`

#### Fields

| 字段 | 类型 | 说明 |
|------|------|------|
| activityCategory | varchar(64) | 活动分类 |

#### Behavior
```
后台配置:
活动分类: [下拉选择] 或 [不选择]

APP端:
- 有分类: 在热门活动-全部 tab 显示
- 无分类: 不在热门活动-全部 tab 显示
```

---

## Impact

### 后端服务 (opp-learn)

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| ActivityInfoEntity.java | 修改 | 新增字段 showRanking, activityCategory |
| ActivityCalendarEntity.java | 修改 | 新增字段 taskType, taskName, buttonText, unlockDate, displayDate, examId, surveyId, homeworkList |
| ActivityInfoController.java | 修改 | 接口新增参数和返回值 |
| ActivityInfoService.java | 修改 | 业务逻辑调整 |
| JuanwangClient.java | 新增 | 卷王系统对接客户端 |
| TyjClient.java | 新增 | 体验家系统对接客户端 |

### 数据库

| 表 | 变更类型 | 说明 |
|------|----------|------|
| activity_info | ALTER | 新增字段 show_ranking, activity_category |
| activity_calendar | ALTER | 新增字段 task_type, task_name, button_text, unlock_date, display_date, exam_id, survey_id, homework_list |

### 前端 (opp-admin-vue)

| 目录 | 变更类型 | 说明 |
|------|----------|------|
| src/views/teamLearn/ | 新增 | 组队学习页面 |
| src/api/teamLearn/ | 新增 | API 接口定义 |
| src/router/modules/teamLearn.js | 新增 | 路由配置 |
| src/components/ | 新增 | 业务组件 |

### 依赖系统

| 系统 | 变更类型 | 说明 |
|------|----------|------|
| 卷王考试系统 | 接口对接 | 新增 |
| 体验家问卷系统 | 接口对接 | 新增 |
| DAM 素材系统 | 无变更 | 复用现有 |
