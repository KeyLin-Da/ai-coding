package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_user_project_repo_state")
@EqualsAndHashCode(callSuper = true)
public class UserProjectRepoStateEntity extends BaseEntity {

    private Long userId;
    private Long projectId;
    private Long clientSessionId;
    private String localRepoPath;
    private String currentBranch;
    private String headCommit;
    private String remoteCommit;
    private String syncStatus;
    private LocalDateTime lastCheckedAt;
}
