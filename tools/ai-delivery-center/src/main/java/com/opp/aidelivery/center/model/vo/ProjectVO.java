package com.opp.aidelivery.center.model.vo;

import lombok.Data;

@Data
public class ProjectVO {

    private Long id;
    private String name;
    private String code;
    private String status;
    private String role;
    private Boolean selected;
    private ProjectRepositoryVO repository;
}
