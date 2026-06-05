package com.opp.aidelivery.center.service;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.vo.EventPageVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
@RequiredArgsConstructor
public class EventQueryService {

    private final PermissionService permissionService;
    private final RequirementMapper requirementMapper;
    private final DomainEventService domainEventService;
    private final RealtimeEventBroker realtimeEventBroker;

    public EventPageVO listAfter(Long userId, Long projectId, long afterEventId) {
        permissionService.assertProjectMember(userId, projectId);
        return domainEventService.listAfter(projectId, afterEventId);
    }

    public SseEmitter subscribe(Long userId, Long projectId, Long requirementPk) {
        permissionService.assertProjectMember(userId, projectId);
        if (requirementPk != null) {
            RequirementEntity requirement = requirementMapper.selectById(requirementPk);
            if (requirement == null || !projectId.equals(requirement.getProjectId())) {
                throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "需求不存在");
            }
        }
        return realtimeEventBroker.subscribeDomain(projectId, requirementPk);
    }
}
