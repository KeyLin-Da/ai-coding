package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.UserGitCredentialMapper;
import com.opp.aidelivery.center.model.AiDeliveryConstants;
import com.opp.aidelivery.center.model.dto.GitCredentialGenerateRequest;
import com.opp.aidelivery.center.model.entity.UserGitCredentialEntity;
import com.opp.aidelivery.center.model.vo.GitCredentialVO;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class GitCredentialService {

    private final UserGitCredentialMapper credentialMapper;

    public List<GitCredentialVO> list(Long userId) {
        return credentialMapper.selectList(new LambdaQueryWrapper<UserGitCredentialEntity>()
                .eq(UserGitCredentialEntity::getUserId, userId)
                .orderByDesc(UserGitCredentialEntity::getGeneratedAt))
            .stream()
            .map(this::toVO)
            .collect(Collectors.toList());
    }

    @Transactional(rollbackFor = Exception.class)
    public GitCredentialVO generate(Long userId, GitCredentialGenerateRequest request) {
        UserGitCredentialEntity entity = new UserGitCredentialEntity();
        entity.setUserId(userId);
        entity.setPlatform(normalizePlatform(request.getPlatform()));
        entity.setFingerprint(normalizeFingerprint(request.getFingerprint()));
        entity.setPublicKey(normalizePublicKey(request.getPublicKey()));
        entity.setStatus(AiDeliveryConstants.STATUS_ACTIVE);
        entity.setGeneratedAt(LocalDateTime.now());
        credentialMapper.insert(entity);
        return toVO(entity);
    }

    @Transactional(rollbackFor = Exception.class)
    public GitCredentialVO regenerate(Long userId, Long credentialId, GitCredentialGenerateRequest request) {
        UserGitCredentialEntity previous = credentialMapper.selectOne(new LambdaQueryWrapper<UserGitCredentialEntity>()
            .eq(UserGitCredentialEntity::getId, credentialId)
            .eq(UserGitCredentialEntity::getUserId, userId)
            .last("LIMIT 1"));
        if (previous == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "Git凭证不存在");
        }
        previous.setStatus("REVOKED");
        previous.setRevokedAt(LocalDateTime.now());
        credentialMapper.updateById(previous);
        return generate(userId, request);
    }

    private String normalizePlatform(String platform) {
        String value = platform == null ? "" : platform.trim().toUpperCase(Locale.ROOT);
        return value.isEmpty() ? "PROJECT_GIT" : value;
    }

    private String normalizeFingerprint(String fingerprint) {
        String value = fingerprint == null ? "" : fingerprint.trim();
        if (value.isEmpty()) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "Git凭证fingerprint不能为空");
        }
        return value;
    }

    private String normalizePublicKey(String publicKey) {
        String value = publicKey == null ? "" : publicKey.trim();
        if (value.isEmpty()) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "Git公钥不能为空");
        }
        return value;
    }

    private GitCredentialVO toVO(UserGitCredentialEntity entity) {
        GitCredentialVO vo = new GitCredentialVO();
        vo.setId(entity.getId());
        vo.setPlatform(entity.getPlatform());
        vo.setFingerprint(entity.getFingerprint());
        vo.setPublicKey(entity.getPublicKey());
        vo.setStatus(entity.getStatus());
        vo.setGeneratedAt(entity.getGeneratedAt());
        vo.setRevokedAt(entity.getRevokedAt());
        return vo;
    }
}
