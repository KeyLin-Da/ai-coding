package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.UserDeliveryWorkspaceMapper;
import com.opp.aidelivery.center.model.AiDeliveryConstants;
import com.opp.aidelivery.center.model.dto.DeliveryWorkspaceSaveRequest;
import com.opp.aidelivery.center.model.entity.UserDeliveryWorkspaceEntity;
import com.opp.aidelivery.center.model.vo.DeliveryWorkspaceVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class DeliveryWorkspaceService {

    private final PermissionService permissionService;
    private final UserDeliveryWorkspaceMapper workspaceMapper;

    public DeliveryWorkspaceVO get(Long userId, Long projectId) {
        permissionService.assertProjectMember(userId, projectId);
        UserDeliveryWorkspaceEntity entity = load(userId, projectId);
        return entity == null ? null : toVO(entity);
    }

    @Transactional(rollbackFor = Exception.class)
    public DeliveryWorkspaceVO save(Long userId, Long projectId, DeliveryWorkspaceSaveRequest request) {
        permissionService.assertProjectMember(userId, projectId);
        String localPath = normalizeLocalPath(request.getLocalPath());
        UserDeliveryWorkspaceEntity entity = load(userId, projectId);
        if (entity == null) {
            entity = new UserDeliveryWorkspaceEntity();
            entity.setUserId(userId);
            entity.setProjectId(projectId);
        }
        entity.setLocalPath(localPath);
        entity.setStatus(AiDeliveryConstants.STATUS_ACTIVE);
        if (entity.getId() == null) {
            workspaceMapper.insert(entity);
        } else {
            workspaceMapper.updateById(entity);
        }
        return toVO(entity);
    }

    private UserDeliveryWorkspaceEntity load(Long userId, Long projectId) {
        if (projectId == null) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "缺少项目ID");
        }
        return workspaceMapper.selectOne(new LambdaQueryWrapper<UserDeliveryWorkspaceEntity>()
            .eq(UserDeliveryWorkspaceEntity::getUserId, userId)
            .eq(UserDeliveryWorkspaceEntity::getProjectId, projectId)
            .eq(UserDeliveryWorkspaceEntity::getStatus, AiDeliveryConstants.STATUS_ACTIVE)
            .last("LIMIT 1"));
    }

    private String normalizeLocalPath(String localPath) {
        String value = localPath == null ? "" : localPath.trim();
        if (!isAbsolutePath(value)) {
            throw new BusinessException(AiDeliveryErrorCode.WORKSPACE_PATH_INVALID, "交付工作区路径必须是绝对路径");
        }
        return value;
    }

    private boolean isAbsolutePath(String value) {
        return value.startsWith("/")
            || value.matches("^[A-Za-z]:[\\\\/].*")
            || value.startsWith("\\\\");
    }

    private DeliveryWorkspaceVO toVO(UserDeliveryWorkspaceEntity entity) {
        DeliveryWorkspaceVO vo = new DeliveryWorkspaceVO();
        vo.setId(entity.getId());
        vo.setProjectId(entity.getProjectId());
        vo.setClientSessionId(entity.getClientSessionId());
        vo.setLocalPath(entity.getLocalPath());
        vo.setStatus(entity.getStatus());
        return vo;
    }
}
