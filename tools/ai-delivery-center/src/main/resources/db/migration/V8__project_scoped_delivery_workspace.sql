-- Project-scoped local delivery workspace.

ALTER TABLE ad_user_delivery_workspace
    ADD COLUMN project_id BIGINT NULL COMMENT '项目ID，关联 ad_project.id；新版本按 user_id + project_id 记录交付工作区' AFTER user_id;

ALTER TABLE ad_user_delivery_workspace
    ADD UNIQUE KEY uk_user_project (user_id, project_id),
    ADD KEY idx_project_status (project_id, status);
