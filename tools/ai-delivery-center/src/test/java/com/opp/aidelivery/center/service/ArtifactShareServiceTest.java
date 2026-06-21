package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.ArtifactShareMapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.model.dto.ArtifactShareCreateRequest;
import com.opp.aidelivery.center.model.entity.ArtifactShareEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.vo.ArtifactSharePublicVO;
import com.opp.aidelivery.center.model.vo.ArtifactShareVO;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ArtifactShareServiceTest {

    @Mock
    private PermissionService permissionService;
    @Mock
    private RequirementMapper requirementMapper;
    @Mock
    private ArtifactShareMapper artifactShareMapper;

    private ArtifactShareService artifactShareService;

    @BeforeEach
    void setUp() {
        artifactShareService = new ArtifactShareService(permissionService, requirementMapper, artifactShareMapper);
    }

    @Test
    void createPublicShareStoresTokenHashOnly() {
        // 公开分享只返回本次创建的明文 token，数据库保存 SHA-256 摘要，避免泄露可访问链接。
        when(requirementMapper.selectOne(any())).thenReturn(requirement());
        when(artifactShareMapper.selectOne(any())).thenReturn(null);
        when(artifactShareMapper.insert(any())).thenAnswer(invocation -> {
            ArtifactShareEntity share = invocation.getArgument(0);
            share.setId(300L);
            return 1;
        });

        ArtifactShareVO result = artifactShareService.createPublicShare(1L, request("docs/172014/technical-design/design_review.md"));

        ArgumentCaptor<ArtifactShareEntity> captor = ArgumentCaptor.forClass(ArtifactShareEntity.class);
        verify(artifactShareMapper).insert(captor.capture());
        ArtifactShareEntity stored = captor.getValue();
        assertThat(result.getToken()).isNotBlank();
        assertThat(stored.getTokenHash()).hasSize(64);
        assertThat(stored.getTokenHash()).isNotEqualTo(result.getToken());
        assertThat(stored.getProjectId()).isEqualTo(10L);
        assertThat(stored.getRequirementId()).isEqualTo("172014");
        assertThat(stored.getShowAnnotations()).isEqualTo(1);
        assertThat(stored.getAllowDownload()).isEqualTo(1);
    }

    @Test
    void createPublicShareRejectsWorkflowAndRunLogPaths() {
        when(requirementMapper.selectOne(any())).thenReturn(requirement());

        assertThatThrownBy(() -> artifactShareService.createPublicShare(1L, request("docs/172014/workflow/state.json")))
            .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getErrorCode()).isEqualTo(AiDeliveryErrorCode.ARTIFACT_SHARE_PATH_DENIED));
        assertThatThrownBy(() -> artifactShareService.createPublicShare(1L, request("docs/172014/reports/run-abc.log")))
            .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getErrorCode()).isEqualTo(AiDeliveryErrorCode.ARTIFACT_SHARE_PATH_DENIED));

        verify(artifactShareMapper, never()).insert(any());
    }

    @Test
    void createPublicShareRejectsUnauthorizedUserBeforeInsert() {
        // 未授权用户不能创建公开链接，避免绕过项目成员关系分享产物。
        BusinessException denied = new BusinessException(AiDeliveryErrorCode.ACCESS_DENIED);
        doThrow(denied).when(permissionService).assertProjectMember(2L, 10L);

        assertThatThrownBy(() -> artifactShareService.createPublicShare(2L, request("docs/172014/technical-design/design_review.md")))
            .isSameAs(denied);

        verify(requirementMapper, never()).selectOne(any());
        verify(artifactShareMapper, never()).insert(any());
    }

    @Test
    void resolvePublicShareRejectsExpiredToken() {
        ArtifactShareEntity share = share();
        share.setExpireAt(LocalDateTime.now().minusMinutes(1));
        when(artifactShareMapper.selectOne(any())).thenReturn(share);

        assertThatThrownBy(() -> artifactShareService.resolvePublicShare("public-token"))
            .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getErrorCode()).isEqualTo(AiDeliveryErrorCode.ARTIFACT_SHARE_INVALID));

        verify(artifactShareMapper, never()).updateById(any());
    }

    @Test
    void resolvePublicShareRejectsRevokedToken() {
        ArtifactShareEntity share = share();
        share.setStatus("REVOKED");
        when(artifactShareMapper.selectOne(any())).thenReturn(share);

        assertThatThrownBy(() -> artifactShareService.resolvePublicShare("public-token"))
            .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getErrorCode()).isEqualTo(AiDeliveryErrorCode.ARTIFACT_SHARE_INVALID));

        verify(artifactShareMapper, never()).updateById(any());
    }

    @Test
    void resolvePublicShareIncrementsAccessCount() {
        ArtifactShareEntity share = share();
        share.setAccessCount(2L);
        when(artifactShareMapper.selectOne(any())).thenReturn(share);

        ArtifactSharePublicVO result = artifactShareService.resolvePublicShare("public-token");

        assertThat(result.getArtifactPath()).isEqualTo("docs/172014/technical-design/design_review.md");
        assertThat(share.getAccessCount()).isEqualTo(3L);
        assertThat(share.getLastAccessAt()).isNotNull();
        verify(artifactShareMapper).updateById(share);
    }

    @Test
    void resolvePublicShareForAnnotationsRejectsHiddenAnnotations() {
        ArtifactShareEntity share = share();
        share.setShowAnnotations(0);
        when(artifactShareMapper.selectOne(any())).thenReturn(share);

        assertThatThrownBy(() -> artifactShareService.resolvePublicShareForAnnotations("public-token"))
            .isInstanceOfSatisfying(BusinessException.class, ex ->
                assertThat(ex.getErrorCode()).isEqualTo(AiDeliveryErrorCode.ARTIFACT_SHARE_ANNOTATIONS_DISABLED)
            );

        verify(artifactShareMapper, never()).updateById(any());
    }

    @Test
    void resolvePublicShareForAnnotationsReturnsShareWhenEnabled() {
        ArtifactShareEntity share = share();
        when(artifactShareMapper.selectOne(any())).thenReturn(share);

        ArtifactSharePublicVO result = artifactShareService.resolvePublicShareForAnnotations("public-token");

        assertThat(result.getRequirementPk()).isEqualTo(100L);
        assertThat(result.getShowAnnotations()).isTrue();
        assertThat(result.getRealtimeChannel()).isEqualTo(share.getTokenHash());
        verify(artifactShareMapper, never()).updateById(any());
    }

    @Test
    void realtimeSubscriptionRequiresMatchingActiveTokenChannel() {
        ArtifactShareEntity share = share();
        when(artifactShareMapper.selectOne(any())).thenReturn(share);

        artifactShareService.assertRealtimeAnnotationSubscription("public-token", 300L, share.getTokenHash());

        assertThatThrownBy(() -> artifactShareService.assertRealtimeAnnotationSubscription("public-token", 301L, share.getTokenHash()))
            .isInstanceOfSatisfying(BusinessException.class, ex ->
                assertThat(ex.getErrorCode()).isEqualTo(AiDeliveryErrorCode.WEBSOCKET_SUBSCRIBE_DENIED)
            );
        assertThatThrownBy(() -> artifactShareService.assertRealtimeAnnotationSubscription("public-token", 300L, "old-channel"))
            .isInstanceOfSatisfying(BusinessException.class, ex ->
                assertThat(ex.getErrorCode()).isEqualTo(AiDeliveryErrorCode.WEBSOCKET_SUBSCRIBE_DENIED)
            );
    }

    @Test
    void realtimeChannelsExcludeExpiredAndNonTechnicalDesignShares() {
        ArtifactShareEntity valid = share();
        ArtifactShareEntity expired = share();
        expired.setId(301L);
        expired.setExpireAt(LocalDateTime.now().minusMinutes(1));
        ArtifactShareEntity prd = share();
        prd.setId(302L);
        prd.setArtifactPath("docs/172014/prd/analysis.md");
        when(artifactShareMapper.selectList(any())).thenReturn(Arrays.asList(valid, expired, prd));

        Map<Long, String> channels = artifactShareService.listRealtimeAnnotationChannels(100L);

        assertThat(channels).containsOnlyKeys(300L);
        assertThat(channels.get(300L)).isEqualTo(valid.getTokenHash());
    }

    @Test
    void regeneratePublicShareTokenReplacesHashAndReturnsNewToken() {
        ArtifactShareEntity share = share();
        share.setTokenHash("old-token-hash");
        when(artifactShareMapper.selectById(300L)).thenReturn(share);
        when(artifactShareMapper.selectOne(any())).thenReturn(null);

        ArtifactShareVO result = artifactShareService.regeneratePublicShareToken(1L, 300L);

        assertThat(result.getToken()).isNotBlank();
        assertThat(share.getTokenHash()).hasSize(64);
        assertThat(share.getTokenHash()).isNotEqualTo("old-token-hash");
        assertThat(share.getTokenHash()).isNotEqualTo(result.getToken());
        verify(permissionService).assertProjectMember(1L, 10L);
        verify(artifactShareMapper).updateById(share);
    }

    private ArtifactShareCreateRequest request(String artifactPath) {
        ArtifactShareCreateRequest request = new ArtifactShareCreateRequest();
        request.setProjectId(10L);
        request.setRequirementId("172014");
        request.setArtifactPath(artifactPath);
        return request;
    }

    private RequirementEntity requirement() {
        RequirementEntity requirement = new RequirementEntity();
        requirement.setId(100L);
        requirement.setProjectId(10L);
        requirement.setRequirementId("172014");
        return requirement;
    }

    private ArtifactShareEntity share() {
        ArtifactShareEntity share = new ArtifactShareEntity();
        share.setId(300L);
        share.setProjectId(10L);
        share.setRequirementPk(100L);
        share.setRequirementId("172014");
        share.setArtifactPath("docs/172014/technical-design/design_review.md");
        share.setVisibility("PUBLIC");
        share.setTokenHash("0a11c586276e130d0bcd50c28ea06b6aeb63f2e99d0e41c56cf4e4178ae2590a");
        share.setStatus("ENABLED");
        share.setShowAnnotations(1);
        share.setAllowDownload(1);
        share.setAccessCount(0L);
        return share;
    }
}
