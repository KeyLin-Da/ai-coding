package com.opp.aidelivery.center.model.dto;

import lombok.Data;

@Data
public class TechDesignAnnotationStatusRequest {

    private String status;
    private Boolean includeInNextGeneration;
}
