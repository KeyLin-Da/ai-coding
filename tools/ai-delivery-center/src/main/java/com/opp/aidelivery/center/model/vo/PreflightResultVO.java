package com.opp.aidelivery.center.model.vo;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class PreflightResultVO {

    private String overallStatus;
    private List<PreflightCheckVO> checks = new ArrayList<>();
}
