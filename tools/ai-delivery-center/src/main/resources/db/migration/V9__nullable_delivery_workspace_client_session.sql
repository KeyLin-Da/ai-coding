-- Project-scoped delivery workspaces no longer use client session as ownership.

ALTER TABLE ad_user_delivery_workspace
    MODIFY COLUMN client_session_id BIGINT NULL COMMENT '桌面客户端会话ID，旧版本归属字段；新版本按 user_id + project_id 记录交付工作区，可为空';
