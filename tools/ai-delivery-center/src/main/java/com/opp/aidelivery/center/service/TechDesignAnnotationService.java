package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.mapper.TechDesignAnnotationMapper;
import com.opp.aidelivery.center.mapper.TechDesignAnnotationReplyMapper;
import com.opp.aidelivery.center.mapper.UserMapper;
import com.opp.aidelivery.center.model.dto.TechDesignAnnotationAnchorRequest;
import com.opp.aidelivery.center.model.dto.TechDesignAnnotationConsumeRequest;
import com.opp.aidelivery.center.model.dto.TechDesignAnnotationCreateRequest;
import com.opp.aidelivery.center.model.dto.TechDesignAnnotationReplyRequest;
import com.opp.aidelivery.center.model.dto.TechDesignAnnotationStatusRequest;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.entity.TechDesignAnnotationEntity;
import com.opp.aidelivery.center.model.entity.TechDesignAnnotationReplyEntity;
import com.opp.aidelivery.center.model.entity.UserEntity;
import com.opp.aidelivery.center.model.vo.TechDesignAnnotationAnchorVO;
import com.opp.aidelivery.center.model.vo.TechDesignAnnotationReplyVO;
import com.opp.aidelivery.center.model.vo.TechDesignAnnotationVO;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
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
    private final TechDesignAnnotationReplyMapper replyMapper;
    private final DomainEventService domainEventService;
    private final UserMapper userMapper;
    private final ObjectMapper objectMapper;

    public List<TechDesignAnnotationVO> list(Long userId, Long requirementPk, String versionId) {
        loadRequirement(userId, requirementPk);
        return listByRequirement(requirementPk, versionId);
    }

    public List<TechDesignAnnotationVO> listPublic(Long requirementPk, String versionId) {
        return listByRequirement(requirementPk, versionId);
    }

    public List<TechDesignAnnotationVO> listConsumable(Long userId, Long requirementPk) {
        loadRequirement(userId, requirementPk);
        return toVOList(consumableAnnotations(requirementPk));
    }

    @Transactional(rollbackFor = Exception.class)
    public List<TechDesignAnnotationVO> create(Long userId, Long requirementPk, TechDesignAnnotationCreateRequest request) {
        RequirementEntity requirement = loadRequirement(userId, requirementPk);
        return createAnnotation(userId, requirement, request);
    }

    @Transactional(rollbackFor = Exception.class)
    public List<TechDesignAnnotationVO> createPublic(
        Long userId,
        Long requirementPk,
        String artifactPath,
        TechDesignAnnotationCreateRequest request
    ) {
        RequirementEntity requirement = loadRequirement(requirementPk);
        request.setArtifactPath(artifactPath);
        return createAnnotation(userId, requirement, request);
    }

    private List<TechDesignAnnotationVO> createAnnotation(
        Long userId,
        RequirementEntity requirement,
        TechDesignAnnotationCreateRequest request
    ) {
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
        return listByRequirement(requirement.getId(), null);
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
        deleteAnnotation(requirement, entity, userId);
        return listByRequirement(requirementPk, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public List<TechDesignAnnotationVO> deletePublic(Long userId, Long requirementPk, String artifactPath, String annotationId) {
        RequirementEntity requirement = loadRequirement(requirementPk);
        TechDesignAnnotationEntity entity = loadAnnotation(requirementPk, annotationId);
        if (!Objects.equals(entity.getArtifactPath(), artifactPath)) {
            throw new BusinessException(AiDeliveryErrorCode.ACCESS_DENIED, "批注不属于当前分享文档");
        }
        if (!Objects.equals(entity.getCreatedBy(), userId)) {
            throw new BusinessException(AiDeliveryErrorCode.ACCESS_DENIED, "只能删除本人创建的批注");
        }
        deleteAnnotation(requirement, entity, userId);
        return listByRequirement(requirementPk, null);
    }

    private void deleteAnnotation(RequirementEntity requirement, TechDesignAnnotationEntity entity, Long userId) {
        replyMapper.delete(new LambdaQueryWrapper<TechDesignAnnotationReplyEntity>()
            .eq(TechDesignAnnotationReplyEntity::getRequirementPk, entity.getRequirementPk())
            .eq(TechDesignAnnotationReplyEntity::getAnnotationUid, entity.getAnnotationUid()));
        annotationMapper.deleteById(entity.getId());
        publishAnnotationEvent(requirement, entity, "DELETED", userId);
    }

    @Transactional(rollbackFor = Exception.class)
    public List<TechDesignAnnotationVO> createReply(
        Long userId,
        Long requirementPk,
        String annotationId,
        TechDesignAnnotationReplyRequest request
    ) {
        RequirementEntity requirement = loadRequirement(userId, requirementPk);
        TechDesignAnnotationEntity annotation = loadAnnotation(requirementPk, annotationId);
        return createReply(userId, requirement, annotation, request);
    }

    @Transactional(rollbackFor = Exception.class)
    public List<TechDesignAnnotationVO> createPublicReply(
        Long userId,
        Long requirementPk,
        String artifactPath,
        String annotationId,
        TechDesignAnnotationReplyRequest request
    ) {
        RequirementEntity requirement = loadRequirement(requirementPk);
        TechDesignAnnotationEntity annotation = loadAnnotation(requirementPk, annotationId);
        assertAnnotationBelongsToArtifact(annotation, artifactPath);
        return createReply(userId, requirement, annotation, request);
    }

    private List<TechDesignAnnotationVO> createReply(
        Long userId,
        RequirementEntity requirement,
        TechDesignAnnotationEntity annotation,
        TechDesignAnnotationReplyRequest request
    ) {
        TechDesignAnnotationReplyEntity reply = new TechDesignAnnotationReplyEntity();
        reply.setRequirementPk(requirement.getId());
        reply.setAnnotationUid(annotation.getAnnotationUid());
        reply.setReplyUid("reply-" + UUID.randomUUID().toString().replace("-", ""));
        reply.setContentText(requireText(request.getContent(), 4000, "请输入回复内容"));
        reply.setCreatedBy(userId);
        reply.setUpdatedBy(userId);
        replyMapper.insert(reply);
        publishAnnotationEvent(requirement, annotation, "REPLY_CREATED", userId, reply.getReplyUid());
        return listByRequirement(requirement.getId(), null);
    }

    @Transactional(rollbackFor = Exception.class)
    public List<TechDesignAnnotationVO> deleteReply(Long userId, Long requirementPk, String annotationId, String replyId) {
        RequirementEntity requirement = loadRequirement(userId, requirementPk);
        TechDesignAnnotationEntity annotation = loadAnnotation(requirementPk, annotationId);
        TechDesignAnnotationReplyEntity reply = loadReply(requirementPk, annotationId, replyId);
        deleteReply(requirement, annotation, reply, userId);
        return listByRequirement(requirementPk, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public List<TechDesignAnnotationVO> deletePublicReply(
        Long userId,
        Long requirementPk,
        String artifactPath,
        String annotationId,
        String replyId
    ) {
        RequirementEntity requirement = loadRequirement(requirementPk);
        TechDesignAnnotationEntity annotation = loadAnnotation(requirementPk, annotationId);
        assertAnnotationBelongsToArtifact(annotation, artifactPath);
        TechDesignAnnotationReplyEntity reply = loadReply(requirementPk, annotationId, replyId);
        if (!Objects.equals(reply.getCreatedBy(), userId)) {
            throw new BusinessException(AiDeliveryErrorCode.ACCESS_DENIED, "只能删除本人创建的回复");
        }
        deleteReply(requirement, annotation, reply, userId);
        return listByRequirement(requirementPk, null);
    }

    private void deleteReply(
        RequirementEntity requirement,
        TechDesignAnnotationEntity annotation,
        TechDesignAnnotationReplyEntity reply,
        Long userId
    ) {
        replyMapper.deleteById(reply.getId());
        publishAnnotationEvent(requirement, annotation, "REPLY_DELETED", userId, reply.getReplyUid());
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
        List<String> annotationIds = annotations.stream().map(TechDesignAnnotationEntity::getAnnotationUid).collect(Collectors.toList());
        List<TechDesignAnnotationReplyEntity> replies = replyMapper.selectList(new LambdaQueryWrapper<TechDesignAnnotationReplyEntity>()
            .eq(TechDesignAnnotationReplyEntity::getRequirementPk, requirementPk)
            .in(TechDesignAnnotationReplyEntity::getAnnotationUid, annotationIds)
            .isNull(TechDesignAnnotationReplyEntity::getConsumedAt));
        if (replies != null) {
            for (TechDesignAnnotationReplyEntity reply : replies) {
                reply.setConsumedAt(now);
                reply.setConsumedRunId(request.getRunId());
                reply.setUpdatedBy(userId);
                replyMapper.updateById(reply);
            }
        }
        publishAnnotationEvent(requirement, annotations.get(0), "CONSUMED", userId);
        return toVOList(annotations);
    }

    private RequirementEntity loadRequirement(Long userId, Long requirementPk) {
        RequirementEntity requirement = loadRequirement(requirementPk);
        permissionService.assertProjectMember(userId, requirement.getProjectId());
        return requirement;
    }

    private RequirementEntity loadRequirement(Long requirementPk) {
        RequirementEntity requirement = requirementMapper.selectById(requirementPk);
        if (requirement == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "需求不存在");
        }
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

    private TechDesignAnnotationReplyEntity loadReply(Long requirementPk, String annotationId, String replyId) {
        TechDesignAnnotationReplyEntity entity = replyMapper.selectOne(new LambdaQueryWrapper<TechDesignAnnotationReplyEntity>()
            .eq(TechDesignAnnotationReplyEntity::getRequirementPk, requirementPk)
            .eq(TechDesignAnnotationReplyEntity::getAnnotationUid, annotationId)
            .eq(TechDesignAnnotationReplyEntity::getReplyUid, replyId)
            .last("LIMIT 1"));
        if (entity == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "回复不存在");
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

    private List<TechDesignAnnotationVO> listByRequirement(Long requirementPk, String versionId) {
        LambdaQueryWrapper<TechDesignAnnotationEntity> wrapper = new LambdaQueryWrapper<TechDesignAnnotationEntity>()
            .eq(TechDesignAnnotationEntity::getRequirementPk, requirementPk)
            .orderByDesc(TechDesignAnnotationEntity::getCreatedAt)
            .orderByDesc(TechDesignAnnotationEntity::getId);
        if (versionId != null && !versionId.trim().isEmpty()) {
            wrapper.eq(TechDesignAnnotationEntity::getVersionId, versionId.trim());
        }
        return toVOList(annotationMapper.selectList(wrapper));
    }

    private List<TechDesignAnnotationVO> toVOList(List<TechDesignAnnotationEntity> annotations) {
        List<TechDesignAnnotationEntity> safeAnnotations = annotations == null ? Collections.emptyList() : annotations;
        Map<String, List<TechDesignAnnotationReplyEntity>> replies = loadReplies(safeAnnotations);
        Map<Long, UserEntity> users = loadUsers(safeAnnotations, replies);
        return safeAnnotations.stream()
            .map(entity -> toVO(entity, users, replies.getOrDefault(entity.getAnnotationUid(), Collections.emptyList())))
            .collect(Collectors.toList());
    }

    private Map<String, List<TechDesignAnnotationReplyEntity>> loadReplies(List<TechDesignAnnotationEntity> annotations) {
        if (annotations == null || annotations.isEmpty()) {
            return Collections.emptyMap();
        }
        Long requirementPk = annotations.get(0).getRequirementPk();
        List<String> annotationIds = annotations.stream().map(TechDesignAnnotationEntity::getAnnotationUid).collect(Collectors.toList());
        List<TechDesignAnnotationReplyEntity> replies = replyMapper.selectList(new LambdaQueryWrapper<TechDesignAnnotationReplyEntity>()
            .eq(TechDesignAnnotationReplyEntity::getRequirementPk, requirementPk)
            .in(TechDesignAnnotationReplyEntity::getAnnotationUid, annotationIds)
            .orderByAsc(TechDesignAnnotationReplyEntity::getCreatedAt)
            .orderByAsc(TechDesignAnnotationReplyEntity::getId));
        if (replies == null || replies.isEmpty()) {
            return Collections.emptyMap();
        }
        Map<String, List<TechDesignAnnotationReplyEntity>> result = new LinkedHashMap<>();
        for (TechDesignAnnotationReplyEntity reply : replies) {
            result.computeIfAbsent(reply.getAnnotationUid(), key -> new ArrayList<>()).add(reply);
        }
        return result;
    }

    private Map<Long, UserEntity> loadUsers(
        List<TechDesignAnnotationEntity> annotations,
        Map<String, List<TechDesignAnnotationReplyEntity>> replies
    ) {
        Set<Long> userIds = new HashSet<>();
        for (TechDesignAnnotationEntity annotation : annotations) {
            if (annotation.getCreatedBy() != null) {
                userIds.add(annotation.getCreatedBy());
            }
            if (annotation.getUpdatedBy() != null) {
                userIds.add(annotation.getUpdatedBy());
            }
        }
        for (List<TechDesignAnnotationReplyEntity> annotationReplies : replies.values()) {
            for (TechDesignAnnotationReplyEntity reply : annotationReplies) {
                if (reply.getCreatedBy() != null) {
                    userIds.add(reply.getCreatedBy());
                }
                if (reply.getUpdatedBy() != null) {
                    userIds.add(reply.getUpdatedBy());
                }
            }
        }
        if (userIds.isEmpty()) {
            return Collections.emptyMap();
        }
        List<UserEntity> users = userMapper.selectBatchIds(new ArrayList<>(userIds));
        if (users == null || users.isEmpty()) {
            return Collections.emptyMap();
        }
        return users.stream().collect(Collectors.toMap(UserEntity::getId, user -> user, (left, right) -> left));
    }

    private void assertAnnotationBelongsToArtifact(TechDesignAnnotationEntity entity, String artifactPath) {
        if (!Objects.equals(entity.getArtifactPath(), artifactPath)) {
            throw new BusinessException(AiDeliveryErrorCode.ACCESS_DENIED, "批注不属于当前分享文档");
        }
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

    private TechDesignAnnotationVO toVO(
        TechDesignAnnotationEntity entity,
        Map<Long, UserEntity> users,
        List<TechDesignAnnotationReplyEntity> replies
    ) {
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
        vo.setCreatedByName(displayName(users.get(entity.getCreatedBy())));
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setUpdatedByName(displayName(users.get(entity.getUpdatedBy())));
        vo.setConsumedAt(entity.getConsumedAt());
        vo.setConsumedRunId(entity.getConsumedRunId());
        vo.setReplies(replies.stream().map(reply -> toReplyVO(reply, users)).collect(Collectors.toList()));
        return vo;
    }

    private TechDesignAnnotationReplyVO toReplyVO(TechDesignAnnotationReplyEntity entity, Map<Long, UserEntity> users) {
        TechDesignAnnotationReplyVO vo = new TechDesignAnnotationReplyVO();
        vo.setId(entity.getReplyUid());
        vo.setAnnotationId(entity.getAnnotationUid());
        vo.setContent(entity.getContentText());
        vo.setCreatedBy(entity.getCreatedBy());
        vo.setCreatedByName(displayName(users.get(entity.getCreatedBy())));
        vo.setUpdatedBy(entity.getUpdatedBy());
        vo.setUpdatedByName(displayName(users.get(entity.getUpdatedBy())));
        vo.setCreatedAt(entity.getCreatedAt());
        vo.setUpdatedAt(entity.getUpdatedAt());
        vo.setConsumedAt(entity.getConsumedAt());
        vo.setConsumedRunId(entity.getConsumedRunId());
        return vo;
    }

    private String displayName(UserEntity user) {
        if (user == null) {
            return null;
        }
        String displayName = normalizeText(user.getDisplayName(), 100);
        if (displayName != null) {
            return displayName;
        }
        return normalizeText(user.getAccount(), 100);
    }

    private void publishAnnotationEvent(RequirementEntity requirement, TechDesignAnnotationEntity annotation, String operation, Long actorId) {
        publishAnnotationEvent(requirement, annotation, operation, actorId, null);
    }

    private void publishAnnotationEvent(
        RequirementEntity requirement,
        TechDesignAnnotationEntity annotation,
        String operation,
        Long actorId,
        String replyId
    ) {
        try {
            Map<String, Object> payloadMap = new HashMap<>();
            payloadMap.put("requirementPk", requirement.getId());
            payloadMap.put("requirementId", requirement.getRequirementId());
            payloadMap.put("annotationId", annotation.getAnnotationUid());
            if (replyId != null) {
                payloadMap.put("replyId", replyId);
            }
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
