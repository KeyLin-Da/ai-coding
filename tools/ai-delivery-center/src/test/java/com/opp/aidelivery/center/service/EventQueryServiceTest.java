package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class EventQueryServiceTest {

    @Mock
    private PermissionService permissionService;
    @Mock
    private RequirementMapper requirementMapper;
    @Mock
    private DomainEventService domainEventService;
    @Mock
    private RealtimeEventBroker realtimeEventBroker;

    private EventQueryService eventQueryService;

    @BeforeEach
    void setUp() {
        eventQueryService = new EventQueryService(permissionService, requirementMapper, domainEventService, realtimeEventBroker);
    }

    @Test
    void listAfterRejectsUnauthorizedProjectBeforeReadingEvents() {
        org.mockito.Mockito.doThrow(new BusinessException(AiDeliveryErrorCode.ACCESS_DENIED))
            .when(permissionService).assertProjectMember(2L, 10L);

        assertThatThrownBy(() -> eventQueryService.listAfter(2L, 10L, 100L))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.ACCESS_DENIED);

        verify(domainEventService, never()).listAfter(10L, 100L);
    }
}
