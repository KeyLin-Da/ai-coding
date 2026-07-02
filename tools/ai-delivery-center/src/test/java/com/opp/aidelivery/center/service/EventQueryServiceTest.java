package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.vo.DomainEventVO;
import com.opp.aidelivery.center.model.vo.EventPageVO;
import java.util.Arrays;
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

    private EventQueryService eventQueryService;

    @BeforeEach
    void setUp() {
        eventQueryService = new EventQueryService(permissionService, requirementMapper, domainEventService, new ObjectMapper());
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

    @Test
    void listAfterFiltersRequirementCompensationEvents() {
        EventPageVO page = new EventPageVO();
        page.setEvents(Arrays.asList(event(101L, 100L), event(102L, 200L)));
        page.setNextEventId(102L);
        RequirementEntity requirement = new RequirementEntity();
        requirement.setId(100L);
        requirement.setProjectId(10L);
        when(requirementMapper.selectById(100L)).thenReturn(requirement);
        when(domainEventService.listAfter(10L, 99L)).thenReturn(page);

        EventPageVO result = eventQueryService.listAfter(1L, 10L, 100L, 99L);

        assertThat(result.getEvents()).extracting("eventId").containsExactly(101L);
        assertThat(result.getNextEventId()).isEqualTo(102L);
    }

    private DomainEventVO event(Long eventId, Long requirementPk) {
        DomainEventVO event = new DomainEventVO();
        event.setProjectId(10L);
        event.setEventId(eventId);
        event.setPayloadJson("{\"requirementPk\":" + requirementPk + "}");
        return event;
    }
}
