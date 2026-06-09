package com.opp.aidelivery.center.common.error;

import lombok.Getter;

@Getter
public enum AiDeliveryErrorCode {

    AUTHENTICATION_FAILED("B70001", "认证失败"),
    ACCESS_DENIED("B70002", "无访问权限"),
    VALIDATION_FAILED("B70003", "参数校验失败"),
    RESOURCE_NOT_FOUND("B70004", "资源不存在"),
    WORKFLOW_VERSION_CONFLICT("B70020", "流程版本冲突"),
    ARTIFACT_VERSION_CONFLICT("B70021", "产物版本冲突"),
    COS_OBJECT_MISMATCH("B70030", "COS 对象校验失败"),
    WEBSOCKET_TICKET_INVALID("B70031", "WebSocket ticket 无效或已过期"),
    WEBSOCKET_SUBSCRIBE_DENIED("B70032", "无权订阅实时事件"),
    WEBSOCKET_EVENT_EXPIRED("B70033", "实时事件历史已过期"),
    EXECUTION_LOCK_CONFLICT("B70034", "阶段动作已被他人占用"),
    COLLAB_DRAFT_BASE_STALE("B70035", "协同草稿基线版本已过期"),
    COS_UPLOAD_SESSION_EXPIRED("B70036", "COS 上传会话已过期"),
    JOB_LEASE_EXPIRED("B70040", "Job 租约已失效"),
    IMPORT_SESSION_INVALID("B70041", "导入会话不存在或状态不可操作"),
    IMPORT_RECORD_CONFLICT("B70042", "导入记录与中心最新状态冲突"),
    IMPORT_PAYLOAD_UNSAFE("B70043", "导入 payload 包含本地私密字段"),
    ARTIFACT_CONTENT_MISMATCH("B70044", "产物内容 hash 或 size 校验失败"),
    PREFLIGHT_FAILED("B70045", "预检失败，禁止执行初始化导入"),
    IMPORT_PROJECT_DENIED("B70046", "用户无项目导入权限"),
    JOB_ALREADY_CLAIMED("B70047", "Job 已被其他客户端领取"),
    EVENT_HISTORY_EXPIRED("B70050", "事件历史已过期"),
    USER_SESSION_INVALID("B70061", "访问会话不存在或已过期"),
    USER_ACCOUNT_UNAVAILABLE("B70062", "用户账号不存在或已停用"),
    PROJECT_JOIN_DENIED("B70063", "项目不存在或无权加入"),
    PROJECT_CODE_CONFLICT("B70064", "项目码冲突或不可用"),
    WORKSPACE_PATH_DENIED("B70065", "工作区路径无权访问"),
    WORKSPACE_PATH_INVALID("B70066", "工作区路径格式非法"),
    DELIVERY_WORKSPACE_REQUIRED("B70071", "用户未配置全局交付工作区"),
    GIT_CREDENTIAL_REQUIRED("B70072", "用户未配置有效 Git 凭证"),
    PROJECT_REPOSITORY_UNAVAILABLE("B70073", "项目 Git 仓未 clone 或不可访问"),
    PROJECT_REPOSITORY_BEHIND_REMOTE("B70074", "本地仓落后远端，需拉取最新提交"),
    PROJECT_REPOSITORY_DIRTY("B70075", "存在同需求未提交或未确认文件"),
    PROJECT_REPOSITORY_PUSH_FAILED("B70076", "Git push 失败或远端已更新"),
    ARTIFACT_SYNC_PATH_DENIED("B70077", "选择文件不在受控产物路径内"),
    PROJECT_REPOSITORY_IMMUTABLE("B70078", "项目 Git 仓地址创建后不可修改"),
    INTERNAL_ERROR("B70999", "系统异常");

    private final String code;
    private final String message;

    AiDeliveryErrorCode(String code, String message) {
        this.code = code;
        this.message = message;
    }
}
