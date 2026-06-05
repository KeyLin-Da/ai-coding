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
    status VARCHAR(32) NOT NULL DEFAULT 'CURRENT' COMMENT '版本状态：CURRENT 当前版本，ARCHIVED 历史版本等',
    source_run_id BIGINT NULL COMMENT '来源运行记录ID，关联 ad_run.id',
    created_by BIGINT NOT NULL COMMENT '创建人用户ID，关联 ad_user.id',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_artifact_version (artifact_id, version_no),
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
