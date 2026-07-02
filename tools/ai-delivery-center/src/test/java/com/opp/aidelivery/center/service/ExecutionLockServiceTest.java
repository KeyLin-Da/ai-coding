package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import com.opp.aidelivery.center.mapper.ExecutionLockMapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.model.dto.ExecutionLockAcquireRequest;
import com.opp.aidelivery.center.model.entity.ClientSessionEntity;
import com.opp.aidelivery.center.model.entity.ExecutionLockEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import java.time.LocalDateTime;
import java.util.Collections;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ExecutionLockServiceTest {

    @Mock
    private PermissionService permissionService;
    @Mock
    private ClientSessionService clientSessionService;
    @Mock
    private RequirementMapper requirementMapper;
    @Mock
    private ExecutionLockMapper executionLockMapper;
    @Mock
    private DomainEventService domainEventService;

    private ExecutionLockService executionLockService;

    @BeforeEach
    void setUp() {
        executionLockService = new ExecutionLockService(
            new AiDeliveryCenterProperties(),
            permissionService,
            clientSessionService,
            requirementMapper,
            executionLockMapper,
            domainEventService
        );
    }

    @Test
    void acquireRejectsLockHeldByAnotherOnlineUser() {
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(clientSessionService.loadOwnedSession(1L, 3L)).thenReturn(new ClientSessionEntity());
        when(executionLockMapper.selectOne(any())).thenReturn(lock(55L, 2L, "ACTIVE", LocalDateTime.now().plusMinutes(1)));

        assertThatThrownBy(() -> executionLockService.acquire(1L, acquireRequest()))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.EXECUTION_LOCK_CONFLICT);

        verify(executionLockMapper, never()).insert(any());
    }

    @Test
    void acquireReusesExpiredScopedLockInsteadOfInsertingDuplicateUniqueKey() {
        ExecutionLockEntity expired = lock(55L, 2L, "ACTIVE", LocalDateTime.now().minusMinutes(1));
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(clientSessionService.loadOwnedSession(1L, 3L)).thenReturn(new ClientSessionEntity());
        when(executionLockMapper.selectOne(any())).thenReturn(expired);

        assertThat(executionLockService.acquire(1L, acquireRequest()).getHolderUserId()).isEqualTo(1L);

        verify(executionLockMapper, never()).insert(any());
        verify(executionLockMapper, atLeast(2)).updateById(expired);
        verify(domainEventService).publishAfterCommit(eq(10L), eq("execution.lock.updated"), eq("EXECUTION_LOCK"), eq(55L), contains("\"status\":\"EXPIRED\""));
        verify(domainEventService).publishAfterCommit(eq(10L), eq("execution.lock.updated"), eq("EXECUTION_LOCK"), eq(55L), contains("\"status\":\"ACTIVE\""));
    }

    @Test
    void expireLocksPublishesStatusChange() {
        ExecutionLockEntity lock = lock(55L, 1L, "ACTIVE", LocalDateTime.now().minusMinutes(1));
        when(executionLockMapper.selectList(any())).thenReturn(Collections.singletonList(lock));
        when(requirementMapper.selectById(100L)).thenReturn(requirement());

        executionLockService.expireLocks();

        assertThat(lock.getStatus()).isEqualTo("EXPIRED");
        verify(domainEventService).publishAfterCommit(eq(10L), eq("execution.lock.updated"), eq("EXECUTION_LOCK"), eq(55L), contains("\"status\":\"EXPIRED\""));
    }

    private ExecutionLockAcquireRequest acquireRequest() {
        ExecutionLockAcquireRequest request = new ExecutionLockAcquireRequest();
        request.setRequirementPk(100L);
        request.setStage("tech_design");
        request.setActionType("design_generate");
        request.setClientSessionId(3L);
        return request;
    }

    private ExecutionLockEntity lock(Long id, Long holderUserId, String status, LocalDateTime expireAt) {
        ExecutionLockEntity lock = new ExecutionLockEntity();
        lock.setId(id);
        lock.setRequirementPk(100L);
        lock.setStage("TECH_DESIGN");
        lock.setActionType("DESIGN_GENERATE");
        lock.setHolderUserId(holderUserId);
        lock.setClientSessionId(3L);
        lock.setExpireAt(expireAt);
        lock.setStatus(status);
        return lock;
    }

    private RequirementEntity requirement() {
        RequirementEntity requirement = new RequirementEntity();
        requirement.setId(100L);
        requirement.setProjectId(10L);
        return requirement;
    }
}
