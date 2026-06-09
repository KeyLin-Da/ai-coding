package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import com.opp.aidelivery.center.mapper.ExecutionLockMapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.model.dto.ExecutionLockAcquireRequest;
import com.opp.aidelivery.center.model.dto.ExecutionLockReleaseRequest;
import com.opp.aidelivery.center.model.dto.ExecutionLockRenewRequest;
import com.opp.aidelivery.center.model.entity.ExecutionLockEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.vo.ExecutionLockVO;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ExecutionLockService {

    private final AiDeliveryCenterProperties properties;
    private final PermissionService permissionService;
    private final ClientSessionService clientSessionService;
    private final RequirementMapper requirementMapper;
    private final ExecutionLockMapper executionLockMapper;
    private final DomainEventService domainEventService;

    @Transactional(rollbackFor = Exception.class)
    public ExecutionLockVO acquire(Long userId, ExecutionLockAcquireRequest request) {
        String stage = normalize(request.getStage());
        String actionType = normalize(request.getActionType());
        RequirementEntity requirement = loadRequirement(userId, request.getRequirementPk());
        clientSessionService.loadOwnedSession(userId, request.getClientSessionId());
        ExecutionLockEntity existing = scopedLock(request.getRequirementPk(), stage, actionType);
        if (existing != null && "ACTIVE".equals(existing.getStatus()) && isExpired(existing)) {
            existing.setStatus("EXPIRED");
            executionLockMapper.updateById(existing);
            publishLockEvent(requirement, existing);
        }
        if (existing != null && "ACTIVE".equals(existing.getStatus()) && !userId.equals(existing.getHolderUserId())) {
            throw new BusinessException(AiDeliveryErrorCode.EXECUTION_LOCK_CONFLICT);
        }
        ExecutionLockEntity lock = existing == null ? new ExecutionLockEntity() : existing;
        lock.setRequirementPk(request.getRequirementPk());
        lock.setStage(stage);
        lock.setActionType(actionType);
        lock.setHolderUserId(userId);
        lock.setClientSessionId(request.getClientSessionId());
        lock.setExpireAt(LocalDateTime.now().plus(properties.getWebsocket().getSessionIdleTimeout()));
        lock.setStatus("ACTIVE");
        if (existing == null) {
            executionLockMapper.insert(lock);
        } else {
            executionLockMapper.updateById(lock);
        }
        publishLockEvent(requirement, lock);
        return toVO(lock);
    }

    @Transactional(rollbackFor = Exception.class)
    public ExecutionLockVO renew(Long userId, ExecutionLockRenewRequest request) {
        ExecutionLockEntity lock = loadOwnedActiveLock(userId, request.getLockId(), request.getClientSessionId());
        lock.setExpireAt(LocalDateTime.now().plus(properties.getWebsocket().getSessionIdleTimeout()));
        executionLockMapper.updateById(lock);
        RequirementEntity requirement = loadRequirement(userId, lock.getRequirementPk());
        publishLockEvent(requirement, lock);
        return toVO(lock);
    }

    @Transactional(rollbackFor = Exception.class)
    public ExecutionLockVO release(Long userId, ExecutionLockReleaseRequest request) {
        ExecutionLockEntity lock = loadOwnedActiveLock(userId, request.getLockId(), request.getClientSessionId());
        lock.setStatus("RELEASED");
        executionLockMapper.updateById(lock);
        RequirementEntity requirement = loadRequirement(userId, lock.getRequirementPk());
        publishLockEvent(requirement, lock);
        return toVO(lock);
    }

    @Scheduled(fixedDelay = 30000)
    @Transactional(rollbackFor = Exception.class)
    public void expireLocks() {
        LocalDateTime now = LocalDateTime.now();
        for (ExecutionLockEntity lock : executionLockMapper.selectList(new LambdaQueryWrapper<ExecutionLockEntity>()
            .eq(ExecutionLockEntity::getStatus, "ACTIVE")
            .lt(ExecutionLockEntity::getExpireAt, now))) {
            lock.setStatus("EXPIRED");
            executionLockMapper.updateById(lock);
            RequirementEntity requirement = requirementMapper.selectById(lock.getRequirementPk());
            if (requirement != null) {
                publishLockEvent(requirement, lock);
            }
        }
    }

    private ExecutionLockEntity scopedLock(Long requirementPk, String stage, String actionType) {
        return executionLockMapper.selectOne(new LambdaQueryWrapper<ExecutionLockEntity>()
            .eq(ExecutionLockEntity::getRequirementPk, requirementPk)
            .eq(ExecutionLockEntity::getStage, stage)
            .eq(ExecutionLockEntity::getActionType, actionType)
            .last("LIMIT 1"));
    }

    private boolean isExpired(ExecutionLockEntity lock) {
        return lock.getExpireAt() != null && lock.getExpireAt().isBefore(LocalDateTime.now());
    }

    private ExecutionLockEntity loadOwnedActiveLock(Long userId, Long lockId, Long clientSessionId) {
        ExecutionLockEntity lock = executionLockMapper.selectById(lockId);
        if (lock == null || !"ACTIVE".equals(lock.getStatus())) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "执行占用不存在或已释放");
        }
        if (!userId.equals(lock.getHolderUserId()) || !clientSessionId.equals(lock.getClientSessionId())) {
            throw new BusinessException(AiDeliveryErrorCode.ACCESS_DENIED, "执行占用不属于当前客户端");
        }
        return lock;
    }

    private RequirementEntity loadRequirement(Long userId, Long requirementPk) {
        RequirementEntity requirement = requirementMapper.selectById(requirementPk);
        if (requirement == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "需求不存在");
        }
        permissionService.assertProjectMember(userId, requirement.getProjectId());
        return requirement;
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toUpperCase();
    }

    private void publishLockEvent(RequirementEntity requirement, ExecutionLockEntity lock) {
        domainEventService.publishAfterCommit(
            requirement.getProjectId(),
            "execution.lock.updated",
            "EXECUTION_LOCK",
            lock.getId(),
            "{\"requirementPk\":" + requirement.getId()
                + ",\"stage\":\"" + lock.getStage()
                + "\",\"actionType\":\"" + lock.getActionType()
                + "\",\"holderUserId\":" + lock.getHolderUserId()
                + ",\"clientSessionId\":" + lock.getClientSessionId()
                + ",\"status\":\"" + lock.getStatus() + "\"}"
        );
    }

    private ExecutionLockVO toVO(ExecutionLockEntity lock) {
        ExecutionLockVO vo = new ExecutionLockVO();
        vo.setId(lock.getId());
        vo.setRequirementPk(lock.getRequirementPk());
        vo.setStage(lock.getStage());
        vo.setActionType(lock.getActionType());
        vo.setHolderUserId(lock.getHolderUserId());
        vo.setClientSessionId(lock.getClientSessionId());
        vo.setExpireAt(lock.getExpireAt());
        vo.setStatus(lock.getStatus());
        return vo;
    }
}
