-- Git-backed artifact source of truth and user-local delivery workspace.

CREATE TABLE IF NOT EXISTS ad_user_delivery_workspace (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    user_id BIGINT NOT NULL COMMENT '用户ID，关联 ad_user.id，本地交付工作区仅该用户可见',
    client_session_id BIGINT NOT NULL COMMENT '桌面客户端会话ID，关联 ad_client_session.id',
    local_path VARCHAR(1024) NOT NULL COMMENT '用户本机全局AI交付工作区绝对路径',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' COMMENT '配置状态：ACTIVE启用，DISABLED停用',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0未删除，1已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_client (user_id, client_session_id),
    KEY idx_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付用户本地全局工作区配置表';

CREATE TABLE IF NOT EXISTS ad_user_git_credential (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    user_id BIGINT NOT NULL COMMENT '用户ID，关联 ad_user.id',
    platform VARCHAR(32) NOT NULL COMMENT 'Git平台：PROJECT_GIT、GITLAB、GITHUB、GITEE、OTHER',
    fingerprint VARCHAR(128) NOT NULL COMMENT 'SSH公钥指纹',
    public_key TEXT NOT NULL COMMENT 'SSH公钥内容，中心不保存私钥',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' COMMENT '凭证状态：ACTIVE启用，DISABLED停用，REVOKED已废弃',
    generated_at DATETIME NOT NULL COMMENT '凭证生成时间',
    revoked_at DATETIME NULL COMMENT '凭证废弃时间',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0未删除，1已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_platform_fingerprint (user_id, platform, fingerprint),
    KEY idx_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付用户Git SSH公钥凭证表';

CREATE TABLE IF NOT EXISTS ad_project_repository (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    project_id BIGINT NOT NULL COMMENT '项目ID，关联 ad_project.id',
    provider VARCHAR(32) NOT NULL COMMENT 'Git仓平台：PROJECT_GIT、GITLAB、GITHUB、GITEE、OTHER',
    repo_url VARCHAR(1024) NOT NULL COMMENT 'AI产物Git仓地址，创建后不可修改',
    default_branch VARCHAR(128) NOT NULL DEFAULT 'master' COMMENT '默认分支',
    repo_code VARCHAR(128) NOT NULL COMMENT '本地clone目录名，默认使用项目code',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' COMMENT '仓库配置状态：ACTIVE启用，DISABLED停用',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0未删除，1已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_project (project_id),
    KEY idx_repo_code (repo_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付项目产物Git仓配置表';

CREATE TABLE IF NOT EXISTS ad_user_project_repo_state (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    user_id BIGINT NOT NULL COMMENT '用户ID，关联 ad_user.id',
    project_id BIGINT NOT NULL COMMENT '项目ID，关联 ad_project.id',
    client_session_id BIGINT NOT NULL COMMENT '桌面客户端会话ID，关联 ad_client_session.id',
    local_repo_path VARCHAR(1024) NOT NULL COMMENT '用户本机项目产物仓绝对路径',
    current_branch VARCHAR(128) NULL COMMENT '当前本地分支',
    head_commit CHAR(40) NULL COMMENT '本地HEAD提交',
    remote_commit CHAR(40) NULL COMMENT '远端默认分支提交',
    sync_status VARCHAR(32) NOT NULL DEFAULT 'NOT_CLONED' COMMENT '同步状态：NOT_CLONED、READY、BEHIND_REMOTE、DIRTY、CONFLICTING、PUSHING、PUSHED、FAILED',
    last_checked_at DATETIME NULL COMMENT '最近检查时间',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0未删除，1已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_project_client (user_id, project_id, client_session_id),
    KEY idx_project_status (project_id, sync_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付用户本机项目产物仓状态表';

CREATE TABLE IF NOT EXISTS ad_artifact_git_version (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    artifact_id BIGINT NOT NULL COMMENT '逻辑产物ID，关联 ad_artifact.id',
    version_no INT NOT NULL COMMENT 'Git产物版本号，从1递增',
    commit_sha CHAR(40) NOT NULL COMMENT '产物同步后的Git commit sha',
    blob_sha VARCHAR(128) NOT NULL COMMENT 'Git blob或文件模式组合标识',
    content_sha256 CHAR(64) NOT NULL COMMENT '文件内容SHA-256摘要',
    file_path VARCHAR(512) NOT NULL COMMENT '仓库内产物相对路径',
    base_commit_sha CHAR(40) NULL COMMENT '同步基线commit sha',
    status VARCHAR(32) NOT NULL DEFAULT 'CURRENT' COMMENT '版本状态：CURRENT当前版本，ARCHIVED历史版本，LEGACY_COS历史COS版本',
    source_run_id BIGINT NULL COMMENT '来源运行记录ID，关联 ad_run.id',
    created_by BIGINT NOT NULL COMMENT '创建人用户ID，关联 ad_user.id',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0未删除，1已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_artifact_version (artifact_id, version_no),
    KEY idx_artifact_commit (artifact_id, commit_sha),
    KEY idx_content_hash (content_sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付产物Git业务版本表';

CREATE TABLE IF NOT EXISTS ad_artifact_sync (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    requirement_pk BIGINT NOT NULL COMMENT '需求主键ID，关联 ad_requirement.id',
    stage VARCHAR(32) NOT NULL COMMENT '流程阶段：PRD、TECH_DESIGN、IMPLEMENTATION、CODE_REVIEW',
    sync_type VARCHAR(32) NOT NULL COMMENT '同步类型：REVIEW_APPROVAL、PUBLIC_SYNC、SKILL_SYNC、BOOTSTRAP',
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' COMMENT '同步状态：PENDING、PUSHING、PUSHED、FAILED、BLOCKED',
    commit_sha CHAR(40) NULL COMMENT '同步成功后的Git commit sha',
    file_count INT NOT NULL DEFAULT 0 COMMENT '同步文件数量',
    pushed_by BIGINT NULL COMMENT '执行push的用户ID，关联 ad_user.id',
    pushed_at DATETIME NULL COMMENT 'push成功时间',
    error_message VARCHAR(2000) NULL COMMENT '同步失败或阻断原因',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0未删除，1已删除',
    PRIMARY KEY (id),
    KEY idx_requirement_stage (requirement_pk, stage),
    KEY idx_status_updated (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付产物Git同步记录表';
