package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.UserProjectWorkspaceMapper;
import com.opp.aidelivery.center.model.AiDeliveryConstants;
import com.opp.aidelivery.center.model.dto.WorkspaceMappingSaveRequest;
import com.opp.aidelivery.center.model.entity.UserProjectWorkspaceEntity;
import com.opp.aidelivery.center.model.vo.WorkspaceMappingVO;
import java.util.List;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class WorkspaceMappingService {

    private final PermissionService permissionService;
    private final UserProjectWorkspaceMapper workspaceMapper;

    public List<WorkspaceMappingVO> list(Long userId, Long projectId) {
        permissionService.assertProjectMember(userId, projectId);
        return workspaceMapper.selectList(new LambdaQueryWrapper<UserProjectWorkspaceEntity>()
                .eq(UserProjectWorkspaceEntity::getUserId, userId)
                .eq(UserProjectWorkspaceEntity::getProjectId, projectId)
                .eq(UserProjectWorkspaceEntity::getStatus, AiDeliveryConstants.STATUS_ACTIVE)
                .orderByDesc(UserProjectWorkspaceEntity::getIsDefault)
                .orderByAsc(UserProjectWorkspaceEntity::getLocalPath))
            .stream()
            .map(this::toVO)
            .collect(Collectors.toList());
    }

    @Transactional(rollbackFor = Exception.class)
    public WorkspaceMappingVO save(Long userId, Long projectId, WorkspaceMappingSaveRequest request) {
        permissionService.assertProjectMember(userId, projectId);
        String localPath = normalizeLocalPath(request.getLocalPath());
        UserProjectWorkspaceEntity existing = workspaceMapper.selectOne(new LambdaQueryWrapper<UserProjectWorkspaceEntity>()
            .eq(UserProjectWorkspaceEntity::getUserId, userId)
            .eq(UserProjectWorkspaceEntity::getProjectId, projectId)
            .eq(UserProjectWorkspaceEntity::getLocalPath, localPath)
            .last("LIMIT 1"));
        UserProjectWorkspaceEntity entity = existing == null ? new UserProjectWorkspaceEntity() : existing;
        entity.setUserId(userId);
        entity.setProjectId(projectId);
        entity.setClientSessionId(request.getClientSessionId());
        entity.setLocalPath(localPath);
        entity.setDisplayName(normalizeDisplayName(request.getDisplayName(), localPath));
        entity.setIsDefault(Boolean.TRUE.equals(request.getIsDefault()) ? 1 : 0);
        entity.setStatus(AiDeliveryConstants.STATUS_ACTIVE);
        if (entity.getId() == null) {
            workspaceMapper.insert(entity);
        } else {
            workspaceMapper.updateById(entity);
        }
        return toVO(entity);
    }

    @Transactional(rollbackFor = Exception.class)
    public WorkspaceMappingVO disable(Long userId, Long projectId, Long mappingId) {
        permissionService.assertProjectMember(userId, projectId);
        UserProjectWorkspaceEntity entity = workspaceMapper.selectOne(new LambdaQueryWrapper<UserProjectWorkspaceEntity>()
            .eq(UserProjectWorkspaceEntity::getId, mappingId)
            .eq(UserProjectWorkspaceEntity::getUserId, userId)
            .eq(UserProjectWorkspaceEntity::getProjectId, projectId)
            .last("LIMIT 1"));
        if (entity == null) {
            throw new BusinessException(AiDeliveryErrorCode.WORKSPACE_PATH_DENIED, "工作区路径不存在或无权访问");
        }
        entity.setStatus(AiDeliveryConstants.STATUS_DISABLED);
        workspaceMapper.updateById(entity);
        return toVO(entity);
    }

    private String normalizeLocalPath(String localPath) {
        String value = localPath == null ? "" : localPath.trim();
        if (!isAbsolutePath(value)) {
            throw new BusinessException(AiDeliveryErrorCode.WORKSPACE_PATH_INVALID, "工作区路径必须是绝对路径");
        }
        return value;
    }

    private boolean isAbsolutePath(String value) {
        return value.startsWith("/")
            || value.matches("^[A-Za-z]:[\\\\/].*")
            || value.startsWith("\\\\");
    }

    private String normalizeDisplayName(String displayName, String localPath) {
        String value = displayName == null ? "" : displayName.trim();
        if (!value.isEmpty()) {
            return value;
        }
        String normalized = localPath.replace("\\", "/");
        int index = normalized.lastIndexOf('/');
        return index >= 0 ? normalized.substring(index + 1) : normalized;
    }

    private WorkspaceMappingVO toVO(UserProjectWorkspaceEntity entity) {
        WorkspaceMappingVO vo = new WorkspaceMappingVO();
        vo.setId(entity.getId());
        vo.setProjectId(entity.getProjectId());
        vo.setClientSessionId(entity.getClientSessionId());
        vo.setLocalPath(entity.getLocalPath());
        vo.setDisplayName(entity.getDisplayName());
        vo.setIsDefault(Integer.valueOf(1).equals(entity.getIsDefault()));
        vo.setStatus(entity.getStatus());
        return vo;
    }
}
