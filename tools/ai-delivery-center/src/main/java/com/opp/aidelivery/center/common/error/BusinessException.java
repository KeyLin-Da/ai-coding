package com.opp.aidelivery.center.common.error;

import lombok.Getter;

@Getter
public class BusinessException extends RuntimeException {

    private final AiDeliveryErrorCode errorCode;
    private final Object data;

    public BusinessException(AiDeliveryErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
        this.data = null;
    }

    public BusinessException(AiDeliveryErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
        this.data = null;
    }

    public BusinessException(AiDeliveryErrorCode errorCode, String message, Object data) {
        super(message);
        this.errorCode = errorCode;
        this.data = data;
    }
}
