package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.mapper.TechDesignAnnotationMapper;
import com.opp.aidelivery.center.model.dto.TechDesignAnnotationAnchorRequest;
import com.opp.aidelivery.center.model.dto.TechDesignAnnotationConsumeRequest;
import com.opp.aidelivery.center.model.dto.TechDesignAnnotationCreateRequest;
import com.opp.aidelivery.center.model.dto.TechDesignAnnotationStatusRequest;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.entity.TechDesignAnnotationEntity;
import com.opp.aidelivery.center.model.vo.TechDesignAnnotationAnchorVO;
import com.opp.aidelivery.center.model.vo.TechDesignAnnotationVO;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class TechDesignAnnotationService {

    private static final List<String> VALID_STATUSES = Collections.unmodifiableList(Arrays.asList("OPEN", "RESOLVED", "CARRIED_FORWARD", "STALE"));
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<List<String>>() {
    };

    private final PermissionService permissionService;
    private final RequirementMapper requirementMapper;
    private final TechDesignAnnotationMapper annotationMapper;
    private final DomainEventService domainEventService;
    private final ObjectMapper objectMapper;

    public List<TechDesignAnnotationVO> list(Long userId, Long requirementPk, String versionId) {
        loadRequirement(userId, requirementPk);
        LambdaQueryWrapper<TechDesignAnnotationEntity> wrapper = new LambdaQueryWrapper<TechDesignAnnotationEntity>()
            .eq(TechDesignAnnotationEntity::getRequirementPk, requirementPk)
            .orderByDesc(TechDesignAnnotationEntity::getCreatedAt)
            .orderByDesc(TechDesignAnnotationEntity::getId);
        if (versionId != null && !versionId.trim().isEmpty()) {
            wrapper.eq(TechDesignAnnotationEntity::getVersionId, versionId.trim());
        }
        return annotationMapper.selectList(wrapper).stream().map(this::toVO).collect(Collectors.toList());
    }

    public List<TechDesignAnnotationVO> listConsumable(Long userId, Long requirementPk) {
        loadRequirement(userId, requirementPk);
        return consumableAnnotations(requirementPk).stream().map(this::toVO).collect(Collectors.toList());
    }

    @Transactional(rollbackFor = Exception.class)
    public List<TechDesignAnnotationVO> create(Long userId, Long requirementPk, TechDesignAnnotationCreateRequest request) {
        RequirementEntity requirement = loadRequirement(userId, requirementPk);
        TechDesignAnnotationEntity entity = new TechDesignAnnotationEntity();
        entity.setRequirementPk(requirement.getId());
        entity.setAnnotationUid("annotation-" + UUID.randomUUID().toString().replace("-", ""));
        entity.setArtifactPath(normalizeText(request.getArtifactPath(), 512));
        entity.setVersionId(normalizeText(request.getVersionId(), 128));
        entity.setVersionNo(request.getVersionNo());
        entity.setVersionSource(normalizeText(request.getVersionSource(), 64));
        entity.setContentHash(normalizeText(request.getContentHash(), 128));
        entity.setSelectedText(requireText(request.getSelectedText(), 2000, "请选择需要批注的文案"));
        entity.setCommentText(requireText(request.getComment(), 4000, "请输入批注内容"));
        fillAnchor(entity, request.getAnchor());
        entity.setStatus("OPEN");
        entity.setIncludeInNextGeneration(Boolean.FALSE.equals(request.getIncludeInNextGeneration()) ? 0 : 1);
        entity.setCreatedBy(userId);
        entity.setUpdatedBy(userId);
        annotationMapper.insert(entity);
        publishAnnotationEvent(requirement, entity, "CREATED", userId);
        return list(userId, requirementPk, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public List<TechDesignAnnotationVO> updateStatus(Long userId, Long requirementPk, String annotationId, TechDesignAnnotationStatusRequest request) {
        RequirementEntity requirement = loadRequirement(userId, requirementPk);
        TechDesignAnnotationEntity entity = loadAnnotation(requirementPk, annotationId);
        if (request.getStatus() != null) {
            entity.setStatus(normalizeStatus(request.getStatus()));
        }
        if (request.getIncludeInNextGeneration() != null) {
            entity.setIncludeInNextGeneration(Boolean.TRUE.equals(request.getIncludeInNextGeneration()) ? 1 : 0);
        }
        entity.setUpdatedBy(userId);
        annotationMapper.updateById(entity);
        publishAnnotationEvent(requirement, entity, "UPDATED", userId);
        return list(userId, requirementPk, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public List<TechDesignAnnotationVO> delete(Long userId, Long requirementPk, String annotationId) {
        RequirementEntity requirement = loadRequirement(userId, requirementPk);
        TechDesignAnnotationEntity entity = loadAnnotation(requirementPk, annotationId);
        annotationMapper.deleteById(entity.getId());
        publishAnnotationEvent(requirement, entity, "DELETED", userId);
        return list(userId, requirementPk, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public List<TechDesignAnnotationVO> consume(Long userId, Long requirementPk, TechDesignAnnotationConsumeRequest request) {
        RequirementEntity requirement = loadRequirement(userId, requirementPk);
        List<TechDesignAnnotationEntity> annotations = consumableAnnotations(requirementPk);
        if (annotations.isEmpty()) {
            return Collections.emptyList();
        }
        LocalDateTime now = LocalDateTime.now();
        for (TechDesignAnnotationEntity annotation : annotations) {
            annotation.setConsumedAt(now);
            annotation.setConsumedRunId(request.getRunId());
            annotation.setUpdatedBy(userId);
            annotationMapper.updateById(annotation);
        }
        publishAnnotationEvent(requirement, annotations.get(0), "CONSUMED", userId);
        return annotations.stream().map(this::toVO).collect(Collectors.toList());
    }

    private RequirementEntity loadRequirement(Long userId, Long requirementPk) {
        RequirementEntity requirement = requirementMapper.selectById(requirementPk);
        if (requirement == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "需求不存在");
        }
        permissionService.assertProjectMember(userId, requirement.getProjectId());
        return requirement;
    }

    private TechDesignAnnotationEntity loadAnnotation(Long requirementPk, String annotationId) {
        TechDesignAnnotationEntity entity = annotationMapper.selectOne(new LambdaQueryWrapper<TechDesignAnnotationEntity>()
            .eq(TechDesignAnnotationEntity::getRequirementPk, requirementPk)
            .eq(TechDesignAnnotationEntity::getAnnotationUid, annotationId)
            .last("LIMIT 1"));
        if (entity == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "批注不存在");
        }
        return entity;
    }

    private List<TechDesignAnnotationEntity> consumableAnnotations(Long requirementPk) {
        return annotationMapper.selectList(new LambdaQueryWrapper<TechDesignAnnotationEntity>()
            .eq(TechDesignAnnotationEntity::getRequirementPk, requirementPk)
            .isNull(TechDesignAnnotationEntity::getConsumedAt)
            .eq(TechDesignAnnotationEntity::getIncludeInNextGeneration, 1)
            .in(TechDesignAnnotationEntity::getStatus, Arrays.asList("OPEN", "CARRIED_FORWARD", "STALE"))
            .orderByAsc(TechDesignAnnotationEntity::getCreatedAt)
            .orderByAsc(TechDesignAnnotationEntity::getId));
    }

    private void fillAnchor(TechDesignAnnotationEntity entity, TechDesignAnnotationAnchorRequest anchor) {
        TechDesignAnnotationAnchorRequest value = anchor == null ? new TechDesignAnnotationAnchorRequest() : anchor;
        entity.setPlainStart(Math.max(0, value.getPlainStart() == null ? 0 : value.getPlainStart()));
        entity.setPlainEnd(Math.max(0, value.getPlainEnd() == null ? 0 : value.getPlainEnd()));
        entity.setPrefixText(normalizeText(value.getPrefixText(), 500));
        entity.setSuffixText(normalizeText(value.getSuffixText(), 500));
        entity.setHeadingPathJson(writeHeadingPath(value.getHeadingPath()));
        entity.setOccurrence(Math.max(1, value.getOccurrence() == null ? 1 : value.getOccurrence()));
    }

    private String normalizeStatus(String status) {
        String value = status == null ? "" : status.trim().toUpperCase(Locale.ROOT);
        if (!VALID_STATUSES.contains(value)) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "批注状态不合法: " + status);
        }
        return value;
    }

    private String requireText(String value, int maxLength, String message) {
        String normalized = normalizeText(value, maxLength);
        if (normalized == null || normalized.isEmpty()) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, message);
        }
        return normalized;
    }

    private String normalizeText(String value, int maxLength) {
        String normalized = value == null ? "" : value.replaceAll("\\s+", " ").trim();
        if (normalized.isEmpty()) {
            return null;
        }
        return normalized.length() > maxLength ? normalized.substring(0, maxLength) : normalized;
    }

    private String writeHeadingPath(List<String> headingPath) {
        List<String> normalized = headingPath == null ? Collections.emptyList() : headingPath.stream()
            .map(item -> normalizeText(item, 100))
            .filter(item -> item != null && !item.isEmpty())
            .collect(Collectors.toList());
        try {
            return objectMapper.writeValueAsString(normalized);
        } catch (Exception exception) {
            return "[]";
        }
    }

    private List<String> readHeadingPath(String value) {
        if (value == null || value.trim().isEmpty()) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readValue(value, STRING_LIST);
        } catch (Exception exception) {
            return Collections.emptyList();
        }
    }

    private TechDesignAnnotationVO toVO(TechDesignAnnotationEntity entity) {
        TechDesignAnnotationAnchorVO anchor = new TechDesignAnnotationAnchorVO();
        anchor.setPlainStart(entity.getPlainStart());
        anchor.setPlainEnd(entity.getPlainEnd());
        anchor.setPrefixText(entity.getPrefixText());
        anchor.setSuffixText(entity.getSuffixText());
        anchor.setHeadingPath(readHeadingPath(entity.getHeadingPathJson()));
        anchor.setOccurrence(entity.getOccurrence());

        TechDesignAnnotationVO vo = new TechDesignAnnotationVO();
        vo.setId(entity.getAnnotationUid());
        vo.setRequirementPk(entity.getRequirementPk());
        vo.setArtifactPath(entity.getArtifactPath());
        vo.setVersionId(entity.getVersionId());
        vo.setVersionNo(entity.getVersionNo());
        vo.setVersionSource(entity.getVersionSource());
        vo.setContentHash(entity.getContentHash());
        vo.setSelectedText(entity.getSelectedText());
        vo.setAnchor(anchor);
        vo.setComment(entity.getCommentText());
        vo.setStatus(entity.getStatus());
        vo.setIncludeInNextGeneration(entity.getIncludeInNextGeneration() == null || entity.getIncludeInNextGeneration() == 1);
        vo.setCreatedAt(entity.getCreatedAt());
        vo.setUpdatedAt(entity.getUpdatedAt());
        vo.setCreatedBy(entity.getCreatedBy());
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setConsumedAt(entity.getConsumedAt());
        vo.setConsumedRunId(entity.getConsumedRunId());
        return vo;
    }

    private void publishAnnotationEvent(RequirementEntity requirement, TechDesignAnnotationEntity annotation, String operation, Long actorId) {
        try {
            Map<String, Object> payloadMap = new HashMap<>();
            payloadMap.put("requirementPk", requirement.getId());
            payloadMap.put("requirementId", requirement.getRequirementId());
            payloadMap.put("annotationId", annotation.getAnnotationUid());
            payloadMap.put("operation", operation);
            payloadMap.put("actorId", actorId);
            payloadMap.put("revision", System.currentTimeMillis());
            String payload = objectMapper.writeValueAsString(payloadMap);
            domainEventService.publishAfterCommit(
                requirement.getProjectId(),
                "tech-design.annotation.changed",
                "REQUIREMENT",
                requirement.getId(),
                payload
            );
        } catch (Exception exception) {
            throw new BusinessException(AiDeliveryErrorCode.INTERNAL_ERROR, "发布批注事件失败");
        }
    }
}
