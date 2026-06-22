package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.mapper.RunMapper;
import com.opp.aidelivery.center.model.dto.RunTokenUsageCreateRequest;
import com.opp.aidelivery.center.model.dto.RunTokenUsageValueRequest;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.entity.RunEntity;
import com.opp.aidelivery.center.model.entity.RunTokenUsageEntity;
import com.opp.aidelivery.center.model.vo.RequirementTokenUsageSummaryVO;
import com.opp.aidelivery.center.model.vo.RunTokenUsageRunVO;
import com.opp.aidelivery.center.model.vo.RunTokenUsageSaveVO;
import com.opp.aidelivery.center.repository.RunTokenUsageRepository;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class RunTokenUsageServiceTest {

    private static final String FINGERPRINT = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    @Mock
    private PermissionService permissionService;
    @Mock
    private RunMapper runMapper;
    @Mock
    private RequirementMapper requirementMapper;
    @Mock
    private RunTokenUsageRepository runTokenUsageRepository;

    private RunTokenUsageService runTokenUsageService;

    @BeforeEach
    void setUp() {
        runTokenUsageService = new RunTokenUsageService(permissionService, runMapper, requirementMapper, runTokenUsageRepository);
    }

    @Test
    void appendPersistsFirstUsageAndReturnsRunSummary() {
        stubAuthorizedRun();
        AtomicReference<RunTokenUsageEntity> saved = new AtomicReference<>();
        doAnswer(invocation -> {
            RunTokenUsageEntity entity = invocation.getArgument(0);
            entity.setId(1L);
            entity.setCreatedAt(LocalDateTime.of(2026, 6, 22, 10, 21));
            saved.set(entity);
            return entity;
        }).when(runTokenUsageRepository).append(any(RunTokenUsageEntity.class));
        when(runTokenUsageRepository.listByRunId(700L)).thenAnswer(invocation -> Collections.singletonList(saved.get()));

        RunTokenUsageSaveVO result = runTokenUsageService.append(1L, request());

        assertThat(result.getDetail().getRunId()).isEqualTo(700L);
        assertThat(result.getDetail().getRequirementPk()).isEqualTo(100L);
        assertThat(result.getDetail().getClientSessionId()).isEqualTo(900L);
        assertThat(result.getDetail().getInputTokens()).isEqualTo(60835L);
        assertThat(result.getDetail().getTotalTokens()).isEqualTo(61129L);
        assertThat(result.getRunSummary().getTotalTokens()).isEqualTo(61129L);
        assertThat(result.getRunSummary().getDetailCount()).isEqualTo(1L);
        verify(permissionService).assertProjectMember(1L, 10L);
    }

    @Test
    void appendDuplicateUsageReturnsExistingDetailWithoutDoubleCounting() {
        stubAuthorizedRun();
        RunTokenUsageEntity existing = usageEntity(1L, 700L, 100L, 61129L, "TECH_DESIGN", "codex",
            LocalDateTime.of(2026, 6, 22, 10, 20));
        when(runTokenUsageRepository.findByRunIdAndFingerprint(700L, FINGERPRINT)).thenReturn(existing);
        when(runTokenUsageRepository.listByRunId(700L)).thenReturn(Collections.singletonList(existing));

        RunTokenUsageSaveVO result = runTokenUsageService.append(1L, request());

        assertThat(result.getDetail().getId()).isEqualTo(1L);
        assertThat(result.getRunSummary().getTotalTokens()).isEqualTo(61129L);
        assertThat(result.getRunSummary().getDetailCount()).isEqualTo(1L);
        verify(runTokenUsageRepository, never()).append(any(RunTokenUsageEntity.class));
    }

    @Test
    void appendRejectsUnauthorizedRunBeforeWritingUsage() {
        stubRunAndRequirement();
        doThrow(new BusinessException(AiDeliveryErrorCode.ACCESS_DENIED))
            .when(permissionService).assertProjectMember(2L, 10L);

        assertThatThrownBy(() -> runTokenUsageService.append(2L, request()))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.ACCESS_DENIED);

        verify(runTokenUsageRepository, never()).append(any(RunTokenUsageEntity.class));
    }

    @Test
    void listByRunReturnsZeroSummaryWhenNoUsageExists() {
        stubAuthorizedRun();
        when(runTokenUsageRepository.listByRunId(700L)).thenReturn(Collections.emptyList());

        RunTokenUsageRunVO result = runTokenUsageService.listByRun(1L, 700L);

        assertThat(result.getRunId()).isEqualTo(700L);
        assertThat(result.getDetails()).isEmpty();
        assertThat(result.getSummary().getTotalTokens()).isZero();
        assertThat(result.getSummary().getInputTokens()).isZero();
        assertThat(result.getSummary().getDetailCount()).isZero();
    }

    @Test
    void summarizeRequirementAggregatesByStageAgentAndLatestRun() {
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(runTokenUsageRepository.listByRequirementPk(eq(100L), eq(null), eq(null), eq(null), eq(null)))
            .thenReturn(Arrays.asList(
                usageEntity(1L, 700L, 100L, 12L, "TECH_DESIGN", "codex", LocalDateTime.of(2026, 6, 22, 10, 20)),
                usageEntity(2L, 700L, 100L, 8L, "TECH_DESIGN", "codex", LocalDateTime.of(2026, 6, 22, 10, 21)),
                usageEntity(3L, 701L, 100L, 5L, "IMPLEMENTATION", "codex", LocalDateTime.of(2026, 6, 22, 10, 30))));

        RequirementTokenUsageSummaryVO result = runTokenUsageService.summarizeRequirement(1L, 100L, null, null, null, null);

        assertThat(result.getSummary().getTotalTokens()).isEqualTo(25L);
        assertThat(result.getSummary().getRunCount()).isEqualTo(2L);
        assertThat(result.getLatestRunSummary().getRunId()).isEqualTo(701L);
        assertThat(result.getLatestRunSummary().getTotalTokens()).isEqualTo(5L);
        assertThat(result.getStageSummaries()).extracting("bucketKey").containsExactly("TECH_DESIGN", "IMPLEMENTATION");
        assertThat(result.getAgentSummaries()).extracting("bucketKey").containsExactly("codex");
        verify(permissionService).assertProjectMember(1L, 10L);
    }

    @Test
    void appendRejectsNegativeTokenValues() {
        stubAuthorizedRun();
        RunTokenUsageCreateRequest request = request();
        request.getUsage().setOutputTokens(-1L);

        assertThatThrownBy(() -> runTokenUsageService.append(1L, request))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.VALIDATION_FAILED);

        verify(runTokenUsageRepository, never()).findByRunIdAndFingerprint(any(), anyString());
        verify(runTokenUsageRepository, never()).append(any(RunTokenUsageEntity.class));
    }

    private void stubAuthorizedRun() {
        stubRunAndRequirement();
    }

    private void stubRunAndRequirement() {
        when(runMapper.selectById(700L)).thenReturn(run());
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
    }

    private RunTokenUsageCreateRequest request() {
        RunTokenUsageCreateRequest request = new RunTokenUsageCreateRequest();
        request.setRunId(700L);
        request.setSeq(12L);
        request.setStage("TECH_DESIGN");
        request.setAgentId("codex");
        request.setModel("gpt-5");
        request.setSourceEventType("turn.completed");
        request.setUsageFingerprint(FINGERPRINT);
        request.setUsage(usage(60835L, 32512L, 294L, 171L));
        request.setRawUsageJson("{\"input_tokens\":60835}");
        request.setOccurredAt(LocalDateTime.of(2026, 6, 22, 10, 20));
        return request;
    }

    private RunTokenUsageValueRequest usage(Long input, Long cached, Long output, Long reasoning) {
        RunTokenUsageValueRequest usage = new RunTokenUsageValueRequest();
        usage.setInputTokens(input);
        usage.setCachedInputTokens(cached);
        usage.setOutputTokens(output);
        usage.setReasoningOutputTokens(reasoning);
        return usage;
    }

    private RunEntity run() {
        RunEntity run = new RunEntity();
        run.setId(700L);
        run.setRequirementPk(100L);
        run.setJobId(500L);
        run.setClientSessionId(900L);
        run.setAgentId("codex");
        run.setStatus("RUNNING");
        return run;
    }

    private RequirementEntity requirement() {
        RequirementEntity requirement = new RequirementEntity();
        requirement.setId(100L);
        requirement.setProjectId(10L);
        requirement.setRequirementId("172014");
        return requirement;
    }

    private RunTokenUsageEntity usageEntity(
        Long id,
        Long runId,
        Long requirementPk,
        Long totalTokens,
        String stage,
        String agentId,
        LocalDateTime occurredAt
    ) {
        RunTokenUsageEntity entity = new RunTokenUsageEntity();
        entity.setId(id);
        entity.setRunId(runId);
        entity.setRequirementPk(requirementPk);
        entity.setClientSessionId(900L);
        entity.setAgentId(agentId);
        entity.setStage(stage);
        entity.setSourceEventType("turn.completed");
        entity.setUsageFingerprint(FINGERPRINT);
        entity.setInputTokens(totalTokens);
        entity.setCachedInputTokens(0L);
        entity.setOutputTokens(0L);
        entity.setReasoningOutputTokens(0L);
        entity.setTotalTokens(totalTokens);
        entity.setOccurredAt(occurredAt);
        return entity;
    }
}
