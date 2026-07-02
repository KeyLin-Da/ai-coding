package com.opp.aidelivery.center.model.vo;

import java.util.LinkedHashMap;
import java.util.Map;
import lombok.Data;

@Data
public class PreflightCheckVO {

    private String name;
    private String status;
    private String message;
    private Map<String, Object> details = new LinkedHashMap<>();
}
