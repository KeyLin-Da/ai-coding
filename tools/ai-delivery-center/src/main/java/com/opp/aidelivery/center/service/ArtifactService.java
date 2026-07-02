package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.ArtifactGitVersionMapper;
import com.opp.aidelivery.center.mapper.ArtifactMapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.model.dto.ArtifactCreateRequest;
import com.opp.aidelivery.center.model.entity.ArtifactEntity;
import com.opp.aidelivery.center.model.entity.ArtifactGitVersionEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.vo.ArtifactPreviewUrlVO;
import com.opp.aidelivery.center.model.vo.ArtifactVersionVO;
import com.opp.aidelivery.center.model.vo.ArtifactVO;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ArtifactService {

    private final PermissionService permissionService;
    private final ArtifactMapper artifactMapper;
    private final RequirementMapper requirementMapper;
    private final ArtifactGitVersionMapper artifactGitVersionMapper;

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

    public List<ArtifactVersionVO> listVersions(Long userId, Long artifactId) {
        ArtifactEntity artifact = loadArtifact(artifactId);
        loadRequirementAndCheckPermission(userId, artifact);
        return artifactGitVersionMapper.selectList(new LambdaQueryWrapper<ArtifactGitVersionEntity>()
                .eq(ArtifactGitVersionEntity::getArtifactId, artifactId))
            .stream()
            .map(this::toGitVO)
            .sorted(Comparator.comparing(ArtifactVersionVO::getVersionNo, Comparator.nullsLast(Integer::compareTo)).reversed())
            .collect(Collectors.toList());
    }

    public ArtifactPreviewUrlVO previewUrl(Long userId, Long artifactId, Long versionId) {
        ArtifactEntity artifact = loadArtifact(artifactId);
        loadRequirementAndCheckPermission(userId, artifact);
        ArtifactGitVersionEntity gitVersion = artifactGitVersionMapper.selectById(versionId);
        if (gitVersion != null && artifactId.equals(gitVersion.getArtifactId())) {
            ArtifactPreviewUrlVO vo = new ArtifactPreviewUrlVO();
            vo.setSourceType("GIT");
            vo.setCommitSha(gitVersion.getCommitSha());
            vo.setFilePath(gitVersion.getFilePath());
            return vo;
        }
        throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "产物版本不存在");
    }

    public ArtifactVersionVO currentVersion(Long userId, Long artifactId) {
        ArtifactEntity artifact = loadArtifact(artifactId);
        loadRequirementAndCheckPermission(userId, artifact);
        if (artifact.getCurrentVersionId() == null) {
            return null;
        }
        ArtifactGitVersionEntity gitVersion = artifactGitVersionMapper.selectById(artifact.getCurrentVersionId());
        if (gitVersion != null && artifactId.equals(gitVersion.getArtifactId())) {
            return toGitVO(gitVersion);
        }
        throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "产物当前版本不存在");
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

    private ArtifactVersionVO toGitVO(ArtifactGitVersionEntity version) {
        ArtifactVersionVO vo = new ArtifactVersionVO();
        vo.setId(version.getId());
        vo.setArtifactId(version.getArtifactId());
        vo.setVersionNo(version.getVersionNo());
        vo.setStatus(version.getStatus());
        vo.setSourceRunId(version.getSourceRunId());
        vo.setCreatedBy(version.getCreatedBy());
        vo.setCreatedAt(version.getCreatedAt());
        vo.setSourceType("GIT");
        vo.setContentSha256(version.getContentSha256());
        vo.setSha256(version.getContentSha256());
        vo.setCommitSha(version.getCommitSha());
        vo.setBlobSha(version.getBlobSha());
        vo.setFilePath(version.getFilePath());
        vo.setBaseCommitSha(version.getBaseCommitSha());
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
