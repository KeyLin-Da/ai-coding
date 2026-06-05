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
    COS_UPLOAD_SESSION_EXPIRED("B70031", "COS 上传会话已过期"),
    JOB_LEASE_EXPIRED("B70040", "Job 租约已失效"),
    JOB_ALREADY_CLAIMED("B70041", "Job 已被其他客户端领取"),
    EVENT_HISTORY_EXPIRED("B70050", "事件历史已过期"),
    INTERNAL_ERROR("B70999", "系统异常");

    private final String code;
    private final String message;

    AiDeliveryErrorCode(String code, String message) {
        this.code = code;
        this.message = message;
    }
}
