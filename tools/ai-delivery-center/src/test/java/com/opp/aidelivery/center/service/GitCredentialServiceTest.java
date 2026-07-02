package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.UserGitCredentialMapper;
import com.opp.aidelivery.center.model.AiDeliveryConstants;
import com.opp.aidelivery.center.model.dto.GitCredentialGenerateRequest;
import com.opp.aidelivery.center.model.entity.UserGitCredentialEntity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class GitCredentialServiceTest {

    @Mock
    private UserGitCredentialMapper credentialMapper;

    private GitCredentialService service;

    @BeforeEach
    void setUp() {
        service = new GitCredentialService(credentialMapper);
    }

    @Test
    void generateStoresPublicKeyOnly() {
        assertThat(service.generate(1L, request("project_git", "SHA256:abc")).getPlatform()).isEqualTo("PROJECT_GIT");

        ArgumentCaptor<UserGitCredentialEntity> captor = ArgumentCaptor.forClass(UserGitCredentialEntity.class);
        verify(credentialMapper).insert(captor.capture());
        assertThat(captor.getValue().getUserId()).isEqualTo(1L);
        assertThat(captor.getValue().getFingerprint()).isEqualTo("SHA256:abc");
        assertThat(captor.getValue().getPublicKey()).startsWith("ssh-ed25519");
        assertThat(captor.getValue().getStatus()).isEqualTo(AiDeliveryConstants.STATUS_ACTIVE);
    }

    @Test
    void regenerateRevokesPreviousCredential() {
        UserGitCredentialEntity previous = new UserGitCredentialEntity();
        previous.setId(10L);
        previous.setUserId(1L);
        previous.setStatus(AiDeliveryConstants.STATUS_ACTIVE);
        when(credentialMapper.selectOne(any())).thenReturn(previous);

        service.regenerate(1L, 10L, request("GITLAB", "SHA256:new"));

        assertThat(previous.getStatus()).isEqualTo("REVOKED");
        assertThat(previous.getRevokedAt()).isNotNull();
        verify(credentialMapper).updateById(previous);
        verify(credentialMapper).insert(any(UserGitCredentialEntity.class));
    }

    @Test
    void generateRejectsBlankFingerprint() {
        assertThatThrownBy(() -> service.generate(1L, request("GITLAB", " ")))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.VALIDATION_FAILED);
    }

    private GitCredentialGenerateRequest request(String platform, String fingerprint) {
        GitCredentialGenerateRequest request = new GitCredentialGenerateRequest();
        request.setPlatform(platform);
        request.setFingerprint(fingerprint);
        request.setPublicKey("ssh-ed25519 AAAATEST ai-delivery");
        return request;
    }
}
