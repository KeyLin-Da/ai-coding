package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.mapper.ArtifactGitVersionMapper;
import com.opp.aidelivery.center.mapper.ArtifactMapper;
import com.opp.aidelivery.center.mapper.ArtifactSyncMapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.mapper.UserProjectRepoStateMapper;
import com.opp.aidelivery.center.model.dto.ArtifactGitSyncCompleteRequest;
import com.opp.aidelivery.center.model.dto.ArtifactGitSyncFileRequest;
import com.opp.aidelivery.center.model.dto.ArtifactGitSyncReviewRequest;
import com.opp.aidelivery.center.model.dto.StageReviewRequest;
import com.opp.aidelivery.center.model.entity.ArtifactEntity;
import com.opp.aidelivery.center.model.entity.ArtifactGitVersionEntity;
import com.opp.aidelivery.center.model.entity.ArtifactSyncEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import java.util.Collections;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ArtifactGitSyncServiceTest {

    @Mock
    private PermissionService permissionService;
    @Mock
    private RequirementMapper requirementMapper;
    @Mock
    private ArtifactMapper artifactMapper;
    @Mock
    private ArtifactGitVersionMapper artifactGitVersionMapper;
    @Mock
    private ArtifactSyncMapper artifactSyncMapper;
    @Mock
    private UserProjectRepoStateMapper userProjectRepoStateMapper;
    @Mock
    private DomainEventService domainEventService;
    @Mock
    private ReviewService reviewService;

    private ArtifactGitSyncService service;

    @BeforeEach
    void setUp() {
        service = new ArtifactGitSyncService(
            permissionService,
            requirementMapper,
            artifactMapper,
            artifactGitVersionMapper,
            artifactSyncMapper,
            userProjectRepoStateMapper,
            domainEventService,
            reviewService
        );
    }

    @Test
    void completeWritesGitVersionAndCurrentPointer() {
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(artifactMapper.selectOne(any())).thenReturn(artifact());
        when(artifactGitVersionMapper.selectList(any())).thenReturn(Collections.emptyList());
        org.mockito.Mockito.doAnswer(invocation -> {
            invocation.<ArtifactSyncEntity>getArgument(0).setId(600L);
            return 1;
        }).when(artifactSyncMapper).insert(any(ArtifactSyncEntity.class));
        org.mockito.Mockito.doAnswer(invocation -> {
            invocation.<ArtifactGitVersionEntity>getArgument(0).setId(700L);
            return 1;
        }).when(artifactGitVersionMapper).insert(any(ArtifactGitVersionEntity.class));

        assertThat(service.complete(1L, 100L, request()).getVersions()).hasSize(1);

        ArgumentCaptor<ArtifactGitVersionEntity> versionCaptor = ArgumentCaptor.forClass(ArtifactGitVersionEntity.class);
        verify(artifactGitVersionMapper).insert(versionCaptor.capture());
        assertThat(versionCaptor.getValue().getCommitSha()).isEqualTo("0123456789abcdef0123456789abcdef01234567");
        assertThat(versionCaptor.getValue().getFilePath()).isEqualTo("docs/172014/prd/analysis.md");
        ArgumentCaptor<ArtifactEntity> artifactCaptor = ArgumentCaptor.forClass(ArtifactEntity.class);
        verify(artifactMapper).updateById(artifactCaptor.capture());
        assertThat(artifactCaptor.getValue().getCurrentVersionId()).isEqualTo(700L);
        verify(domainEventService).publishAfterCommit(eq(10L), eq("artifact.git-sync.completed"), eq("REQUIREMENT"), eq(100L), anyString());
    }

    @Test
    void completeAndReviewCreatesReviewAfterGitIndex() {
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(artifactMapper.selectOne(any())).thenReturn(artifact());
        when(artifactGitVersionMapper.selectList(any())).thenReturn(Collections.emptyList());
        org.mockito.Mockito.doAnswer(invocation -> {
            invocation.<ArtifactGitVersionEntity>getArgument(0).setId(700L);
            return 1;
        }).when(artifactGitVersionMapper).insert(any(ArtifactGitVersionEntity.class));
        ArtifactGitSyncCompleteRequest request = request();
        ArtifactGitSyncReviewRequest review = new ArtifactGitSyncReviewRequest();
        review.setDecision("APPROVED");
        review.setComment("通过");
        request.setReview(review);

        service.completeAndReview(1L, 100L, request);

        ArgumentCaptor<StageReviewRequest> reviewCaptor = ArgumentCaptor.forClass(StageReviewRequest.class);
        verify(reviewService).review(eq(1L), reviewCaptor.capture());
        assertThat(reviewCaptor.getValue().getArtifactVersionId()).isEqualTo(700L);
        assertThat(reviewCaptor.getValue().getDecision()).isEqualTo("APPROVED");
    }

    @Test
    void completeCreatesRetrospectiveArtifactKindFromPath() {
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(artifactMapper.selectOne(any())).thenReturn(null);
        when(artifactGitVersionMapper.selectList(any())).thenReturn(Collections.emptyList());
        ArtifactGitSyncCompleteRequest request = request();
        request.setStage("RETROSPECTIVE");
        request.getFiles().get(0).setPath("docs/172014/retrospective/summary.md");

        service.complete(1L, 100L, request);

        ArgumentCaptor<ArtifactEntity> artifactCaptor = ArgumentCaptor.forClass(ArtifactEntity.class);
        verify(artifactMapper).insert(artifactCaptor.capture());
        assertThat(artifactCaptor.getValue().getStage()).isEqualTo("RETROSPECTIVE");
        assertThat(artifactCaptor.getValue().getKind()).isEqualTo("RETROSPECTIVE");
        assertThat(artifactCaptor.getValue().getLogicalPath()).isEqualTo("docs/172014/retrospective/summary.md");
    }

    private ArtifactGitSyncCompleteRequest request() {
        ArtifactGitSyncFileRequest file = new ArtifactGitSyncFileRequest();
        file.setPath("docs/172014/prd/analysis.md");
        file.setBlobSha("100644:abc123");
        file.setContentSha256("abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd");
        ArtifactGitSyncCompleteRequest request = new ArtifactGitSyncCompleteRequest();
        request.setStage("PRD");
        request.setSyncType("REVIEW_APPROVAL");
        request.setCommitSha("0123456789abcdef0123456789abcdef01234567");
        request.setFiles(Collections.singletonList(file));
        return request;
    }

    private RequirementEntity requirement() {
        RequirementEntity requirement = new RequirementEntity();
        requirement.setId(100L);
        requirement.setProjectId(10L);
        requirement.setRequirementId("172014");
        return requirement;
    }

    private ArtifactEntity artifact() {
        ArtifactEntity artifact = new ArtifactEntity();
        artifact.setId(200L);
        artifact.setRequirementPk(100L);
        artifact.setLogicalPath("docs/172014/prd/analysis.md");
        artifact.setStage("PRD");
        return artifact;
    }
}
