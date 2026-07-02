package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.mapper.RequirementWorkspaceStateMapper;
import com.opp.aidelivery.center.mapper.UserMapper;
import com.opp.aidelivery.center.model.dto.RequirementWorkspaceStateReportRequest;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.entity.RequirementWorkspaceStateEntity;
import com.opp.aidelivery.center.model.entity.UserEntity;
import com.opp.aidelivery.center.model.vo.RequirementWorkspaceStateVO;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class RequirementWorkspaceStateService {

    private static final Set<String> BLOCKING_STATUSES = Collections.unmodifiableSet(
        new HashSet<>(Arrays.asList("EDITING", "DIRTY", "SYNCING"))
    );
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<List<String>>() {
    };

    private final AiDeliveryCenterProperties properties;
    private final PermissionService permissionService;
    private final ClientSessionService clientSessionService;
    private final RequirementMapper requirementMapper;
    private final RequirementWorkspaceStateMapper stateMapper;
    private final UserMapper userMapper;
    private final DomainEventService domainEventService;
    private final ObjectMapper objectMapper;

    @Transactional(rollbackFor = Exception.class)
    public RequirementWorkspaceStateVO report(Long userId, Long requirementPk, RequirementWorkspaceStateReportRequest request) {
        RequirementEntity requirement = loadRequirement(userId, requirementPk);
        clientSessionService.loadOwnedSession(userId, request.getClientSessionId());
        expireRequirementStates(requirementPk);

        RequirementWorkspaceStateEntity entity = stateMapper.selectOne(new LambdaQueryWrapper<RequirementWorkspaceStateEntity>()
            .eq(RequirementWorkspaceStateEntity::getRequirementPk, requirementPk)
            .eq(RequirementWorkspaceStateEntity::getUserId, userId)
            .eq(RequirementWorkspaceStateEntity::getClientSessionId, request.getClientSessionId())
            .last("LIMIT 1"));
        LocalDateTime now = LocalDateTime.now();
        String status = normalizeStatus(request.getStatus());
        if (entity == null) {
            entity = new RequirementWorkspaceStateEntity();
            entity.setProjectId(requirement.getProjectId());
            entity.setRequirementPk(requirement.getId());
            entity.setUserId(userId);
            entity.setClientSessionId(request.getClientSessionId());
        }
        boolean wasClean = entity.getStatus() == null || "CLEAN".equals(entity.getStatus()) || "EXPIRED".equals(entity.getStatus());
        entity.setProjectId(requirement.getProjectId());
        entity.setStatus(status);
        entity.setDirtyFileCount(normalizeDirtyFileCount(request.getDirtyFileCount(), status));
        entity.setDirtyPathsSample(writePaths(request.getDirtyPathsSample()));
        entity.setHeadCommit(blankToNull(request.getHeadCommit()));
        entity.setRemoteCommit(blankToNull(request.getRemoteCommit()));
        entity.setLastReportedAt(now);
        entity.setExpireAt(now.plus(properties.getWebsocket().getSessionIdleTimeout()));
        if (BLOCKING_STATUSES.contains(status) && wasClean) {
            entity.setFirstDirtyAt(now);
        }
        if ("CLEAN".equals(status)) {
            entity.setFirstDirtyAt(null);
            entity.setExpireAt(now.plus(properties.getWebsocket().getSessionIdleTimeout()));
        }
        if (entity.getId() == null) {
            stateMapper.insert(entity);
        } else {
            stateMapper.updateById(entity);
        }
        publishStateEvent(requirement, entity);
        return toVO(entity);
    }

    public List<RequirementWorkspaceStateVO> listActive(Long userId, Long requirementPk) {
        RequirementEntity requirement = loadRequirement(userId, requirementPk);
        expireRequirementStates(requirementPk);
        return activeStates(requirementPk).stream().map(this::toVO).collect(Collectors.toList());
    }

    public List<RequirementWorkspaceStateVO> assertWritable(Long userId, Long requirementPk, Long clientSessionId) {
        RequirementEntity requirement = loadRequirement(userId, requirementPk);
        clientSessionService.loadOwnedSession(userId, clientSessionId);
        expireRequirementStates(requirementPk);
        List<RequirementWorkspaceStateVO> blockers = activeStates(requirementPk).stream()
            .filter(item -> !userId.equals(item.getUserId()))
            .map(this::toVO)
            .collect(Collectors.toList());
        if (!blockers.isEmpty()) {
            String users = blockers.stream()
                .map(item -> item.getUserDisplayName() == null ? String.valueOf(item.getUserId()) : item.getUserDisplayName())
                .distinct()
                .collect(Collectors.joining("、"));
            throw new BusinessException(
                AiDeliveryErrorCode.PROJECT_REPOSITORY_DIRTY,
                "需求正在被其他用户编辑，暂不能执行工作流变更：" + users,
                blockers
            );
        }
        return Collections.emptyList();
    }

    @Scheduled(fixedDelay = 30000)
    @Transactional(rollbackFor = Exception.class)
    public void expireStates() {
        LocalDateTime now = LocalDateTime.now();
        List<RequirementWorkspaceStateEntity> states = stateMapper.selectList(new LambdaQueryWrapper<RequirementWorkspaceStateEntity>()
            .in(RequirementWorkspaceStateEntity::getStatus, BLOCKING_STATUSES)
            .lt(RequirementWorkspaceStateEntity::getExpireAt, now));
        for (RequirementWorkspaceStateEntity state : states) {
            state.setStatus("EXPIRED");
            stateMapper.updateById(state);
            RequirementEntity requirement = requirementMapper.selectById(state.getRequirementPk());
            if (requirement != null) {
                publishStateEvent(requirement, state);
            }
        }
    }

    private RequirementEntity loadRequirement(Long userId, Long requirementPk) {
        RequirementEntity requirement = requirementMapper.selectById(requirementPk);
        if (requirement == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "需求不存在");
        }
        permissionService.assertProjectMember(userId, requirement.getProjectId());
        return requirement;
    }

    private void expireRequirementStates(Long requirementPk) {
        LocalDateTime now = LocalDateTime.now();
        for (RequirementWorkspaceStateEntity state : stateMapper.selectList(new LambdaQueryWrapper<RequirementWorkspaceStateEntity>()
            .eq(RequirementWorkspaceStateEntity::getRequirementPk, requirementPk)
            .in(RequirementWorkspaceStateEntity::getStatus, BLOCKING_STATUSES)
            .lt(RequirementWorkspaceStateEntity::getExpireAt, now))) {
            state.setStatus("EXPIRED");
            stateMapper.updateById(state);
            RequirementEntity requirement = requirementMapper.selectById(state.getRequirementPk());
            if (requirement != null) {
                publishStateEvent(requirement, state);
            }
        }
    }

    private List<RequirementWorkspaceStateEntity> activeStates(Long requirementPk) {
        return stateMapper.selectList(new LambdaQueryWrapper<RequirementWorkspaceStateEntity>()
            .eq(RequirementWorkspaceStateEntity::getRequirementPk, requirementPk)
            .in(RequirementWorkspaceStateEntity::getStatus, BLOCKING_STATUSES)
            .ge(RequirementWorkspaceStateEntity::getExpireAt, LocalDateTime.now()));
    }

    private String normalizeStatus(String status) {
        String value = status == null ? "" : status.trim().toUpperCase(Locale.ROOT);
        if (!Arrays.asList("CLEAN", "EDITING", "DIRTY", "SYNCING", "EXPIRED").contains(value)) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "需求本地工作区状态非法: " + status);
        }
        return value;
    }

    private int normalizeDirtyFileCount(Integer count, String status) {
        if ("CLEAN".equals(status) || "EXPIRED".equals(status)) {
            return 0;
        }
        return Math.max(0, count == null ? 0 : count);
    }

    private String writePaths(List<String> paths) {
        List<String> normalized = paths == null ? Collections.emptyList() : paths.stream()
            .filter(item -> item != null && !item.trim().isEmpty())
            .map(item -> item.trim())
            .limit(20)
            .collect(Collectors.toList());
        try {
            return objectMapper.writeValueAsString(normalized);
        } catch (Exception exception) {
            return "[]";
        }
    }

    private List<String> readPaths(String value) {
        if (value == null || value.trim().isEmpty()) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readValue(value, STRING_LIST);
        } catch (Exception exception) {
            return Collections.emptyList();
        }
    }

    private RequirementWorkspaceStateVO toVO(RequirementWorkspaceStateEntity entity) {
        RequirementWorkspaceStateVO vo = new RequirementWorkspaceStateVO();
        vo.setId(entity.getId());
        vo.setProjectId(entity.getProjectId());
        vo.setRequirementPk(entity.getRequirementPk());
        vo.setUserId(entity.getUserId());
        UserEntity user = userMapper.selectById(entity.getUserId());
        vo.setUserDisplayName(user == null ? null : user.getDisplayName());
        vo.setClientSessionId(entity.getClientSessionId());
        vo.setStatus(entity.getStatus());
        vo.setDirtyFileCount(entity.getDirtyFileCount());
        vo.setDirtyPathsSample(readPaths(entity.getDirtyPathsSample()));
        vo.setHeadCommit(entity.getHeadCommit());
        vo.setRemoteCommit(entity.getRemoteCommit());
        vo.setFirstDirtyAt(entity.getFirstDirtyAt());
        vo.setLastReportedAt(entity.getLastReportedAt());
        vo.setExpireAt(entity.getExpireAt());
        return vo;
    }

    private void publishStateEvent(RequirementEntity requirement, RequirementWorkspaceStateEntity state) {
        RequirementWorkspaceStateVO vo = toVO(state);
        domainEventService.publishAfterCommit(
            requirement.getProjectId(),
            "requirement.workspace-state.updated",
            "REQUIREMENT",
            requirement.getId(),
            "{\"requirementPk\":" + requirement.getId()
                + ",\"userId\":" + state.getUserId()
                + ",\"userDisplayName\":\"" + escapeJson(vo.getUserDisplayName())
                + "\",\"clientSessionId\":" + state.getClientSessionId()
                + ",\"status\":\"" + state.getStatus()
                + "\",\"dirtyFileCount\":" + (state.getDirtyFileCount() == null ? 0 : state.getDirtyFileCount())
                + ",\"lastReportedAt\":\"" + (state.getLastReportedAt() == null ? "" : state.getLastReportedAt())
                + "\"}"
        );
    }

    private String blankToNull(String value) {
        String normalized = value == null ? "" : value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String escapeJson(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
