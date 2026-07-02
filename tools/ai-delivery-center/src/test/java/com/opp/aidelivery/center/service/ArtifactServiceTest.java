package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.ArtifactGitVersionMapper;
import com.opp.aidelivery.center.mapper.ArtifactMapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.model.entity.ArtifactEntity;
import com.opp.aidelivery.center.model.entity.ArtifactGitVersionEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.vo.ArtifactPreviewUrlVO;
import com.opp.aidelivery.center.model.vo.ArtifactVersionVO;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ArtifactServiceTest {

    private static final String HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    @Mock
    private PermissionService permissionService;
    @Mock
    private ArtifactMapper artifactMapper;
    @Mock
    private RequirementMapper requirementMapper;
    @Mock
    private ArtifactGitVersionMapper artifactGitVersionMapper;

    private ArtifactService artifactService;

    @BeforeEach
    void setUp() {
        artifactService = new ArtifactService(permissionService, artifactMapper, requirementMapper, artifactGitVersionMapper);
    }

    @Test
    void listVersionsReturnsGitVersionsOnly() {
        // 验证产物版本列表只来自 Git 版本索引，并按业务版本号倒序返回。
        when(artifactMapper.selectById(200L)).thenReturn(artifact(401L));
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(artifactGitVersionMapper.selectList(any())).thenReturn(Arrays.asList(gitVersion(400L, 1), gitVersion(401L, 2)));

        List<ArtifactVersionVO> result = artifactService.listVersions(1L, 200L);

        assertThat(result).extracting("id").containsExactly(401L, 400L);
        assertThat(result).allSatisfy(item -> {
            assertThat(item.getSourceType()).isEqualTo("GIT");
            assertThat(item.getContentSha256()).isEqualTo(HASH);
            assertThat(item.getCommitSha()).isEqualTo("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
            assertThat(item.getFilePath()).isEqualTo("docs/172014/prd/analysis.md");
        });
    }

    @Test
    void currentVersionReturnsGitVersion() {
        // 验证 current_version_id 指向 ad_artifact_git_version。
        when(artifactMapper.selectById(200L)).thenReturn(artifact(401L));
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(artifactGitVersionMapper.selectById(401L)).thenReturn(gitVersion(401L, 2));

        ArtifactVersionVO result = artifactService.currentVersion(1L, 200L);

        assertThat(result.getId()).isEqualTo(401L);
        assertThat(result.getSourceType()).isEqualTo("GIT");
        assertThat(result.getBlobSha()).isEqualTo("blob-401");
    }

    @Test
    void previewUrlReturnsGitMetadata() {
        // 验证预览接口返回 Git 元数据，不生成外部对象存储 URL。
        when(artifactMapper.selectById(200L)).thenReturn(artifact(401L));
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(artifactGitVersionMapper.selectById(401L)).thenReturn(gitVersion(401L, 2));

        ArtifactPreviewUrlVO result = artifactService.previewUrl(1L, 200L, 401L);

        assertThat(result.getSourceType()).isEqualTo("GIT");
        assertThat(result.getCommitSha()).isEqualTo("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        assertThat(result.getFilePath()).isEqualTo("docs/172014/prd/analysis.md");
    }

    @Test
    void previewUrlRejectsUnauthorizedUserBeforeLoadingVersion() {
        when(artifactMapper.selectById(200L)).thenReturn(artifact(401L));
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        BusinessException denied = new BusinessException(AiDeliveryErrorCode.ACCESS_DENIED);
        org.mockito.Mockito.doThrow(denied).when(permissionService).assertProjectMember(2L, 10L);

        assertThatThrownBy(() -> artifactService.previewUrl(2L, 200L, 401L)).isSameAs(denied);

        verify(artifactGitVersionMapper, never()).selectById(401L);
    }

    private ArtifactEntity artifact(Long currentVersionId) {
        ArtifactEntity artifact = new ArtifactEntity();
        artifact.setId(200L);
        artifact.setRequirementPk(100L);
        artifact.setCurrentVersionId(currentVersionId);
        artifact.setLogicalPath("docs/172014/prd/analysis.md");
        artifact.setLabel("PRD");
        artifact.setKind("PRD");
        artifact.setStage("PRD");
        artifact.setVersion(0L);
        return artifact;
    }

    private ArtifactGitVersionEntity gitVersion(Long id, int versionNo) {
        ArtifactGitVersionEntity version = new ArtifactGitVersionEntity();
        version.setId(id);
        version.setArtifactId(200L);
        version.setVersionNo(versionNo);
        version.setCommitSha("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        version.setBlobSha("blob-" + id);
        version.setContentSha256(HASH);
        version.setFilePath("docs/172014/prd/analysis.md");
        version.setStatus("CURRENT");
        version.setCreatedBy(1L);
        return version;
    }

    private RequirementEntity requirement() {
        RequirementEntity requirement = new RequirementEntity();
        requirement.setId(100L);
        requirement.setProjectId(10L);
        requirement.setRequirementId("172014");
        return requirement;
    }
}
