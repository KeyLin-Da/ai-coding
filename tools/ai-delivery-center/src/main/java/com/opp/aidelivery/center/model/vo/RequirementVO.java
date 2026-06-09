package com.opp.aidelivery.center.model.vo;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class RequirementVO {

    private Long id;
    private Long projectId;
    private String requirementId;
    private String title;
    private String requirementType;
    private String branchName;
    private String status;
    private String currentStage;
    private Long version;
    private List<WorkflowStageVO> stages = new ArrayList<>();
    private List<String> projectNames = new ArrayList<>();
}
