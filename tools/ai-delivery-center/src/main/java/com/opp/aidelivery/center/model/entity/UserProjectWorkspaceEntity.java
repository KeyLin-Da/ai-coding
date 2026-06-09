package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_user_project_workspace")
@EqualsAndHashCode(callSuper = true)
public class UserProjectWorkspaceEntity extends BaseEntity {

    private Long userId;
    private Long projectId;
    private Long clientSessionId;
    private String localPath;
    private String displayName;
    private Integer isDefault;
    private String status;
}
