-- AI Delivery Center baseline schema.
-- Large append-only tables ad_run_event and ad_domain_event use created_at indexes in the baseline.
-- Production can archive them by month into cold tables or enable native monthly partitions after confirming MySQL version policy.

CREATE TABLE IF NOT EXISTS ad_team (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    name VARCHAR(128) NOT NULL COMMENT '团队名称',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' COMMENT '团队状态：ACTIVE 启用，DISABLED 停用',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    KEY idx_team_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付团队表';

CREATE TABLE IF NOT EXISTS ad_user (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    account VARCHAR(128) NOT NULL COMMENT '用户账号，通常为工号、邮箱或统一登录账号',
    display_name VARCHAR(128) NOT NULL COMMENT '用户展示名称',
    avatar_url VARCHAR(512) NULL COMMENT '用户头像地址',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' COMMENT '用户状态：ACTIVE 启用，DISABLED 停用',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_account (account)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付用户表';

CREATE TABLE IF NOT EXISTS ad_team_member (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    team_id BIGINT NOT NULL COMMENT '团队ID，关联 ad_team.id',
    user_id BIGINT NOT NULL COMMENT '用户ID，关联 ad_user.id',
    role VARCHAR(32) NOT NULL COMMENT '团队角色：OWNER、ADMIN、MEMBER、REVIEWER 等',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_team_user (team_id, user_id),
    KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付团队成员表';

CREATE TABLE IF NOT EXISTS ad_project (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    team_id BIGINT NOT NULL COMMENT '所属团队ID，关联 ad_team.id',
    name VARCHAR(128) NOT NULL COMMENT '项目名称',
    code VARCHAR(64) NOT NULL COMMENT '项目编码，团队内唯一',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' COMMENT '项目状态：ACTIVE 启用，DISABLED 停用',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_team_project_code (team_id, code),
    KEY idx_team_status (team_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付项目表';

CREATE TABLE IF NOT EXISTS ad_requirement (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    project_id BIGINT NOT NULL COMMENT '所属项目ID，关联 ad_project.id',
    requirement_id VARCHAR(64) NOT NULL COMMENT '业务需求编号，如 172014',
    title VARCHAR(256) NOT NULL COMMENT '需求标题',
    requirement_type VARCHAR(32) NOT NULL DEFAULT 'REQUIREMENT' COMMENT '需求类型：REQUIREMENT 需求，DEFECT 缺陷等',
    branch_name VARCHAR(256) NULL COMMENT '关联 Git 分支名称',
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT' COMMENT '需求流程状态：DRAFT、IN_PROGRESS、COMPLETED、CANCELLED 等',
    current_stage VARCHAR(32) NOT NULL DEFAULT 'PRD' COMMENT '当前流程阶段：PRD、TECH_DESIGN、IMPLEMENTATION、CODE_REVIEW',
    version BIGINT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
    created_by BIGINT NULL COMMENT '创建人用户ID，关联 ad_user.id',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_project_requirement (project_id, requirement_id),
    KEY idx_project_status (project_id, status),
    KEY idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付需求流程主表';

CREATE TABLE IF NOT EXISTS ad_workflow_stage (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    requirement_pk BIGINT NOT NULL COMMENT '需求主键ID，关联 ad_requirement.id',
    stage VARCHAR(32) NOT NULL COMMENT '流程阶段：PRD、TECH_DESIGN、IMPLEMENTATION、CODE_REVIEW',
    status VARCHAR(32) NOT NULL COMMENT '阶段状态：PENDING、RUNNING、APPROVED、REJECTED 等',
    artifact_id BIGINT NULL COMMENT '阶段绑定的逻辑产物ID，关联 ad_artifact.id',
    approved_at DATETIME NULL COMMENT '阶段通过时间',
    rejected_at DATETIME NULL COMMENT '阶段驳回时间',
    comment VARCHAR(1000) NULL COMMENT '阶段备注或最近评审意见',
    version BIGINT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_requirement_stage (requirement_pk, stage),
    KEY idx_requirement_status (requirement_pk, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付流程阶段表';

CREATE TABLE IF NOT EXISTS ad_review (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    requirement_pk BIGINT NOT NULL COMMENT '需求主键ID，关联 ad_requirement.id',
    stage VARCHAR(32) NOT NULL COMMENT '评审所属阶段：PRD、TECH_DESIGN、IMPLEMENTATION、CODE_REVIEW',
    implementation_step VARCHAR(64) NULL COMMENT '实施阶段细分步骤或任务标识',
    decision VARCHAR(32) NOT NULL COMMENT '评审结论：APPROVED、REJECTED、COMMENTED 等',
    comment VARCHAR(2000) NULL COMMENT '评审意见',
    actor_id BIGINT NOT NULL COMMENT '评审人用户ID，关联 ad_user.id',
    artifact_version_id BIGINT NULL COMMENT '评审绑定的产物版本ID，关联 ad_artifact_version.id',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    KEY idx_requirement_stage (requirement_pk, stage),
    KEY idx_actor_created (actor_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付阶段评审记录表';

CREATE TABLE IF NOT EXISTS ad_issue (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    requirement_pk BIGINT NOT NULL COMMENT '需求主键ID，关联 ad_requirement.id',
    severity VARCHAR(32) NOT NULL COMMENT '问题级别：BLOCKER、CRITICAL、MAJOR、MINOR、INFO 等',
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN' COMMENT '问题状态：OPEN、FIXED、ACCEPTED、INVALID',
    title VARCHAR(256) NOT NULL COMMENT '问题标题',
    recommendation VARCHAR(2000) NULL COMMENT '修复建议或处理说明',
    source_artifact_version_id BIGINT NULL COMMENT '问题来源产物版本ID，关联 ad_artifact_version.id',
    assignee_id BIGINT NULL COMMENT '指派处理人用户ID，关联 ad_user.id',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    KEY idx_requirement_status (requirement_pk, status),
    KEY idx_assignee_status (assignee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付共享问题表';

CREATE TABLE IF NOT EXISTS ad_artifact (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    requirement_pk BIGINT NOT NULL COMMENT '需求主键ID，关联 ad_requirement.id',
    logical_path VARCHAR(512) NOT NULL COMMENT '逻辑产物路径，如 docs/{需求号}/prd/analysis.md',
    label VARCHAR(256) NOT NULL COMMENT '产物展示名称',
    kind VARCHAR(32) NOT NULL COMMENT '产物类型：PRD、TECH_DESIGN、OPENSPEC、JUNIT、CODE_REVIEW 等',
    stage VARCHAR(32) NOT NULL COMMENT '产物所属阶段：PRD、TECH_DESIGN、IMPLEMENTATION、CODE_REVIEW',
    current_version_id BIGINT NULL COMMENT '当前业务版本ID，关联 ad_artifact_version.id',
    version BIGINT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_requirement_path (requirement_pk, logical_path),
    KEY idx_requirement_stage (requirement_pk, stage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付逻辑产物表';

CREATE TABLE IF NOT EXISTS ad_file_object (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    bucket VARCHAR(128) NOT NULL COMMENT 'COS Bucket 名称',
    cos_key VARCHAR(1024) NOT NULL COMMENT 'COS 对象 Key',
    cos_version_id VARCHAR(256) NULL COMMENT 'COS 原生版本ID，Bucket 开启版本控制时返回',
    sha256 CHAR(64) NOT NULL COMMENT '文件内容 SHA-256 摘要',
    size BIGINT NOT NULL COMMENT '文件大小，单位字节',
    content_type VARCHAR(128) NOT NULL COMMENT '文件 Content-Type',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    KEY idx_sha256 (sha256),
    UNIQUE KEY uk_bucket_key_version (bucket, cos_key(512), cos_version_id(128))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='COS文件对象元数据表';

CREATE TABLE IF NOT EXISTS ad_artifact_version (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    artifact_id BIGINT NOT NULL COMMENT '逻辑产物ID，关联 ad_artifact.id',
    version_no INT NOT NULL COMMENT '业务版本号，从 1 递增',
    base_version_id BIGINT NULL COMMENT '保存时基于的上一版本ID，用于多人冲突检测',
    file_object_id BIGINT NOT NULL COMMENT '文件对象ID，关联 ad_file_object.id',
    content_sha256 CHAR(64) NULL COMMENT '产物版本内容SHA-256摘要，用于初始化导入幂等查重',
    status VARCHAR(32) NOT NULL DEFAULT 'CURRENT' COMMENT '版本状态：CURRENT 当前版本，ARCHIVED 历史版本等',
    source_run_id BIGINT NULL COMMENT '来源运行记录ID，关联 ad_run.id',
    created_by BIGINT NOT NULL COMMENT '创建人用户ID，关联 ad_user.id',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_artifact_version (artifact_id, version_no),
    KEY idx_artifact_content_hash (artifact_id, content_sha256),
    KEY idx_file_object (file_object_id),
    KEY idx_source_run (source_run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付产物业务版本表';

CREATE TABLE IF NOT EXISTS ad_artifact_upload_session (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    artifact_id BIGINT NOT NULL COMMENT '逻辑产物ID，关联 ad_artifact.id',
    base_version_id BIGINT NULL COMMENT '上传基于的产物版本ID，用于完成上传时冲突检测',
    bucket VARCHAR(128) NOT NULL COMMENT '目标 COS Bucket 名称',
    cos_key VARCHAR(1024) NOT NULL COMMENT '目标 COS 对象 Key',
    file_name VARCHAR(256) NOT NULL COMMENT '上传文件名',
    expected_sha256 CHAR(64) NOT NULL COMMENT '期望文件 SHA-256 摘要',
    expected_size BIGINT NOT NULL COMMENT '期望文件大小，单位字节',
    content_type VARCHAR(128) NOT NULL COMMENT '上传文件 Content-Type',
    status VARCHAR(32) NOT NULL DEFAULT 'CREATED' COMMENT '上传会话状态：CREATED、COMPLETED、EXPIRED、FAILED',
    expire_at DATETIME NOT NULL COMMENT '上传会话过期时间',
    created_by BIGINT NOT NULL COMMENT '创建人用户ID，关联 ad_user.id',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    KEY idx_artifact_status (artifact_id, status),
    KEY idx_expire_at (expire_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付产物COS上传会话表';

CREATE TABLE IF NOT EXISTS ad_import_session (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    project_id BIGINT NOT NULL COMMENT '导入目标项目ID，关联 ad_project.id',
    mode VARCHAR(32) NOT NULL COMMENT '导入模式：DRY_RUN预演，IMPORT正式导入',
    status VARCHAR(32) NOT NULL DEFAULT 'RUNNING' COMMENT '导入会话状态：RUNNING、COMPLETED、FAILED、CANCELLED',
    source VARCHAR(32) NOT NULL DEFAULT 'LOCAL_BOOTSTRAP' COMMENT '导入来源：LOCAL_BOOTSTRAP 本地初始化导入',
    manifest_sha256 CHAR(64) NULL COMMENT '本地导入清单SHA-256摘要',
    total_count INT NOT NULL DEFAULT 0 COMMENT '计划处理记录总数',
    imported_count INT NOT NULL DEFAULT 0 COMMENT '成功导入记录数',
    skipped_count INT NOT NULL DEFAULT 0 COMMENT '跳过记录数',
    failed_count INT NOT NULL DEFAULT 0 COMMENT '失败记录数',
    duplicated_count INT NOT NULL DEFAULT 0 COMMENT '重复记录数',
    conflicted_count INT NOT NULL DEFAULT 0 COMMENT '冲突记录数',
    error_message VARCHAR(2000) NULL COMMENT '导入失败或取消原因',
    created_by BIGINT NOT NULL COMMENT '创建人用户ID，关联 ad_user.id',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    KEY idx_project_status (project_id, status),
    KEY idx_created_by (created_by, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付初始化导入会话表';

CREATE TABLE IF NOT EXISTS ad_import_item (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    import_session_id BIGINT NOT NULL COMMENT '导入会话ID，关联 ad_import_session.id',
    item_type VARCHAR(32) NOT NULL COMMENT '导入记录类型：REQUIREMENT、STAGE、REVIEW、ISSUE、RUN、RUN_EVENT、ARTIFACT、ARTIFACT_VERSION',
    source_key VARCHAR(512) NOT NULL COMMENT '源记录逻辑键，不包含本地绝对路径',
    source_sha256 CHAR(64) NULL COMMENT '源文件或源记录SHA-256摘要',
    target_type VARCHAR(32) NULL COMMENT '中心目标类型',
    target_id BIGINT NULL COMMENT '中心目标主键ID',
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' COMMENT '导入记录状态：PENDING、IMPORTED、DUPLICATED、CONFLICTED、SKIPPED、FAILED',
    error_message VARCHAR(2000) NULL COMMENT '记录导入失败或冲突原因',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_session_item (import_session_id, item_type, source_key),
    KEY idx_status (status),
    KEY idx_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付初始化导入记录明细表';

CREATE TABLE IF NOT EXISTS ad_client_session (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    user_id BIGINT NOT NULL COMMENT '用户ID，关联 ad_user.id',
    os_type VARCHAR(32) NOT NULL COMMENT '客户端操作系统类型：MACOS、WINDOWS、LINUX 等',
    capabilities JSON NOT NULL COMMENT '客户端能力摘要JSON，不包含本机路径、Agent token 或终端密钥',
    status VARCHAR(32) NOT NULL DEFAULT 'ONLINE' COMMENT '客户端状态：ONLINE 在线，OFFLINE 离线',
    last_heartbeat_at DATETIME NOT NULL COMMENT '最近心跳时间',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    KEY idx_user_heartbeat (user_id, last_heartbeat_at),
    KEY idx_status_heartbeat (status, last_heartbeat_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='桌面客户端在线会话表';

CREATE TABLE IF NOT EXISTS ad_job (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    requirement_pk BIGINT NOT NULL COMMENT '需求主键ID，关联 ad_requirement.id',
    action_type VARCHAR(64) NOT NULL COMMENT '任务动作类型，如 PRD、TECH_DESIGN、OPENSPEC_APPLY、CODE_REVIEW',
    params_json JSON NULL COMMENT '任务参数JSON，保留 ActionInput 关键参数',
    status VARCHAR(32) NOT NULL DEFAULT 'QUEUED' COMMENT '任务状态：QUEUED、CLAIMED、RUNNING、SUCCEEDED、FAILED、CANCELLED',
    claimed_by BIGINT NULL COMMENT '领取任务的客户端会话ID，关联 ad_client_session.id',
    lease_expire_at DATETIME NULL COMMENT '任务租约过期时间',
    retry_times INT NOT NULL DEFAULT 0 COMMENT '已重试次数',
    created_by BIGINT NOT NULL COMMENT '创建人用户ID，关联 ad_user.id',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    KEY idx_status (status),
    KEY idx_requirement (requirement_pk),
    KEY idx_claimed_by (claimed_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付本地执行任务表';

CREATE TABLE IF NOT EXISTS ad_run (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    job_id BIGINT NOT NULL COMMENT '任务ID，关联 ad_job.id',
    requirement_pk BIGINT NOT NULL COMMENT '需求主键ID，关联 ad_requirement.id',
    status VARCHAR(32) NOT NULL DEFAULT 'RUNNING' COMMENT '运行状态：RUNNING、SUCCEEDED、FAILED、CANCELLED',
    client_session_id BIGINT NULL COMMENT '执行客户端会话ID，关联 ad_client_session.id',
    agent_id VARCHAR(64) NULL COMMENT '执行使用的 Agent Provider ID',
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '运行开始时间',
    finished_at DATETIME NULL COMMENT '运行结束时间',
    error_message VARCHAR(2000) NULL COMMENT '失败或取消原因',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    KEY idx_job (job_id),
    KEY idx_status (status),
    KEY idx_requirement (requirement_pk)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付运行记录表';

CREATE TABLE IF NOT EXISTS ad_run_event (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    run_id BIGINT NOT NULL COMMENT '运行记录ID，关联 ad_run.id',
    seq BIGINT NOT NULL COMMENT '运行内事件序号，从 1 递增',
    level VARCHAR(16) NOT NULL COMMENT '日志级别：INFO、WARN、ERROR、DEBUG 等',
    type VARCHAR(32) NOT NULL COMMENT '事件类型：stdout、stderr、exit、cancelled、chunk 等',
    message TEXT NOT NULL COMMENT '日志内容或长文本摘要',
    text_object_id BIGINT NULL COMMENT '长文本分块文件对象ID，关联 ad_file_object.id',
    payload_json JSON NULL COMMENT '事件扩展载荷JSON',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_run_seq (run_id, seq),
    KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付运行事件日志表';

CREATE TABLE IF NOT EXISTS ad_domain_event (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    project_id BIGINT NOT NULL COMMENT '项目ID，关联 ad_project.id',
    event_id BIGINT NOT NULL COMMENT '项目内单调递增事件ID，用于实时推送和断线补偿',
    event_type VARCHAR(64) NOT NULL COMMENT '领域事件类型，如 artifact.version.created、workflow.stage.updated',
    aggregate_type VARCHAR(64) NOT NULL COMMENT '聚合根类型：REQUIREMENT、ARTIFACT、JOB、RUN、ISSUE 等',
    aggregate_id BIGINT NOT NULL COMMENT '聚合根ID',
    payload_json JSON NOT NULL COMMENT '事件载荷JSON，包含客户端刷新所需标识',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_event_id (event_id),
    KEY idx_project_event (project_id, event_id),
    KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付协作领域事件表';

CREATE TABLE IF NOT EXISTS ad_ws_session (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    user_id BIGINT NOT NULL COMMENT '用户ID，关联 ad_user.id',
    client_session_id BIGINT NOT NULL COMMENT '桌面客户端会话ID，关联 ad_client_session.id',
    last_project_id BIGINT NULL COMMENT '最近一次 presence 心跳所属项目ID，用于离线通知',
    session_id VARCHAR(128) NOT NULL COMMENT 'WebSocket会话ID，由STOMP连接生成',
    connected_at DATETIME NOT NULL COMMENT 'WebSocket连接建立时间',
    last_seen_at DATETIME NOT NULL COMMENT '最近心跳或消息时间',
    last_ack_event_id BIGINT NOT NULL DEFAULT 0 COMMENT '客户端最近确认处理的领域事件ID',
    status VARCHAR(32) NOT NULL DEFAULT 'ONLINE' COMMENT 'WebSocket会话状态：ONLINE在线，OFFLINE离线',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_session_id (session_id),
    KEY idx_user_status (user_id, status),
    KEY idx_client_session (client_session_id),
    KEY idx_project_status (last_project_id, status),
    KEY idx_last_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付WebSocket在线会话表';

CREATE TABLE IF NOT EXISTS ad_execution_lock (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    requirement_pk BIGINT NOT NULL COMMENT '需求主键ID，关联 ad_requirement.id',
    stage VARCHAR(32) NOT NULL COMMENT '流程阶段：PRD、TECH_DESIGN、IMPLEMENTATION、CODE_REVIEW',
    action_type VARCHAR(64) NOT NULL COMMENT '人工触发动作类型，如 PRD、TECH_DESIGN、OPENSPEC_APPLY、CODE_REVIEW',
    holder_user_id BIGINT NOT NULL COMMENT '占用动作的用户ID，关联 ad_user.id',
    client_session_id BIGINT NOT NULL COMMENT '占用动作的客户端会话ID，关联 ad_client_session.id',
    expire_at DATETIME NOT NULL COMMENT '占用过期时间，超过后允许他人接管',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' COMMENT '占用状态：ACTIVE占用中，RELEASED已释放，EXPIRED已过期',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_requirement_stage_action (requirement_pk, stage, action_type),
    KEY idx_holder_user (holder_user_id),
    KEY idx_expire_at (expire_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付人工阶段动作占用表';

CREATE TABLE IF NOT EXISTS ad_collab_document (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    artifact_id BIGINT NOT NULL COMMENT '逻辑产物ID，关联 ad_artifact.id',
    base_version_id BIGINT NULL COMMENT '协同草稿基于的产物版本ID，关联 ad_artifact_version.id',
    document_type VARCHAR(32) NOT NULL COMMENT '协同文档类型：TEXT、MARKDOWN、JSON、HTML等',
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT' COMMENT '草稿状态：DRAFT编辑中，PUBLISHED已发布，DISCARDED已废弃',
    version BIGINT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
    current_snapshot_id BIGINT NULL COMMENT '当前快照ID，关联 ad_collab_snapshot.id',
    created_by BIGINT NOT NULL COMMENT '创建人用户ID，关联 ad_user.id',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_artifact_draft (artifact_id, base_version_id, status),
    KEY idx_base_version (base_version_id),
    KEY idx_status_updated (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付协同编辑文档草稿表';

CREATE TABLE IF NOT EXISTS ad_collab_operation (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    document_id BIGINT NOT NULL COMMENT '协同文档ID，关联 ad_collab_document.id',
    seq BIGINT NOT NULL COMMENT '文档内操作序号，从1递增',
    actor_id BIGINT NOT NULL COMMENT '操作用户ID，关联 ad_user.id',
    operation_type VARCHAR(32) NOT NULL COMMENT '操作类型：INSERT、DELETE、REPLACE、UPDATE等',
    operation_payload MEDIUMTEXT NOT NULL COMMENT '操作载荷，预留CRDT或OT协议内容',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_document_seq (document_id, seq),
    KEY idx_actor_created (actor_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付协同编辑操作日志表';

CREATE TABLE IF NOT EXISTS ad_collab_snapshot (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    document_id BIGINT NOT NULL COMMENT '协同文档ID，关联 ad_collab_document.id',
    seq BIGINT NOT NULL COMMENT '快照覆盖到的操作序号',
    content MEDIUMTEXT NOT NULL COMMENT '协同文档文本快照内容',
    sha256 CHAR(64) NOT NULL COMMENT '快照内容SHA-256摘要',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    KEY idx_document_seq (document_id, seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付协同编辑文档快照表';

UPDATE ad_artifact_version av
JOIN ad_file_object fo ON fo.id = av.file_object_id
SET av.content_sha256 = fo.sha256
WHERE av.content_sha256 IS NULL;
