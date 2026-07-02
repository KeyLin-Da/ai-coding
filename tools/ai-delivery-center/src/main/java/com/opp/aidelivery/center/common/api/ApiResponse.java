package com.opp.aidelivery.center.common.api;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ApiResponse<T> {

    private boolean success;
    private String code;
    private String message;
    private T data;

    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, "0", "success", data);
    }

    public static <T> ApiResponse<T> fail(AiDeliveryErrorCode code, String message) {
        return new ApiResponse<>(false, code.getCode(), message, null);
    }

    public static <T> ApiResponse<T> fail(AiDeliveryErrorCode code, String message, T data) {
        return new ApiResponse<>(false, code.getCode(), message, data);
    }
}
