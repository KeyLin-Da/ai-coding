package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_requirement_workspace_state")
@EqualsAndHashCode(callSuper = true)
public class RequirementWorkspaceStateEntity extends BaseEntity {

    private Long projectId;
    private Long requirementPk;
    private Long userId;
    private Long clientSessionId;
    private String status;
    private Integer dirtyFileCount;
    private String dirtyPathsSample;
    private String headCommit;
    private String remoteCommit;
    private LocalDateTime firstDirtyAt;
    private LocalDateTime lastReportedAt;
    private LocalDateTime expireAt;
}
