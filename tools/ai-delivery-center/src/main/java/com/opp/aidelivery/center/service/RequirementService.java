package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.mapper.WorkflowStageMapper;
import com.opp.aidelivery.center.model.dto.RequirementCreateRequest;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.entity.WorkflowStageEntity;
import com.opp.aidelivery.center.model.vo.RequirementVO;
import com.opp.aidelivery.center.model.vo.WorkflowStageVO;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class RequirementService {

    private static final List<String> STAGES = Arrays.asList("PRD", "TECH_DESIGN", "IMPLEMENTATION", "CODE_REVIEW");

    private final PermissionService permissionService;
    private final RequirementMapper requirementMapper;
    private final WorkflowStageMapper workflowStageMapper;

    @Transactional(rollbackFor = Exception.class)
    public RequirementVO create(Long userId, RequirementCreateRequest request) {
        permissionService.assertProjectMember(userId, request.getProjectId());
        RequirementEntity requirement = new RequirementEntity();
        requirement.setProjectId(request.getProjectId());
        requirement.setRequirementId(request.getRequirementId());
        requirement.setTitle(request.getTitle());
        requirement.setRequirementType(normalizeRequirementType(request.getRequirementType()));
        requirement.setBranchName(defaultBranchName(request));
        requirement.setStatus("DRAFT");
        requirement.setCurrentStage("DEFECT".equals(requirement.getRequirementType()) ? "TECH_DESIGN" : "PRD");
        requirement.setVersion(0L);
        requirement.setCreatedBy(userId);
        requirementMapper.insert(requirement);

        for (String stage : STAGES) {
            WorkflowStageEntity entity = new WorkflowStageEntity();
            entity.setRequirementPk(requirement.getId());
            entity.setStage(stage);
            entity.setStatus(initialStageStatus(requirement.getRequirementType(), stage));
            entity.setVersion(0L);
            workflowStageMapper.insert(entity);
        }
        return get(userId, request.getProjectId(), request.getRequirementId());
    }

    public List<RequirementVO> list(Long userId, Long projectId) {
        permissionService.assertProjectMember(userId, projectId);
        List<RequirementEntity> requirements = requirementMapper.selectList(new LambdaQueryWrapper<RequirementEntity>()
            .eq(RequirementEntity::getProjectId, projectId)
            .orderByDesc(RequirementEntity::getUpdatedAt));
        return requirements.stream().map(this::toVOWithStages).collect(Collectors.toList());
    }

    public RequirementVO get(Long userId, Long projectId, String requirementId) {
        permissionService.assertProjectMember(userId, projectId);
        RequirementEntity requirement = requirementMapper.selectOne(new LambdaQueryWrapper<RequirementEntity>()
            .eq(RequirementEntity::getProjectId, projectId)
            .eq(RequirementEntity::getRequirementId, requirementId)
            .last("LIMIT 1"));
        if (requirement == null) {
            return null;
        }
        return toVOWithStages(requirement);
    }

    private RequirementVO toVOWithStages(RequirementEntity requirement) {
        RequirementVO vo = toVO(requirement);
        List<WorkflowStageEntity> stages = workflowStageMapper.selectList(new LambdaQueryWrapper<WorkflowStageEntity>()
            .eq(WorkflowStageEntity::getRequirementPk, requirement.getId()));
        Map<String, WorkflowStageEntity> byStage = stages.stream().collect(Collectors.toMap(WorkflowStageEntity::getStage, item -> item));
        vo.setStages(STAGES.stream()
            .filter(byStage::containsKey)
            .map(item -> toStageVO(byStage.get(item)))
            .collect(Collectors.toList()));
        return vo;
    }

    private RequirementVO toVO(RequirementEntity entity) {
        RequirementVO vo = new RequirementVO();
        vo.setId(entity.getId());
        vo.setProjectId(entity.getProjectId());
        vo.setRequirementId(entity.getRequirementId());
        vo.setTitle(entity.getTitle());
        vo.setRequirementType(entity.getRequirementType());
        vo.setBranchName(entity.getBranchName());
        vo.setStatus(entity.getStatus());
        vo.setCurrentStage(entity.getCurrentStage());
        vo.setVersion(entity.getVersion());
        return vo;
    }

    private WorkflowStageVO toStageVO(WorkflowStageEntity entity) {
        WorkflowStageVO vo = new WorkflowStageVO();
        vo.setId(entity.getId());
        vo.setStage(entity.getStage());
        vo.setStatus(entity.getStatus());
        vo.setArtifactId(entity.getArtifactId());
        vo.setApprovedAt(entity.getApprovedAt());
        vo.setRejectedAt(entity.getRejectedAt());
        vo.setComment(entity.getComment());
        vo.setVersion(entity.getVersion());
        return vo;
    }

    private String normalizeRequirementType(String type) {
        return "DEFECT".equals(type) ? "DEFECT" : "REQUIREMENT";
    }

    private String defaultBranchName(RequirementCreateRequest request) {
        if (request.getBranchName() != null && !request.getBranchName().trim().isEmpty()) {
            return request.getBranchName().trim();
        }
        String prefix = "DEFECT".equals(normalizeRequirementType(request.getRequirementType())) ? "bugfix" : "feature";
        return prefix + "/opp#" + request.getRequirementId();
    }

    private String initialStageStatus(String requirementType, String stage) {
        if ("DEFECT".equals(requirementType)) {
            if ("PRD".equals(stage)) {
                return "SKIPPED";
            }
            return "TECH_DESIGN".equals(stage) ? "DRAFT" : "NOT_STARTED";
        }
        return "PRD".equals(stage) ? "DRAFT" : "NOT_STARTED";
    }
}
