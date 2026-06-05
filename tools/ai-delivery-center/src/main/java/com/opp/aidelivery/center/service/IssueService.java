package com.opp.aidelivery.center.service;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.IssueMapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.model.dto.IssueCreateRequest;
import com.opp.aidelivery.center.model.dto.IssueStatusUpdateRequest;
import com.opp.aidelivery.center.model.entity.IssueEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.vo.IssueVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class IssueService {

    private final PermissionService permissionService;
    private final IssueMapper issueMapper;
    private final RequirementMapper requirementMapper;
    private final DomainEventService domainEventService;

    @Transactional(rollbackFor = Exception.class)
    public IssueVO create(Long userId, IssueCreateRequest request) {
        RequirementEntity requirement = requirementMapper.selectById(request.getRequirementPk());
        if (requirement == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "需求不存在");
        }
        permissionService.assertProjectMember(userId, requirement.getProjectId());
        IssueEntity issue = new IssueEntity();
        issue.setRequirementPk(requirement.getId());
        issue.setSeverity(normalizeSeverity(request.getSeverity()));
        issue.setStatus("OPEN");
        issue.setTitle(request.getTitle());
        issue.setRecommendation(request.getRecommendation());
        issue.setSourceArtifactVersionId(request.getSourceArtifactVersionId());
        issue.setAssigneeId(request.getAssigneeId());
        issueMapper.insert(issue);
        publishIssueEvent(requirement, issue, "issue.created");
        return toVO(issue);
    }

    @Transactional(rollbackFor = Exception.class)
    public IssueVO updateStatus(Long userId, Long issueId, IssueStatusUpdateRequest request) {
        IssueEntity issue = issueMapper.selectById(issueId);
        if (issue == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "问题不存在");
        }
        RequirementEntity requirement = requirementMapper.selectById(issue.getRequirementPk());
        if (requirement == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "需求不存在");
        }
        permissionService.assertProjectMember(userId, requirement.getProjectId());
        issue.setStatus(normalizeStatus(request.getStatus()));
        issueMapper.updateById(issue);
        publishIssueEvent(requirement, issue, "issue.status.changed");
        return toVO(issue);
    }

    private String normalizeStatus(String status) {
        if ("FIXED".equals(status) || "ACCEPTED".equals(status) || "INVALID".equals(status)) {
            return status;
        }
        return "OPEN";
    }

    private String normalizeSeverity(String severity) {
        if ("BLOCKER".equals(severity) || "WARNING".equals(severity) || "INFO".equals(severity)) {
            return severity;
        }
        return "INFO";
    }

    private IssueVO toVO(IssueEntity issue) {
        IssueVO vo = new IssueVO();
        vo.setId(issue.getId());
        vo.setRequirementPk(issue.getRequirementPk());
        vo.setSeverity(issue.getSeverity());
        vo.setStatus(issue.getStatus());
        vo.setTitle(issue.getTitle());
        vo.setRecommendation(issue.getRecommendation());
        vo.setSourceArtifactVersionId(issue.getSourceArtifactVersionId());
        vo.setAssigneeId(issue.getAssigneeId());
        return vo;
    }

    private void publishIssueEvent(RequirementEntity requirement, IssueEntity issue, String eventType) {
        domainEventService.publishAfterCommit(
            requirement.getProjectId(),
            eventType,
            "ISSUE",
            issue.getId(),
            "{\"requirementPk\":" + requirement.getId()
                + ",\"issueId\":" + issue.getId()
                + ",\"status\":\"" + issue.getStatus() + "\"}"
        );
    }
}
