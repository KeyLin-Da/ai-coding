package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import com.opp.aidelivery.center.mapper.ArtifactMapper;
import com.opp.aidelivery.center.mapper.ArtifactUploadSessionMapper;
import com.opp.aidelivery.center.mapper.ArtifactVersionMapper;
import com.opp.aidelivery.center.mapper.FileObjectMapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.model.dto.ArtifactCreateRequest;
import com.opp.aidelivery.center.model.dto.ArtifactUploadSessionCreateRequest;
import com.opp.aidelivery.center.model.dto.ArtifactVersionCompleteRequest;
import com.opp.aidelivery.center.model.entity.ArtifactEntity;
import com.opp.aidelivery.center.model.entity.ArtifactUploadSessionEntity;
import com.opp.aidelivery.center.model.entity.ArtifactVersionEntity;
import com.opp.aidelivery.center.model.entity.FileObjectEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.vo.ArtifactPreviewUrlVO;
import com.opp.aidelivery.center.model.vo.ArtifactUploadSessionVO;
import com.opp.aidelivery.center.model.vo.ArtifactVersionConflictVO;
import com.opp.aidelivery.center.model.vo.ArtifactVersionVO;
import com.opp.aidelivery.center.model.vo.ArtifactVO;
import com.opp.aidelivery.center.storage.StorageObjectMetadata;
import com.opp.aidelivery.center.storage.StorageService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ArtifactService {

    private final AiDeliveryCenterProperties properties;
    private final StorageService storageService;
    private final PermissionService permissionService;
    private final ArtifactMapper artifactMapper;
    private final RequirementMapper requirementMapper;
    private final ArtifactUploadSessionMapper uploadSessionMapper;
    private final FileObjectMapper fileObjectMapper;
    private final ArtifactVersionMapper artifactVersionMapper;
    private final DomainEventService domainEventService;

    @Transactional(rollbackFor = Exception.class)
    public ArtifactVO createArtifact(Long userId, ArtifactCreateRequest request) {
        RequirementEntity requirement = requirementMapper.selectById(request.getRequirementPk());
        if (requirement == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "需求不存在");
        }
        permissionService.assertProjectMember(userId, requirement.getProjectId());
        ArtifactEntity existing = artifactMapper.selectOne(new LambdaQueryWrapper<ArtifactEntity>()
            .eq(ArtifactEntity::getRequirementPk, requirement.getId())
            .eq(ArtifactEntity::getLogicalPath, request.getLogicalPath())
            .last("LIMIT 1"));
        if (existing != null) {
            return toArtifactVO(existing);
        }
        ArtifactEntity artifact = new ArtifactEntity();
        artifact.setRequirementPk(requirement.getId());
        artifact.setLogicalPath(request.getLogicalPath());
        artifact.setLabel(request.getLabel());
        artifact.setKind(request.getKind());
        artifact.setStage(request.getStage());
        artifact.setVersion(0L);
        artifactMapper.insert(artifact);
        return toArtifactVO(artifact);
    }

    public ArtifactUploadSessionVO createUploadSession(Long userId, ArtifactUploadSessionCreateRequest request) {
        ArtifactEntity artifact = loadArtifact(request.getArtifactId());
        RequirementEntity requirement = loadRequirementAndCheckPermission(userId, artifact);
        assertBaseVersionMatches(artifact, request.getBaseVersionId());
        LocalDateTime expireAt = LocalDateTime.now().plus(properties.getCos().getSignedUrlTtl());
        String objectKey = buildObjectKey(requirement, artifact, request.getFileName());
        String uploadUrl = storageService.createUploadUrl(objectKey, request.getContentType(), properties.getCos().getSignedUrlTtl());

        ArtifactUploadSessionEntity session = new ArtifactUploadSessionEntity();
        session.setArtifactId(artifact.getId());
        session.setBaseVersionId(request.getBaseVersionId());
        session.setBucket(properties.getCos().getBucket());
        session.setCosKey(objectKey);
        session.setFileName(request.getFileName());
        session.setExpectedSha256(request.getSha256());
        session.setExpectedSize(request.getSize());
        session.setContentType(request.getContentType());
        session.setStatus("CREATED");
        session.setExpireAt(expireAt);
        session.setCreatedBy(userId);
        uploadSessionMapper.insert(session);

        ArtifactUploadSessionVO vo = new ArtifactUploadSessionVO();
        vo.setUploadSessionId(session.getId());
        vo.setUploadUrl(uploadUrl);
        vo.setExpireAt(expireAt);
        return vo;
    }

    @Transactional(rollbackFor = Exception.class)
    public ArtifactVersionVO completeUpload(Long userId, ArtifactVersionCompleteRequest request) {
        ArtifactUploadSessionEntity session = uploadSessionMapper.selectById(request.getUploadSessionId());
        if (session == null || !"CREATED".equals(session.getStatus())) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "上传会话不存在或已完成");
        }
        if (session.getExpireAt().isBefore(LocalDateTime.now())) {
            throw new BusinessException(AiDeliveryErrorCode.COS_UPLOAD_SESSION_EXPIRED);
        }
        ArtifactEntity artifact = loadArtifact(session.getArtifactId());
        RequirementEntity requirement = loadRequirementAndCheckPermission(userId, artifact);
        assertBaseVersionMatches(artifact, request.getBaseVersionId());
        StorageObjectMetadata metadata = storageService.getObjectMetadata(session.getCosKey());
        assertMetadataMatches(session, metadata);

        FileObjectEntity fileObject = new FileObjectEntity();
        fileObject.setBucket(session.getBucket());
        fileObject.setCosKey(session.getCosKey());
        fileObject.setCosVersionId(metadata.getVersionId());
        fileObject.setSha256(session.getExpectedSha256());
        fileObject.setSize(metadata.getSize());
        fileObject.setContentType(metadata.getContentType() == null ? session.getContentType() : metadata.getContentType());
        fileObjectMapper.insert(fileObject);

        ArtifactVersionEntity version = new ArtifactVersionEntity();
        version.setArtifactId(artifact.getId());
        version.setVersionNo(nextVersionNo(artifact.getId()));
        version.setBaseVersionId(request.getBaseVersionId());
        version.setFileObjectId(fileObject.getId());
        version.setStatus("CURRENT");
        version.setSourceRunId(request.getSourceRunId());
        version.setCreatedBy(userId);
        artifactVersionMapper.insert(version);

        artifact.setCurrentVersionId(version.getId());
        if (artifactMapper.updateById(artifact) != 1) {
            throw new BusinessException(AiDeliveryErrorCode.WORKFLOW_VERSION_CONFLICT, "产物当前版本更新失败");
        }
        session.setStatus("COMPLETED");
        uploadSessionMapper.updateById(session);
        saveArtifactVersionEvent(requirement, artifact, version);
        return toVO(version);
    }

    public List<ArtifactVersionVO> listVersions(Long userId, Long artifactId) {
        ArtifactEntity artifact = loadArtifact(artifactId);
        loadRequirementAndCheckPermission(userId, artifact);
        return artifactVersionMapper.selectList(new LambdaQueryWrapper<ArtifactVersionEntity>()
                .eq(ArtifactVersionEntity::getArtifactId, artifactId)
                .orderByDesc(ArtifactVersionEntity::getVersionNo))
            .stream()
            .map(this::toVO)
            .collect(Collectors.toList());
    }

    public ArtifactPreviewUrlVO previewUrl(Long userId, Long artifactId, Long versionId) {
        ArtifactEntity artifact = loadArtifact(artifactId);
        loadRequirementAndCheckPermission(userId, artifact);
        ArtifactVersionEntity version = artifactVersionMapper.selectById(versionId);
        if (version == null || !artifactId.equals(version.getArtifactId())) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "产物版本不存在");
        }
        FileObjectEntity fileObject = fileObjectMapper.selectById(version.getFileObjectId());
        if (fileObject == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "产物文件不存在");
        }
        ArtifactPreviewUrlVO vo = new ArtifactPreviewUrlVO();
        vo.setPreviewUrl(storageService.createPreviewUrl(fileObject.getCosKey(), properties.getCos().getSignedUrlTtl()));
        vo.setExpireAt(LocalDateTime.now().plus(properties.getCos().getSignedUrlTtl()));
        return vo;
    }

    public ArtifactVersionVO currentVersion(Long userId, Long artifactId) {
        ArtifactEntity artifact = loadArtifact(artifactId);
        loadRequirementAndCheckPermission(userId, artifact);
        if (artifact.getCurrentVersionId() == null) {
            return null;
        }
        ArtifactVersionEntity version = artifactVersionMapper.selectById(artifact.getCurrentVersionId());
        if (version == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "产物当前版本不存在");
        }
        return toVO(version);
    }

    private ArtifactEntity loadArtifact(Long artifactId) {
        ArtifactEntity artifact = artifactMapper.selectById(artifactId);
        if (artifact == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "产物不存在");
        }
        return artifact;
    }

    private RequirementEntity loadRequirementAndCheckPermission(Long userId, ArtifactEntity artifact) {
        RequirementEntity requirement = requirementMapper.selectById(artifact.getRequirementPk());
        if (requirement == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "需求不存在");
        }
        permissionService.assertProjectMember(userId, requirement.getProjectId());
        return requirement;
    }

    private void assertBaseVersionMatches(ArtifactEntity artifact, Long baseVersionId) {
        Long current = artifact.getCurrentVersionId();
        if (current == null && baseVersionId == null) {
            return;
        }
        if (current == null || !current.equals(baseVersionId)) {
            throw new BusinessException(
                AiDeliveryErrorCode.ARTIFACT_VERSION_CONFLICT,
                "产物已有更新版本，请刷新后合并",
                buildConflict(artifact, baseVersionId)
            );
        }
    }

    private void assertMetadataMatches(ArtifactUploadSessionEntity session, StorageObjectMetadata metadata) {
        if (metadata.getSize() != session.getExpectedSize()) {
            throw new BusinessException(AiDeliveryErrorCode.COS_OBJECT_MISMATCH, "COS 对象 size 不一致");
        }
        if (metadata.getSha256() != null && !metadata.getSha256().equalsIgnoreCase(session.getExpectedSha256())) {
            throw new BusinessException(AiDeliveryErrorCode.COS_OBJECT_MISMATCH, "COS 对象 sha256 不一致");
        }
    }

    private int nextVersionNo(Long artifactId) {
        List<ArtifactVersionEntity> versions = artifactVersionMapper.selectList(new LambdaQueryWrapper<ArtifactVersionEntity>()
            .eq(ArtifactVersionEntity::getArtifactId, artifactId));
        return versions.stream().map(ArtifactVersionEntity::getVersionNo).filter(item -> item != null).max(Integer::compareTo).orElse(0) + 1;
    }

    private String buildObjectKey(RequirementEntity requirement, ArtifactEntity artifact, String fileName) {
        String safeName = fileName.replaceAll("[^a-zA-Z0-9_.-]", "_");
        return "requirements/" + requirement.getId()
            + "/artifacts/" + artifact.getId()
            + "/uploads/" + UUID.randomUUID()
            + "/" + safeName;
    }

    private void saveArtifactVersionEvent(RequirementEntity requirement, ArtifactEntity artifact, ArtifactVersionEntity version) {
        domainEventService.publishAfterCommit(
            requirement.getProjectId(),
            "artifact.version.created",
            "ARTIFACT",
            artifact.getId(),
            "{\"requirementPk\":" + requirement.getId()
                + ",\"artifactId\":" + artifact.getId()
                + ",\"versionId\":" + version.getId()
                + ",\"versionNo\":" + version.getVersionNo() + "}"
        );
    }

    private ArtifactVersionVO toVO(ArtifactVersionEntity version) {
        ArtifactVersionVO vo = new ArtifactVersionVO();
        vo.setId(version.getId());
        vo.setArtifactId(version.getArtifactId());
        vo.setVersionNo(version.getVersionNo());
        vo.setBaseVersionId(version.getBaseVersionId());
        vo.setFileObjectId(version.getFileObjectId());
        vo.setStatus(version.getStatus());
        vo.setSourceRunId(version.getSourceRunId());
        vo.setCreatedBy(version.getCreatedBy());
        vo.setCreatedAt(version.getCreatedAt());
        FileObjectEntity fileObject = fileObjectMapper.selectById(version.getFileObjectId());
        if (fileObject != null) {
            vo.setSha256(fileObject.getSha256());
            vo.setSize(fileObject.getSize());
            vo.setContentType(fileObject.getContentType());
        }
        return vo;
    }

    private ArtifactVersionConflictVO buildConflict(ArtifactEntity artifact, Long baseVersionId) {
        ArtifactVersionConflictVO vo = new ArtifactVersionConflictVO();
        vo.setArtifactId(artifact.getId());
        vo.setBaseVersionId(baseVersionId);
        vo.setCurrentVersionId(artifact.getCurrentVersionId());
        if (artifact.getCurrentVersionId() != null) {
            ArtifactVersionEntity current = artifactVersionMapper.selectById(artifact.getCurrentVersionId());
            if (current != null) {
                vo.setCurrentVersion(toVO(current));
            }
        }
        return vo;
    }

    private ArtifactVO toArtifactVO(ArtifactEntity artifact) {
        ArtifactVO vo = new ArtifactVO();
        vo.setId(artifact.getId());
        vo.setRequirementPk(artifact.getRequirementPk());
        vo.setLogicalPath(artifact.getLogicalPath());
        vo.setLabel(artifact.getLabel());
        vo.setKind(artifact.getKind());
        vo.setStage(artifact.getStage());
        vo.setCurrentVersionId(artifact.getCurrentVersionId());
        vo.setVersion(artifact.getVersion());
        return vo;
    }
}
