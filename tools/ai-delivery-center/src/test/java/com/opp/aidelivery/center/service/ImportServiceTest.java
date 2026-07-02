package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.ArtifactMapper;
import com.opp.aidelivery.center.mapper.ImportItemMapper;
import com.opp.aidelivery.center.mapper.ImportSessionMapper;
import com.opp.aidelivery.center.mapper.IssueMapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.mapper.ReviewMapper;
import com.opp.aidelivery.center.mapper.RunEventMapper;
import com.opp.aidelivery.center.mapper.RunMapper;
import com.opp.aidelivery.center.mapper.WorkflowStageMapper;
import com.opp.aidelivery.center.model.dto.ImportRecordsRequest;
import com.opp.aidelivery.center.model.dto.ImportSessionCreateRequest;
import com.opp.aidelivery.center.model.entity.ArtifactEntity;
import com.opp.aidelivery.center.model.entity.ImportItemEntity;
import com.opp.aidelivery.center.model.entity.ImportSessionEntity;
import com.opp.aidelivery.center.model.entity.ProjectEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.entity.WorkflowStageEntity;
import com.opp.aidelivery.center.model.vo.ImportRecordsResultVO;
import com.opp.aidelivery.center.model.vo.ImportSessionVO;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ImportServiceTest {

    @Mock
    private PermissionService permissionService;
    @Mock
    private ImportSessionMapper importSessionMapper;
    @Mock
    private ImportItemMapper importItemMapper;
    @Mock
    private RequirementMapper requirementMapper;
    @Mock
    private WorkflowStageMapper workflowStageMapper;
    @Mock
    private ReviewMapper reviewMapper;
    @Mock
    private IssueMapper issueMapper;
    @Mock
    private RunMapper runMapper;
    @Mock
    private RunEventMapper runEventMapper;
    @Mock
    private ArtifactMapper artifactMapper;

    private final List<ImportItemEntity> importItems = new ArrayList<>();
    private final AtomicReference<ImportSessionEntity> currentSession = new AtomicReference<>();
    private final AtomicReference<RequirementEntity> currentRequirement = new AtomicReference<>();
    private final AtomicReference<ArtifactEntity> currentArtifact = new AtomicReference<>();
    private ImportService importService;

    @BeforeEach
    void setUp() {
        importService = new ImportService(
            permissionService,
            importSessionMapper,
            importItemMapper,
            requirementMapper,
            workflowStageMapper,
            reviewMapper,
            issueMapper,
            runMapper,
            runEventMapper,
            artifactMapper
        );
        lenient().when(permissionService.assertProjectMember(1L, 10L)).thenReturn(project());
        lenient().when(importSessionMapper.selectById(100L)).thenAnswer(invocation -> currentSession.get());
        lenient().when(importItemMapper.selectOne(any())).thenReturn(null);
        lenient().when(importItemMapper.selectList(any())).thenReturn(importItems);
        AtomicLong itemId = new AtomicLong(1L);
        lenient().when(importItemMapper.insert(any(ImportItemEntity.class))).thenAnswer(invocation -> {
            ImportItemEntity entity = invocation.getArgument(0);
            entity.setId(itemId.getAndIncrement());
            importItems.add(entity);
            return 1;
        });
    }

    @Test
    void createSessionRecordsProjectActorAndInitialCounters() {
        // 验证初始化导入会话会记录项目、操作者和计数器，后续 dry-run/import 才有审计入口。
        when(importSessionMapper.insert(any(ImportSessionEntity.class))).thenAnswer(invocation -> {
            ImportSessionEntity entity = invocation.getArgument(0);
            entity.setId(100L);
            currentSession.set(entity);
            return 1;
        });
        ImportSessionCreateRequest request = new ImportSessionCreateRequest();
        request.setProjectId(10L);
        request.setManifestSha256("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");

        ImportSessionVO result = importService.createSession(1L, request);

        assertThat(result.getId()).isEqualTo(100L);
        assertThat(result.getProjectId()).isEqualTo(10L);
        assertThat(result.getImportedCount()).isZero();
        assertThat(result.getStatus()).isEqualTo("RUNNING");
    }

    @Test
    void importRecordsUpsertsRequirementAndArtifact() {
        // 验证正式导入会先 upsert 需求，再为同一需求创建逻辑产物，且结果写入导入明细。
        currentSession.set(session());
        when(requirementMapper.selectOne(any())).thenAnswer(invocation -> currentRequirement.get());
        when(requirementMapper.insert(any(RequirementEntity.class))).thenAnswer(invocation -> {
            RequirementEntity entity = invocation.getArgument(0);
            entity.setId(200L);
            currentRequirement.set(entity);
            return 1;
        });
        when(workflowStageMapper.selectOne(any())).thenReturn(null);
        when(workflowStageMapper.insert(any(WorkflowStageEntity.class))).thenReturn(1);
        when(artifactMapper.selectOne(any())).thenAnswer(invocation -> currentArtifact.get());
        when(artifactMapper.insert(any(ArtifactEntity.class))).thenAnswer(invocation -> {
            ArtifactEntity entity = invocation.getArgument(0);
            entity.setId(300L);
            currentArtifact.set(entity);
            return 1;
        });

        ImportRecordsResultVO result = importService.importRecords(1L, 100L, recordsRequest(false));

        assertThat(result.getImportedCount()).isEqualTo(2);
        assertThat(importItems).extracting(ImportItemEntity::getItemType).contains("REQUIREMENT", "ARTIFACT");
        assertThat(currentRequirement.get().getRequirementId()).isEqualTo("172014");
        assertThat(currentArtifact.get().getLogicalPath()).isEqualTo("docs/172014/prd/analysis.md");
    }

    @Test
    void importArtifactRecordsExistingLogicalArtifactWithoutVersionLookup() {
        // 验证 Git-only 后导入只维护逻辑产物，具体版本由后续 Git sync 写入。
        currentSession.set(session());
        RequirementEntity requirement = requirement();
        currentRequirement.set(requirement);
        ArtifactEntity artifact = artifact();
        currentArtifact.set(artifact);
        when(requirementMapper.selectOne(any())).thenReturn(requirement);
        when(artifactMapper.selectOne(any())).thenReturn(artifact);

        ImportRecordsResultVO result = importService.importRecords(1L, 100L, recordsRequest(true));

        assertThat(result.getImportedCount()).isEqualTo(1);
        assertThat(result.getResults().get(0).getTargetType()).isEqualTo("ARTIFACT");
        assertThat(result.getResults().get(0).getArtifactId()).isEqualTo(300L);
    }

    @Test
    void importRecordsRejectsUnauthorizedProject() {
        // 验证用户无项目权限时，导入会话不可继续写入，避免跨项目污染中心事实。
        currentSession.set(session());
        when(permissionService.assertProjectMember(1L, 10L))
            .thenThrow(new BusinessException(AiDeliveryErrorCode.ACCESS_DENIED, "无权限"));

        assertThatThrownBy(() -> importService.importRecords(1L, 100L, recordsRequest(false)))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.IMPORT_PROJECT_DENIED);
    }

    @Test
    void duplicateArtifactSourceKeyReturnsDuplicatedWithoutWritingAgain() {
        // 验证相同 logicalPath + sha256 已处理时直接返回 DUPLICATED，不重复创建 artifact。
        currentSession.set(session());
        ImportItemEntity existing = new ImportItemEntity();
        existing.setId(9L);
        existing.setImportSessionId(100L);
        existing.setItemType("ARTIFACT");
        existing.setSourceKey("ARTIFACT:172014:docs/172014/prd/analysis.md:" + hash());
        existing.setSourceSha256(hash());
        existing.setTargetType("ARTIFACT");
        existing.setTargetId(300L);
        existing.setStatus("IMPORTED");
        when(importItemMapper.selectOne(any())).thenReturn(existing);

        ImportRecordsResultVO result = importService.importRecords(1L, 100L, recordsRequest(true));

        assertThat(result.getDuplicatedCount()).isEqualTo(1);
        assertThat(result.getResults().get(0).getStatus()).isEqualTo("DUPLICATED");
        assertThat(result.getResults().get(0).getArtifactId()).isEqualTo(300L);
    }

    @Test
    void importRejectsLocalAbsolutePath() {
        // 验证中心服务不会把本地绝对路径或敏感路径写入共享事实。
        currentSession.set(session());

        ImportRecordsRequest request = new ImportRecordsRequest();
        ImportRecordsRequest.ArtifactImportRequest artifact = artifactRequest();
        artifact.setLogicalPath("/Users/me/.env");
        request.getArtifacts().add(artifact);

        assertThatThrownBy(() -> importService.importRecords(1L, 100L, request))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.IMPORT_PAYLOAD_UNSAFE);
    }

    @Test
    void stageImportReturnsConflictWhenCenterStageAlreadyApproved() {
        // 验证历史导入不能把中心已通过阶段回退成未通过状态。
        currentSession.set(session());
        when(requirementMapper.selectOne(any())).thenReturn(requirement());
        WorkflowStageEntity approved = new WorkflowStageEntity();
        approved.setId(400L);
        approved.setStage("PRD");
        approved.setStatus("APPROVED");
        when(workflowStageMapper.selectOne(any())).thenReturn(approved);

        ImportRecordsRequest request = new ImportRecordsRequest();
        ImportRecordsRequest.StageImportRequest stage = new ImportRecordsRequest.StageImportRequest();
        stage.setRequirementId("172014");
        stage.setStage("PRD");
        stage.setStatus("DRAFT");
        request.getStages().add(stage);

        ImportRecordsResultVO result = importService.importRecords(1L, 100L, request);

        assertThat(result.getConflictedCount()).isEqualTo(1);
        assertThat(importItems.get(0).getStatus()).isEqualTo("CONFLICTED");
    }

    private ImportRecordsRequest recordsRequest(boolean artifactOnly) {
        ImportRecordsRequest request = new ImportRecordsRequest();
        if (!artifactOnly) {
            ImportRecordsRequest.RequirementImportRequest requirement = new ImportRecordsRequest.RequirementImportRequest();
            requirement.setRequirementId("172014");
            requirement.setTitle("定位菜单");
            request.getRequirements().add(requirement);
        }
        request.getArtifacts().add(artifactRequest());
        return request;
    }

    private ImportRecordsRequest.ArtifactImportRequest artifactRequest() {
        ImportRecordsRequest.ArtifactImportRequest artifact = new ImportRecordsRequest.ArtifactImportRequest();
        artifact.setRequirementId("172014");
        artifact.setLogicalPath("docs/172014/prd/analysis.md");
        artifact.setLabel("PRD");
        artifact.setKind("PRD");
        artifact.setStage("PRD");
        artifact.setSha256(hash());
        artifact.setSize(10L);
        artifact.setContentType("text/markdown");
        return artifact;
    }

    private ImportSessionEntity session() {
        ImportSessionEntity session = new ImportSessionEntity();
        session.setId(100L);
        session.setProjectId(10L);
        session.setStatus("RUNNING");
        session.setMode("IMPORT");
        session.setSource("LOCAL_BOOTSTRAP");
        session.setCreatedBy(1L);
        return session;
    }

    private RequirementEntity requirement() {
        RequirementEntity requirement = new RequirementEntity();
        requirement.setId(200L);
        requirement.setProjectId(10L);
        requirement.setRequirementId("172014");
        requirement.setTitle("定位菜单");
        requirement.setCurrentStage("PRD");
        requirement.setStatus("DRAFT");
        return requirement;
    }

    private ArtifactEntity artifact() {
        ArtifactEntity artifact = new ArtifactEntity();
        artifact.setId(300L);
        artifact.setRequirementPk(200L);
        artifact.setLogicalPath("docs/172014/prd/analysis.md");
        artifact.setLabel("PRD");
        artifact.setKind("PRD");
        artifact.setStage("PRD");
        artifact.setVersion(0L);
        return artifact;
    }

    private ProjectEntity project() {
        ProjectEntity project = new ProjectEntity();
        project.setId(10L);
        project.setTeamId(20L);
        return project;
    }

    private String hash() {
        return "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    }
}
