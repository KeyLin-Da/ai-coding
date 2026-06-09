-- Requirement-project association table.

CREATE TABLE IF NOT EXISTS ad_requirement_project (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    requirement_pk BIGINT NOT NULL COMMENT '需求主键ID，关联 ad_requirement.id',
    project_name VARCHAR(256) NOT NULL COMMENT '工程目录名称（仅存名称，本地路径由各用户自行配置）',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    KEY idx_requirement_pk (requirement_pk)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付需求关联工程表';
