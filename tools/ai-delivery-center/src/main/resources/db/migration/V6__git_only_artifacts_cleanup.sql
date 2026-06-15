-- Remove legacy COS artifact storage and keep Git artifact versions as the only source of truth.

ALTER TABLE ad_artifact
    MODIFY current_version_id BIGINT NULL COMMENT '当前Git产物版本ID，关联 ad_artifact_git_version.id';

ALTER TABLE ad_review
    MODIFY artifact_version_id BIGINT NULL COMMENT '评审绑定的Git产物版本ID，关联 ad_artifact_git_version.id';

ALTER TABLE ad_issue
    MODIFY source_artifact_version_id BIGINT NULL COMMENT '问题来源Git产物版本ID，关联 ad_artifact_git_version.id';

ALTER TABLE ad_collab_document
    MODIFY base_version_id BIGINT NULL COMMENT '协同草稿基于的Git产物版本ID，关联 ad_artifact_git_version.id';

ALTER TABLE ad_artifact_git_version
    MODIFY status VARCHAR(32) NOT NULL DEFAULT 'CURRENT' COMMENT '版本状态：CURRENT当前版本，ARCHIVED历史版本';

ALTER TABLE ad_run_event
    DROP COLUMN text_object_id;

DROP TABLE IF EXISTS ad_artifact_upload_session;
DROP TABLE IF EXISTS ad_artifact_version;
DROP TABLE IF EXISTS ad_file_object;
