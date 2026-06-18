package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.ArtifactShareMapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.model.dto.ArtifactShareCreateRequest;
import com.opp.aidelivery.center.model.entity.ArtifactShareEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.vo.ArtifactSharePublicVO;
import com.opp.aidelivery.center.model.vo.ArtifactShareVO;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class ArtifactShareService {

    private static final String VISIBILITY_PUBLIC = "PUBLIC";
    private static final String STATUS_ENABLED = "ENABLED";
    private static final String STATUS_REVOKED = "REVOKED";
    private static final int TOKEN_RANDOM_BYTES = 32;
    private static final String[] BLOCKED_SEGMENTS = {
        "/workflow/",
        "/runs/",
        "/run-log/",
        "/prompts/",
        "/prompt/",
        "/scripts/",
        "/config/"
    };

    private final SecureRandom secureRandom = new SecureRandom();
    private final PermissionService permissionService;
    private final RequirementMapper requirementMapper;
    private final ArtifactShareMapper artifactShareMapper;

    @Transactional(rollbackFor = Exception.class)
    public ArtifactShareVO createPublicShare(Long userId, ArtifactShareCreateRequest request) {
        permissionService.assertProjectMember(userId, request.getProjectId());
        RequirementEntity requirement = loadRequirement(request);
        String artifactPath = normalizeAndValidateArtifactPath(request.getRequirementId(), request.getArtifactPath());
        String token = nextUniqueToken();

        ArtifactShareEntity share = new ArtifactShareEntity();
        share.setProjectId(request.getProjectId());
        share.setRequirementPk(requirement.getId());
        share.setRequirementId(requirement.getRequirementId());
        share.setArtifactPath(artifactPath);
        share.setVisibility(VISIBILITY_PUBLIC);
        share.setTokenHash(sha256Hex(token));
        share.setStatus(STATUS_ENABLED);
        share.setExpireAt(request.getExpireAt());
        share.setShowAnnotations(booleanToInt(request.getShowAnnotations()));
        share.setAllowDownload(booleanToInt(request.getAllowDownload()));
        share.setAccessCount(0L);
        share.setCreatedBy(userId);
        artifactShareMapper.insert(share);
        ArtifactShareVO vo = toVO(share);
        vo.setToken(token);
        return vo;
    }

    public List<ArtifactShareVO> listPublicShares(
        Long userId,
        Long projectId,
        String requirementId,
        String artifactPath
    ) {
        permissionService.assertProjectMember(userId, projectId);
        LambdaQueryWrapper<ArtifactShareEntity> query = new LambdaQueryWrapper<ArtifactShareEntity>()
            .eq(ArtifactShareEntity::getProjectId, projectId)
            .eq(ArtifactShareEntity::getVisibility, VISIBILITY_PUBLIC)
            .orderByDesc(ArtifactShareEntity::getId);
        if (StringUtils.hasText(requirementId)) {
            query.eq(ArtifactShareEntity::getRequirementId, requirementId.trim());
        }
        if (StringUtils.hasText(artifactPath)) {
            query.eq(ArtifactShareEntity::getArtifactPath, normalizeArtifactPath(artifactPath));
        }
        return artifactShareMapper.selectList(query)
            .stream()
            .map(this::toVO)
            .collect(Collectors.toList());
    }

    @Transactional(rollbackFor = Exception.class)
    public ArtifactShareVO revokePublicShare(Long userId, Long shareId) {
        ArtifactShareEntity share = artifactShareMapper.selectById(shareId);
        if (share == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "分享记录不存在");
        }
        permissionService.assertProjectMember(userId, share.getProjectId());
        if (!STATUS_REVOKED.equals(share.getStatus())) {
            share.setStatus(STATUS_REVOKED);
            share.setRevokedAt(LocalDateTime.now());
            artifactShareMapper.updateById(share);
        }
        return toVO(share);
    }

    @Transactional(rollbackFor = Exception.class)
    public ArtifactShareVO regeneratePublicShareToken(Long userId, Long shareId) {
        ArtifactShareEntity share = artifactShareMapper.selectById(shareId);
        if (share == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "分享记录不存在");
        }
        permissionService.assertProjectMember(userId, share.getProjectId());
        if (!STATUS_ENABLED.equals(share.getStatus()) || isExpired(share.getExpireAt())) {
            throw new BusinessException(AiDeliveryErrorCode.ARTIFACT_SHARE_INVALID);
        }
        String token = nextUniqueToken();
        share.setTokenHash(sha256Hex(token));
        artifactShareMapper.updateById(share);
        ArtifactShareVO vo = toVO(share);
        vo.setToken(token);
        return vo;
    }

    @Transactional(rollbackFor = Exception.class)
    public ArtifactSharePublicVO resolvePublicShare(String token) {
        if (!StringUtils.hasText(token)) {
            throw new BusinessException(AiDeliveryErrorCode.ARTIFACT_SHARE_INVALID);
        }
        ArtifactShareEntity share = artifactShareMapper.selectOne(new LambdaQueryWrapper<ArtifactShareEntity>()
            .eq(ArtifactShareEntity::getTokenHash, sha256Hex(token.trim()))
            .last("LIMIT 1"));
        if (share == null || !STATUS_ENABLED.equals(share.getStatus()) || isExpired(share.getExpireAt())) {
            throw new BusinessException(AiDeliveryErrorCode.ARTIFACT_SHARE_INVALID);
        }
        share.setAccessCount(share.getAccessCount() == null ? 1L : share.getAccessCount() + 1L);
        share.setLastAccessAt(LocalDateTime.now());
        artifactShareMapper.updateById(share);
        return toPublicVO(share);
    }

    private RequirementEntity loadRequirement(ArtifactShareCreateRequest request) {
        RequirementEntity requirement = null;
        if (request.getRequirementPk() != null) {
            requirement = requirementMapper.selectById(request.getRequirementPk());
        }
        if (requirement == null) {
            requirement = requirementMapper.selectOne(new LambdaQueryWrapper<RequirementEntity>()
                .eq(RequirementEntity::getProjectId, request.getProjectId())
                .eq(RequirementEntity::getRequirementId, request.getRequirementId())
                .last("LIMIT 1"));
        }
        if (requirement == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "需求不存在");
        }
        if (!request.getProjectId().equals(requirement.getProjectId())
            || !request.getRequirementId().equals(requirement.getRequirementId())) {
            throw new BusinessException(AiDeliveryErrorCode.ACCESS_DENIED, "需求不属于当前项目");
        }
        return requirement;
    }

    private String normalizeAndValidateArtifactPath(String requirementId, String artifactPath) {
        String normalized = normalizeArtifactPath(artifactPath);
        if (!isShareableArtifactPath(requirementId, normalized)) {
            throw new BusinessException(AiDeliveryErrorCode.ARTIFACT_SHARE_PATH_DENIED);
        }
        return normalized;
    }

    private String normalizeArtifactPath(String artifactPath) {
        if (!StringUtils.hasText(artifactPath)) {
            throw new BusinessException(AiDeliveryErrorCode.ARTIFACT_SHARE_PATH_DENIED);
        }
        String normalized = artifactPath.trim().replace('\\', '/');
        while (normalized.contains("//")) {
            normalized = normalized.replace("//", "/");
        }
        if (normalized.startsWith("/") || normalized.startsWith("../") || normalized.contains("/../")
            || normalized.endsWith("/..") || normalized.contains("\u0000")) {
            throw new BusinessException(AiDeliveryErrorCode.ARTIFACT_SHARE_PATH_DENIED);
        }
        return normalized;
    }

    private boolean isShareableArtifactPath(String requirementId, String artifactPath) {
        String lower = artifactPath.toLowerCase(Locale.ROOT);
        for (String blockedSegment : BLOCKED_SEGMENTS) {
            if (lower.contains(blockedSegment)) {
                return false;
            }
        }
        if (lower.matches("^docs/[^/]+/reports/run-[^/]*\\.log$")) {
            return false;
        }
        String reqDocPrefix = "docs/" + requirementId + "/";
        if (artifactPath.startsWith(reqDocPrefix + "workflow/")) {
            return false;
        }
        if (artifactPath.startsWith(reqDocPrefix + "prd/")
            || artifactPath.startsWith(reqDocPrefix + "technical-design/")
            || artifactPath.startsWith(reqDocPrefix + "reports/")
            || artifactPath.startsWith(reqDocPrefix + "junit/")
            || artifactPath.startsWith(reqDocPrefix + "code-review/")) {
            return true;
        }
        if (artifactPath.startsWith("docs/code_review/")) {
            return true;
        }
        if (!artifactPath.startsWith("openspec/changes/")) {
            return false;
        }
        return lower.endsWith("/proposal.md")
            || lower.endsWith("/design.md")
            || lower.endsWith("/tasks.md")
            || lower.contains("/specs/");
    }

    private String nextUniqueToken() {
        for (int i = 0; i < 5; i++) {
            String token = generateToken();
            ArtifactShareEntity existing = artifactShareMapper.selectOne(new LambdaQueryWrapper<ArtifactShareEntity>()
                .eq(ArtifactShareEntity::getTokenHash, sha256Hex(token))
                .last("LIMIT 1"));
            if (existing == null) {
                return token;
            }
        }
        throw new BusinessException(AiDeliveryErrorCode.INTERNAL_ERROR, "分享 token 生成失败");
    }

    private String generateToken() {
        byte[] bytes = new byte[TOKEN_RANDOM_BYTES];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) {
                builder.append(String.format("%02x", b));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new BusinessException(AiDeliveryErrorCode.INTERNAL_ERROR, "当前运行环境不支持 SHA-256");
        }
    }

    private boolean isExpired(LocalDateTime expireAt) {
        return expireAt != null && expireAt.isBefore(LocalDateTime.now());
    }

    private int booleanToInt(Boolean value) {
        return Boolean.FALSE.equals(value) ? 0 : 1;
    }

    private boolean intToBoolean(Integer value) {
        return value == null || value == 1;
    }

    private ArtifactShareVO toVO(ArtifactShareEntity share) {
        ArtifactShareVO vo = new ArtifactShareVO();
        vo.setId(share.getId());
        vo.setProjectId(share.getProjectId());
        vo.setRequirementPk(share.getRequirementPk());
        vo.setRequirementId(share.getRequirementId());
        vo.setArtifactPath(share.getArtifactPath());
        vo.setVisibility(share.getVisibility());
        vo.setStatus(share.getStatus());
        vo.setExpireAt(share.getExpireAt());
        vo.setShowAnnotations(intToBoolean(share.getShowAnnotations()));
        vo.setAllowDownload(intToBoolean(share.getAllowDownload()));
        vo.setAccessCount(share.getAccessCount());
        vo.setLastAccessAt(share.getLastAccessAt());
        vo.setCreatedBy(share.getCreatedBy());
        vo.setRevokedAt(share.getRevokedAt());
        vo.setCreatedAt(share.getCreatedAt());
        return vo;
    }

    private ArtifactSharePublicVO toPublicVO(ArtifactShareEntity share) {
        ArtifactSharePublicVO vo = new ArtifactSharePublicVO();
        vo.setId(share.getId());
        vo.setProjectId(share.getProjectId());
        vo.setRequirementPk(share.getRequirementPk());
        vo.setRequirementId(share.getRequirementId());
        vo.setArtifactPath(share.getArtifactPath());
        vo.setStatus(share.getStatus());
        vo.setExpireAt(share.getExpireAt());
        vo.setShowAnnotations(intToBoolean(share.getShowAnnotations()));
        vo.setAllowDownload(intToBoolean(share.getAllowDownload()));
        return vo;
    }
}
