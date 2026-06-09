package com.opp.aidelivery.center.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.vo.DomainEventVO;
import com.opp.aidelivery.center.model.vo.EventPageVO;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class EventQueryService {

    private final PermissionService permissionService;
    private final RequirementMapper requirementMapper;
    private final DomainEventService domainEventService;
    private final ObjectMapper objectMapper;

    public EventPageVO listAfter(Long userId, Long projectId, long afterEventId) {
        permissionService.assertProjectMember(userId, projectId);
        return domainEventService.listAfter(projectId, afterEventId);
    }

    public EventPageVO listAfter(Long userId, Long projectId, Long requirementPk, long afterEventId) {
        assertSubscription(userId, projectId, requirementPk);
        EventPageVO page = domainEventService.listAfter(projectId, afterEventId);
        if (requirementPk == null || page.isRefreshRequired()) {
            return page;
        }
        page.setEvents(page.getEvents().stream()
            .filter(event -> requirementPk.equals(extractRequirementPk(event)))
            .collect(Collectors.toList()));
        return page;
    }

    public void assertSubscription(Long userId, Long projectId, Long requirementPk) {
        permissionService.assertProjectMember(userId, projectId);
        if (requirementPk != null) {
            RequirementEntity requirement = requirementMapper.selectById(requirementPk);
            if (requirement == null || !projectId.equals(requirement.getProjectId())) {
                throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "需求不存在");
            }
        }
    }

    private Long extractRequirementPk(DomainEventVO event) {
        String payloadJson = event.getPayloadJson();
        if (payloadJson == null) {
            return null;
        }
        try {
            JsonNode requirementPk = objectMapper.readTree(payloadJson).path("requirementPk");
            return requirementPk.isNumber() ? requirementPk.asLong() : null;
        } catch (Exception exception) {
            return null;
        }
    }
}
