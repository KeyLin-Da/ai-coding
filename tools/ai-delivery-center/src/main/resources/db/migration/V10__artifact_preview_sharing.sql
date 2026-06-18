-- Artifact preview sharing metadata. Public share content is resolved from controlled artifact paths.

CREATE TABLE IF NOT EXISTS ad_artifact_share (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    project_id BIGINT NOT NULL COMMENT '项目ID，关联 ad_project.id',
    requirement_pk BIGINT NULL COMMENT '需求主键ID，关联 ad_requirement.id',
    requirement_id VARCHAR(64) NOT NULL COMMENT '需求编号',
    artifact_path VARCHAR(512) NOT NULL COMMENT '产物逻辑路径，如 docs/{requirementId}/technical-design/design_review.md',
    visibility VARCHAR(32) NOT NULL DEFAULT 'PUBLIC' COMMENT '分享可见性：PUBLIC公开访问',
    token_hash CHAR(64) NOT NULL COMMENT '公开分享token的SHA-256摘要，不保存明文token',
    status VARCHAR(32) NOT NULL DEFAULT 'ENABLED' COMMENT '分享状态：ENABLED启用，REVOKED已撤销',
    expire_at DATETIME NULL COMMENT '过期时间，为空表示不过期',
    show_annotations TINYINT NOT NULL DEFAULT 1 COMMENT '是否展示批注：1展示，0隐藏',
    allow_download TINYINT NOT NULL DEFAULT 1 COMMENT '是否允许下载：1允许，0禁止',
    access_count BIGINT NOT NULL DEFAULT 0 COMMENT '公开访问次数',
    last_access_at DATETIME NULL COMMENT '最近访问时间',
    created_by BIGINT NOT NULL COMMENT '创建人用户ID，关联 ad_user.id',
    revoked_at DATETIME NULL COMMENT '撤销时间',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0未删除，1已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_token_hash (token_hash),
    KEY idx_project_requirement (project_id, requirement_id),
    KEY idx_status_expire (status, expire_at),
    KEY idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付产物预览公开分享记录表';
