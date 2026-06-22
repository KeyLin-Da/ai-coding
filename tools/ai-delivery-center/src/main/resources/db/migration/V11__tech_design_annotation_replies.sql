-- Store threaded replies for technical-design annotations.

CREATE TABLE IF NOT EXISTS ad_tech_design_annotation_reply (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    requirement_pk BIGINT NOT NULL COMMENT '需求主键ID，关联 ad_requirement.id',
    annotation_uid VARCHAR(64) NOT NULL COMMENT '所属批注稳定ID',
    reply_uid VARCHAR(64) NOT NULL COMMENT '对外稳定回复ID',
    content_text VARCHAR(4000) NOT NULL COMMENT '回复内容',
    consumed_at DATETIME NULL COMMENT '成功生成消费时间',
    consumed_run_id VARCHAR(128) NULL COMMENT '消费该回复的运行ID',
    created_by BIGINT NOT NULL COMMENT '创建人用户ID',
    updated_by BIGINT NULL COMMENT '最近更新人用户ID',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0 未删除，1 已删除',
    PRIMARY KEY (id),
    UNIQUE KEY uk_requirement_reply (requirement_pk, reply_uid),
    KEY idx_requirement_annotation (requirement_pk, annotation_uid),
    KEY idx_requirement_consumed (requirement_pk, consumed_at),
    KEY idx_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI交付技术方案批注回复表';
