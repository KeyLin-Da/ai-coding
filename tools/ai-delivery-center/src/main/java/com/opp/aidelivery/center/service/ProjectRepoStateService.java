package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.UserProjectRepoStateMapper;
import com.opp.aidelivery.center.model.dto.ProjectRepoStateUpdateRequest;
import com.opp.aidelivery.center.model.entity.UserProjectRepoStateEntity;
import com.opp.aidelivery.center.model.vo.ProjectRepoStateVO;
import java.time.LocalDateTime;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ProjectRepoStateService {

    private final PermissionService permissionService;
    private final UserProjectRepoStateMapper repoStateMapper;
    private final DomainEventService domainEventService;

    public ProjectRepoStateVO get(Long userId, Long projectId, Long clientSessionId) {
        permissionService.assertProjectMember(userId, projectId);
        UserProjectRepoStateEntity entity = load(userId, projectId, clientSessionId);
        return entity == null ? null : toVO(entity);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProjectRepoStateVO update(Long userId, Long projectId, ProjectRepoStateUpdateRequest request) {
        permissionService.assertProjectMember(userId, projectId);
        UserProjectRepoStateEntity entity = load(userId, projectId, request.getClientSessionId());
        if (entity == null) {
            entity = new UserProjectRepoStateEntity();
            entity.setUserId(userId);
            entity.setProjectId(projectId);
            entity.setClientSessionId(request.getClientSessionId());
        }
        entity.setLocalRepoPath(normalizeLocalPath(request.getLocalRepoPath()));
        entity.setCurrentBranch(blankToNull(request.getCurrentBranch()));
        entity.setHeadCommit(blankToNull(request.getHeadCommit()));
        entity.setRemoteCommit(blankToNull(request.getRemoteCommit()));
        entity.setSyncStatus(normalizeSyncStatus(request.getSyncStatus()));
        entity.setLastCheckedAt(LocalDateTime.now());
        if (entity.getId() == null) {
            repoStateMapper.insert(entity);
        } else {
            repoStateMapper.updateById(entity);
        }
        publishRepoStateEvents(userId, projectId, entity);
        return toVO(entity);
    }

    private void publishRepoStateEvents(Long userId, Long projectId, UserProjectRepoStateEntity entity) {
        String payload = "{\"userId\":" + userId
            + ",\"clientSessionId\":" + entity.getClientSessionId()
            + ",\"syncStatus\":\"" + entity.getSyncStatus()
            + "\",\"headCommit\":\"" + blankToEmpty(entity.getHeadCommit())
            + "\",\"remoteCommit\":\"" + blankToEmpty(entity.getRemoteCommit()) + "\"}";
        domainEventService.publishAfterCommit(
            projectId,
            "project.repo.state-changed",
            "PROJECT",
            projectId,
            payload
        );
        if ("BEHIND_REMOTE".equals(entity.getSyncStatus())) {
            domainEventService.publishAfterCommit(
                projectId,
                "project.repo.pull-required",
                "PROJECT",
                projectId,
                payload
            );
        }
    }

    private UserProjectRepoStateEntity load(Long userId, Long projectId, Long clientSessionId) {
        if (clientSessionId == null) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "缺少客户端会话ID");
        }
        return repoStateMapper.selectOne(new LambdaQueryWrapper<UserProjectRepoStateEntity>()
            .eq(UserProjectRepoStateEntity::getUserId, userId)
            .eq(UserProjectRepoStateEntity::getProjectId, projectId)
            .eq(UserProjectRepoStateEntity::getClientSessionId, clientSessionId)
            .last("LIMIT 1"));
    }

    private String normalizeLocalPath(String localPath) {
        String value = localPath == null ? "" : localPath.trim();
        if (!isAbsolutePath(value)) {
            throw new BusinessException(AiDeliveryErrorCode.WORKSPACE_PATH_INVALID, "项目仓路径必须是绝对路径");
        }
        return value;
    }

    private boolean isAbsolutePath(String value) {
        return value.startsWith("/")
            || value.matches("^[A-Za-z]:[\\\\/].*")
            || value.startsWith("\\\\");
    }

    private String normalizeSyncStatus(String syncStatus) {
        String value = syncStatus == null ? "" : syncStatus.trim().toUpperCase(Locale.ROOT);
        if (value.isEmpty()) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "项目仓同步状态不能为空");
        }
        return value;
    }

    private String blankToNull(String value) {
        String normalized = value == null ? "" : value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String blankToEmpty(String value) {
        String normalized = value == null ? "" : value.trim();
        return normalized;
    }

    private ProjectRepoStateVO toVO(UserProjectRepoStateEntity entity) {
        ProjectRepoStateVO vo = new ProjectRepoStateVO();
        vo.setId(entity.getId());
        vo.setProjectId(entity.getProjectId());
        vo.setClientSessionId(entity.getClientSessionId());
        vo.setLocalRepoPath(entity.getLocalRepoPath());
        vo.setCurrentBranch(entity.getCurrentBranch());
        vo.setHeadCommit(entity.getHeadCommit());
        vo.setRemoteCommit(entity.getRemoteCommit());
        vo.setSyncStatus(entity.getSyncStatus());
        vo.setLastCheckedAt(entity.getLastCheckedAt());
        return vo;
    }
}
