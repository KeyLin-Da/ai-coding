package com.opp.aidelivery.center.model.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class TechDesignAnnotationAnchorRequest {

    private Integer plainStart;
    private Integer plainEnd;
    private String prefixText;
    private String suffixText;
    private List<String> headingPath = new ArrayList<>();
    private Integer occurrence;
}
