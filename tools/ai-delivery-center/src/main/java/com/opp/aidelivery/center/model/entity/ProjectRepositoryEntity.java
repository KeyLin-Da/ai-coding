package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_project_repository")
@EqualsAndHashCode(callSuper = true)
public class ProjectRepositoryEntity extends BaseEntity {

    private Long projectId;
    private String provider;
    private String repoUrl;
    private String defaultBranch;
    private String repoCode;
    private String status;
}
