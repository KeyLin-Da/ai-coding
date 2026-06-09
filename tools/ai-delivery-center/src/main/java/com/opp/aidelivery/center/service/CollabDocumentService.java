package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.ArtifactMapper;
import com.opp.aidelivery.center.mapper.ArtifactVersionMapper;
import com.opp.aidelivery.center.mapper.CollabDocumentMapper;
import com.opp.aidelivery.center.mapper.CollabOperationMapper;
import com.opp.aidelivery.center.mapper.CollabSnapshotMapper;
import com.opp.aidelivery.center.mapper.FileObjectMapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.model.dto.CollabDocumentOpenRequest;
import com.opp.aidelivery.center.model.dto.CollabOperationCreateRequest;
import com.opp.aidelivery.center.model.dto.CollabSnapshotCreateRequest;
import com.opp.aidelivery.center.model.entity.ArtifactEntity;
import com.opp.aidelivery.center.model.entity.ArtifactVersionEntity;
import com.opp.aidelivery.center.model.entity.CollabDocumentEntity;
import com.opp.aidelivery.center.model.entity.CollabOperationEntity;
import com.opp.aidelivery.center.model.entity.CollabSnapshotEntity;
import com.opp.aidelivery.center.model.entity.FileObjectEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.vo.CollabDocumentVO;
import com.opp.aidelivery.center.model.vo.CollabOperationVO;
import com.opp.aidelivery.center.model.vo.CollabSnapshotVO;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CollabDocumentService {

    private final PermissionService permissionService;
    private final ArtifactMapper artifactMapper;
    private final ArtifactVersionMapper artifactVersionMapper;
    private final FileObjectMapper fileObjectMapper;
    private final RequirementMapper requirementMapper;
    private final CollabDocumentMapper collabDocumentMapper;
    private final CollabOperationMapper collabOperationMapper;
    private final CollabSnapshotMapper collabSnapshotMapper;

    @Transactional(rollbackFor = Exception.class)
    public CollabDocumentVO openDraft(Long userId, CollabDocumentOpenRequest request) {
        ArtifactEntity artifact = loadArtifactAndCheckPermission(userId, request.getArtifactId());
        Long baseVersionId = request.getBaseVersionId() == null ? artifact.getCurrentVersionId() : request.getBaseVersionId();
        assertBaseVersionCurrent(artifact, baseVersionId);
        ArtifactVersionEntity baseVersion = baseVersionId == null ? null : artifactVersionMapper.selectById(baseVersionId);
        String documentType = detectDocumentType(baseVersion);
        CollabDocumentEntity existing = collabDocumentMapper.selectOne(new LambdaQueryWrapper<CollabDocumentEntity>()
            .eq(CollabDocumentEntity::getArtifactId, artifact.getId())
            .eq(baseVersionId != null, CollabDocumentEntity::getBaseVersionId, baseVersionId)
            .isNull(baseVersionId == null, CollabDocumentEntity::getBaseVersionId)
            .eq(CollabDocumentEntity::getStatus, "DRAFT")
            .last("LIMIT 1"));
        if (existing != null) {
            return toVO(existing);
        }

        CollabDocumentEntity document = new CollabDocumentEntity();
        document.setArtifactId(artifact.getId());
        document.setBaseVersionId(baseVersionId);
        document.setDocumentType(documentType);
        document.setStatus("DRAFT");
        document.setVersion(0L);
        document.setCreatedBy(userId);
        collabDocumentMapper.insert(document);
        return toVO(document);
    }

    @Transactional(rollbackFor = Exception.class)
    public CollabOperationVO appendOperation(Long userId, CollabOperationCreateRequest request) {
        CollabDocumentEntity document = loadDocumentAndCheckPermission(userId, request.getDocumentId());
        long nextSeq = nextOperationSeq(document.getId());
        if (!Long.valueOf(nextSeq).equals(request.getSeq())) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "协同操作序号不连续");
        }
        CollabOperationEntity operation = new CollabOperationEntity();
        operation.setDocumentId(document.getId());
        operation.setSeq(request.getSeq());
        operation.setActorId(userId);
        operation.setOperationType(request.getOperationType().trim().toUpperCase(Locale.ROOT));
        operation.setOperationPayload(request.getOperationPayload());
        collabOperationMapper.insert(operation);
        return toVO(operation);
    }

    @Transactional(rollbackFor = Exception.class)
    public CollabSnapshotVO saveSnapshot(Long userId, CollabSnapshotCreateRequest request) {
        CollabDocumentEntity document = loadDocumentAndCheckPermission(userId, request.getDocumentId());
        CollabSnapshotEntity snapshot = new CollabSnapshotEntity();
        snapshot.setDocumentId(document.getId());
        snapshot.setSeq(request.getSeq());
        snapshot.setContent(request.getContent());
        snapshot.setSha256(request.getSha256());
        collabSnapshotMapper.insert(snapshot);
        document.setCurrentSnapshotId(snapshot.getId());
        collabDocumentMapper.updateById(document);
        return toVO(snapshot);
    }

    private ArtifactEntity loadArtifactAndCheckPermission(Long userId, Long artifactId) {
        ArtifactEntity artifact = artifactMapper.selectById(artifactId);
        if (artifact == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "产物不存在");
        }
        RequirementEntity requirement = requirementMapper.selectById(artifact.getRequirementPk());
        if (requirement == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "需求不存在");
        }
        permissionService.assertProjectMember(userId, requirement.getProjectId());
        return artifact;
    }

    private CollabDocumentEntity loadDocumentAndCheckPermission(Long userId, Long documentId) {
        CollabDocumentEntity document = collabDocumentMapper.selectById(documentId);
        if (document == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "协同草稿不存在");
        }
        loadArtifactAndCheckPermission(userId, document.getArtifactId());
        return document;
    }

    private void assertBaseVersionCurrent(ArtifactEntity artifact, Long baseVersionId) {
        Long current = artifact.getCurrentVersionId();
        if (current == null && baseVersionId == null) {
            return;
        }
        if (current == null || !current.equals(baseVersionId)) {
            throw new BusinessException(AiDeliveryErrorCode.COLLAB_DRAFT_BASE_STALE);
        }
    }

    private String detectDocumentType(ArtifactVersionEntity baseVersion) {
        if (baseVersion == null) {
            return "TEXT";
        }
        FileObjectEntity fileObject = fileObjectMapper.selectById(baseVersion.getFileObjectId());
        String contentType = fileObject == null ? "" : String.valueOf(fileObject.getContentType()).toLowerCase(Locale.ROOT);
        if (contentType.startsWith("text/") || contentType.contains("markdown")) {
            return contentType.contains("markdown") ? "MARKDOWN" : "TEXT";
        }
        if (contentType.contains("json")) {
            return "JSON";
        }
        if (contentType.contains("xml") || contentType.contains("html") || contentType.contains("yaml")) {
            return "TEXT";
        }
        throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "仅文本类产物支持协同编辑");
    }

    private long nextOperationSeq(Long documentId) {
        CollabOperationEntity latest = collabOperationMapper.selectOne(new LambdaQueryWrapper<CollabOperationEntity>()
            .eq(CollabOperationEntity::getDocumentId, documentId)
            .orderByDesc(CollabOperationEntity::getSeq)
            .last("LIMIT 1"));
        return latest == null || latest.getSeq() == null ? 1L : latest.getSeq() + 1L;
    }

    private CollabDocumentVO toVO(CollabDocumentEntity document) {
        CollabDocumentVO vo = new CollabDocumentVO();
        vo.setId(document.getId());
        vo.setArtifactId(document.getArtifactId());
        vo.setBaseVersionId(document.getBaseVersionId());
        vo.setDocumentType(document.getDocumentType());
        vo.setStatus(document.getStatus());
        vo.setVersion(document.getVersion());
        vo.setCurrentSnapshotId(document.getCurrentSnapshotId());
        vo.setCreatedBy(document.getCreatedBy());
        vo.setCreatedAt(document.getCreatedAt());
        return vo;
    }

    private CollabOperationVO toVO(CollabOperationEntity operation) {
        CollabOperationVO vo = new CollabOperationVO();
        vo.setId(operation.getId());
        vo.setDocumentId(operation.getDocumentId());
        vo.setSeq(operation.getSeq());
        vo.setActorId(operation.getActorId());
        vo.setOperationType(operation.getOperationType());
        vo.setOperationPayload(operation.getOperationPayload());
        vo.setCreatedAt(operation.getCreatedAt());
        return vo;
    }

    private CollabSnapshotVO toVO(CollabSnapshotEntity snapshot) {
        CollabSnapshotVO vo = new CollabSnapshotVO();
        vo.setId(snapshot.getId());
        vo.setDocumentId(snapshot.getDocumentId());
        vo.setSeq(snapshot.getSeq());
        vo.setContent(snapshot.getContent());
        vo.setSha256(snapshot.getSha256());
        vo.setCreatedAt(snapshot.getCreatedAt());
        return vo;
    }
}
