package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.mapper.RequirementWorkspaceStateMapper;
import com.opp.aidelivery.center.mapper.UserMapper;
import com.opp.aidelivery.center.model.entity.ClientSessionEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.entity.RequirementWorkspaceStateEntity;
import com.opp.aidelivery.center.model.entity.UserEntity;
import java.time.LocalDateTime;
import java.util.Collections;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class RequirementWorkspaceStateServiceTest {

    @Mock
    private PermissionService permissionService;
    @Mock
    private ClientSessionService clientSessionService;
    @Mock
    private RequirementMapper requirementMapper;
    @Mock
    private RequirementWorkspaceStateMapper stateMapper;
    @Mock
    private UserMapper userMapper;
    @Mock
    private DomainEventService domainEventService;

    private RequirementWorkspaceStateService service;

    @BeforeEach
    void setUp() {
        service = new RequirementWorkspaceStateService(
            new AiDeliveryCenterProperties(),
            permissionService,
            clientSessionService,
            requirementMapper,
            stateMapper,
            userMapper,
            domainEventService,
            new ObjectMapper()
        );
    }

    @Test
    void assertWritableRejectsWhenAnotherUserHasDirtyRequirementWorkspace() {
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(clientSessionService.loadOwnedSession(1L, 11L)).thenReturn(new ClientSessionEntity());
        when(stateMapper.selectList(any()))
            .thenReturn(Collections.emptyList())
            .thenReturn(Collections.singletonList(dirtyState()));
        when(userMapper.selectById(2L)).thenReturn(user());

        assertThatThrownBy(() -> service.assertWritable(1L, 100L, 11L))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.PROJECT_REPOSITORY_DIRTY);
    }

    private RequirementEntity requirement() {
        RequirementEntity requirement = new RequirementEntity();
        requirement.setId(100L);
        requirement.setProjectId(10L);
        requirement.setRequirementId("172014");
        return requirement;
    }

    private RequirementWorkspaceStateEntity dirtyState() {
        RequirementWorkspaceStateEntity state = new RequirementWorkspaceStateEntity();
        state.setId(30L);
        state.setProjectId(10L);
        state.setRequirementPk(100L);
        state.setUserId(2L);
        state.setClientSessionId(22L);
        state.setStatus("DIRTY");
        state.setDirtyFileCount(2);
        state.setDirtyPathsSample("[\"docs/172014/prd/analysis.md\"]");
        state.setExpireAt(LocalDateTime.now().plusMinutes(5));
        return state;
    }

    private UserEntity user() {
        UserEntity user = new UserEntity();
        user.setId(2L);
        user.setDisplayName("张三");
        return user;
    }
}
