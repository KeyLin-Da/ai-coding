-- User/project onboarding and private workspace mapping.

CREATE TABLE IF NOT EXISTS ad_user_session (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    user_id BIGINT NOT NULL COMMENT '用户ID，关联 ad_user.id',
    token_hash CHAR(64) NOT NULL COMMENT '访问会话 token 的 SHA-256 摘要，不保存 token 明文',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' COMMENT '会话状态：ACTIVE 有效，REVOKED 已退出，EXPIRED 已过期',
    expire_at DATETIME NOT NULL COMMENT '会话过期时间，默认创建后 24 小时',
    last_access_at DATETIME NULL COMMENT '最近访问时间',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_token_hash (token_hash),
    KEY idx_user_expire (user_id, expire_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付用户访问会话表';

CREATE TABLE IF NOT EXISTS ad_user_project_workspace (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    user_id BIGINT NOT NULL COMMENT '用户ID，关联 ad_user.id，本地路径仅该用户可见',
    project_id BIGINT NOT NULL COMMENT '项目ID，关联 ad_project.id',
    client_session_id BIGINT NULL COMMENT '桌面客户端会话ID，关联 ad_client_session.id，可为空',
    local_path VARCHAR(512) NOT NULL COMMENT '用户本机工程父目录绝对路径，仅本人私有配置',
    display_name VARCHAR(128) NULL COMMENT '目录展示名称',
    is_default TINYINT NOT NULL DEFAULT 0 COMMENT '是否默认目录：0 否，1 是',
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' COMMENT '配置状态：ACTIVE 启用，DISABLED 停用',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_project_path (user_id, project_id, local_path),
    KEY idx_user_project (user_id, project_id),
    KEY idx_client_session (client_session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付用户项目私有工程目录配置表';
