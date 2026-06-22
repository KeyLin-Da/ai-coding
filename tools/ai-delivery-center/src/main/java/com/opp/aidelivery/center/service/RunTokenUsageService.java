package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
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
import com.opp.aidelivery.center.model.vo.RequirementTokenUsagePageVO;
import com.opp.aidelivery.center.model.vo.RunTokenUsageDetailVO;
import com.opp.aidelivery.center.model.vo.RunTokenUsageRunVO;
import com.opp.aidelivery.center.model.vo.RunTokenUsageSaveVO;
import com.opp.aidelivery.center.model.vo.TokenUsageBucketVO;
import com.opp.aidelivery.center.model.vo.TokenUsageSummaryVO;
import com.opp.aidelivery.center.repository.RunTokenUsageRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class RunTokenUsageService {

    private static final ZoneOffset CENTER_ZONE_OFFSET = ZoneOffset.ofHours(8);

    private final PermissionService permissionService;
    private final RunMapper runMapper;
    private final RequirementMapper requirementMapper;
    private final RunTokenUsageRepository runTokenUsageRepository;

    @Transactional
    public RunTokenUsageSaveVO append(Long userId, RunTokenUsageCreateRequest request) {
        RunContext context = loadRunAndCheckPermission(userId, request.getRunId());
        NormalizedUsage usage = normalizeUsage(request.getUsage());
        String fingerprint = normalizeFingerprint(request, usage);
        RunTokenUsageEntity existing = runTokenUsageRepository.findByRunIdAndFingerprint(context.run.getId(), fingerprint);
        if (existing != null) {
            return saveVO(existing);
        }

        RunTokenUsageEntity entity = new RunTokenUsageEntity();
        entity.setRunId(context.run.getId());
        entity.setRequirementPk(context.requirement.getId());
        entity.setJobId(context.run.getJobId());
        entity.setClientSessionId(context.run.getClientSessionId());
        entity.setAgentId(firstNonBlank(request.getAgentId(), context.run.getAgentId()));
        entity.setStage(trimToNull(request.getStage()));
        entity.setImplementationStep(trimToNull(request.getImplementationStep()));
        entity.setModel(trimToNull(request.getModel()));
        entity.setSourceEventType(trimToNull(request.getSourceEventType()));
        entity.setUsageFingerprint(fingerprint);
        entity.setInputTokens(usage.inputTokens);
        entity.setCachedInputTokens(usage.cachedInputTokens);
        entity.setOutputTokens(usage.outputTokens);
        entity.setReasoningOutputTokens(usage.reasoningOutputTokens);
        entity.setTotalTokens(usage.totalTokens);
        entity.setRawUsageJson(trimToNull(request.getRawUsageJson()));
        entity.setOccurredAt(request.getOccurredAt() == null
            ? LocalDateTime.now(CENTER_ZONE_OFFSET)
            : request.getOccurredAt().withOffsetSameInstant(CENTER_ZONE_OFFSET).toLocalDateTime());

        try {
            runTokenUsageRepository.append(entity);
        } catch (DuplicateKeyException ex) {
            RunTokenUsageEntity duplicate = runTokenUsageRepository.findByRunIdAndFingerprint(context.run.getId(), fingerprint);
            if (duplicate != null) {
                return saveVO(duplicate);
            }
            throw ex;
        }
        return saveVO(entity);
    }

    public RunTokenUsageRunVO listByRun(Long userId, Long runId) {
        loadRunAndCheckPermission(userId, runId);
        List<RunTokenUsageEntity> details = runTokenUsageRepository.listByRunId(runId);
        return runVO(runId, details);
    }

    public RequirementTokenUsageSummaryVO summarizeRequirement(
        Long userId,
        Long requirementPk,
        String stage,
        String agentId,
        LocalDateTime from,
        LocalDateTime to
    ) {
        RequirementEntity requirement = loadRequirementAndCheckPermission(userId, requirementPk);
        List<RunTokenUsageEntity> details = runTokenUsageRepository.listByRequirementPk(
            requirement.getId(), stage, agentId, from, to);
        return requirementSummaryVO(requirement.getId(), details);
    }

    public RequirementTokenUsagePageVO pageRequirementDetails(
        Long userId,
        Long requirementPk,
        Integer page,
        Integer pageSize
    ) {
        RequirementEntity requirement = loadRequirementAndCheckPermission(userId, requirementPk);
        long normalizedPage = page == null ? 1L : Math.max(1L, page.longValue());
        long normalizedPageSize = pageSize == null ? 20L : Math.min(100L, Math.max(1L, pageSize.longValue()));
        IPage<RunTokenUsageEntity> result = runTokenUsageRepository.pageByRequirementPk(
            requirement.getId(), normalizedPage, normalizedPageSize);
        RequirementTokenUsagePageVO vo = new RequirementTokenUsagePageVO();
        vo.setRequirementPk(requirement.getId());
        vo.setPage(result.getCurrent());
        vo.setPageSize(result.getSize());
        vo.setTotal(result.getTotal());
        vo.setItems(result.getRecords().stream().map(this::toDetailVO).collect(Collectors.toList()));
        return vo;
    }

    public List<RequirementTokenUsageSummaryVO> summarizeProject(Long userId, Long projectId) {
        permissionService.assertProjectMember(userId, projectId);
        List<RequirementEntity> requirements = requirementMapper.selectList(new LambdaQueryWrapper<RequirementEntity>()
            .eq(RequirementEntity::getProjectId, projectId));
        List<Long> requirementPks = requirements.stream()
            .map(RequirementEntity::getId)
            .collect(Collectors.toList());
        Map<Long, List<RunTokenUsageEntity>> detailsByRequirement = runTokenUsageRepository
            .listByRequirementPks(requirementPks)
            .stream()
            .collect(Collectors.groupingBy(
                RunTokenUsageEntity::getRequirementPk,
                LinkedHashMap::new,
                Collectors.toList()));

        return requirements.stream()
            .map(requirement -> requirementSummaryVO(
                requirement.getId(),
                detailsByRequirement.getOrDefault(requirement.getId(), new ArrayList<>())))
            .collect(Collectors.toList());
    }

    private RunTokenUsageSaveVO saveVO(RunTokenUsageEntity detail) {
        RunTokenUsageSaveVO vo = new RunTokenUsageSaveVO();
        vo.setDetail(toDetailVO(detail));
        vo.setRunSummary(summarize(runTokenUsageRepository.listByRunId(detail.getRunId())));
        return vo;
    }

    private RunTokenUsageRunVO runVO(Long runId, List<RunTokenUsageEntity> details) {
        RunTokenUsageRunVO vo = new RunTokenUsageRunVO();
        vo.setRunId(runId);
        vo.setSummary(summarize(details));
        vo.setDetails(details.stream().map(this::toDetailVO).collect(Collectors.toList()));
        return vo;
    }

    private RequirementTokenUsageSummaryVO requirementSummaryVO(Long requirementPk, List<RunTokenUsageEntity> details) {
        RequirementTokenUsageSummaryVO vo = new RequirementTokenUsageSummaryVO();
        vo.setRequirementPk(requirementPk);
        vo.setSummary(summarize(details));
        vo.setLatestRunSummary(latestRunSummary(details));
        vo.setStageSummaries(bucketSummaries(details, "stage"));
        vo.setAgentSummaries(bucketSummaries(details, "agent"));
        return vo;
    }

    private TokenUsageSummaryVO latestRunSummary(List<RunTokenUsageEntity> details) {
        RunTokenUsageEntity latest = null;
        for (RunTokenUsageEntity detail : details) {
            if (latest == null || isAfter(detail.getOccurredAt(), latest.getOccurredAt())) {
                latest = detail;
            }
        }
        if (latest == null) {
            return new TokenUsageSummaryVO();
        }
        Long latestRunId = latest.getRunId();
        List<RunTokenUsageEntity> latestRunDetails = details.stream()
            .filter(detail -> latestRunId.equals(detail.getRunId()))
            .collect(Collectors.toList());
        return summarize(latestRunDetails);
    }

    private List<TokenUsageBucketVO> bucketSummaries(List<RunTokenUsageEntity> details, String bucketType) {
        Map<String, List<RunTokenUsageEntity>> grouped = new LinkedHashMap<>();
        for (RunTokenUsageEntity detail : details) {
            String bucketKey = "stage".equals(bucketType)
                ? nullToUnknown(detail.getStage())
                : nullToUnknown(detail.getAgentId());
            grouped.computeIfAbsent(bucketKey, ignored -> new ArrayList<>()).add(detail);
        }
        List<TokenUsageBucketVO> buckets = new ArrayList<>();
        for (Map.Entry<String, List<RunTokenUsageEntity>> entry : grouped.entrySet()) {
            TokenUsageBucketVO bucket = new TokenUsageBucketVO();
            bucket.setBucketType(bucketType);
            bucket.setBucketKey(entry.getKey());
            bucket.setSummary(summarize(entry.getValue()));
            buckets.add(bucket);
        }
        return buckets;
    }

    private TokenUsageSummaryVO summarize(List<RunTokenUsageEntity> details) {
        TokenUsageSummaryVO summary = new TokenUsageSummaryVO();
        Set<Long> runIds = new HashSet<>();
        for (RunTokenUsageEntity detail : details) {
            summary.setTotalTokens(summary.getTotalTokens() + safe(detail.getTotalTokens()));
            summary.setInputTokens(summary.getInputTokens() + safe(detail.getInputTokens()));
            summary.setCachedInputTokens(summary.getCachedInputTokens() + safe(detail.getCachedInputTokens()));
            summary.setOutputTokens(summary.getOutputTokens() + safe(detail.getOutputTokens()));
            summary.setReasoningOutputTokens(summary.getReasoningOutputTokens() + safe(detail.getReasoningOutputTokens()));
            summary.setDetailCount(summary.getDetailCount() + 1L);
            runIds.add(detail.getRunId());
            if (summary.getLatestOccurredAt() == null || isAfter(detail.getOccurredAt(), summary.getLatestOccurredAt())) {
                summary.setLatestOccurredAt(detail.getOccurredAt());
                summary.setRunId(detail.getRunId());
            }
        }
        summary.setRunCount((long) runIds.size());
        return summary;
    }

    private RunTokenUsageDetailVO toDetailVO(RunTokenUsageEntity entity) {
        RunTokenUsageDetailVO vo = new RunTokenUsageDetailVO();
        vo.setId(entity.getId());
        vo.setRunId(entity.getRunId());
        vo.setRequirementPk(entity.getRequirementPk());
        vo.setJobId(entity.getJobId());
        vo.setClientSessionId(entity.getClientSessionId());
        vo.setAgentId(entity.getAgentId());
        vo.setStage(entity.getStage());
        vo.setImplementationStep(entity.getImplementationStep());
        vo.setModel(entity.getModel());
        vo.setSourceEventType(entity.getSourceEventType());
        vo.setUsageFingerprint(entity.getUsageFingerprint());
        vo.setInputTokens(safe(entity.getInputTokens()));
        vo.setCachedInputTokens(safe(entity.getCachedInputTokens()));
        vo.setOutputTokens(safe(entity.getOutputTokens()));
        vo.setReasoningOutputTokens(safe(entity.getReasoningOutputTokens()));
        vo.setTotalTokens(safe(entity.getTotalTokens()));
        vo.setRawUsageJson(entity.getRawUsageJson());
        vo.setOccurredAt(entity.getOccurredAt());
        vo.setCreatedAt(entity.getCreatedAt());
        return vo;
    }

    private RunContext loadRunAndCheckPermission(Long userId, Long runId) {
        RunEntity run = runMapper.selectById(runId);
        if (run == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "运行记录不存在");
        }
        RequirementEntity requirement = loadRequirementAndCheckPermission(userId, run.getRequirementPk());
        return new RunContext(run, requirement);
    }

    private RequirementEntity loadRequirementAndCheckPermission(Long userId, Long requirementPk) {
        RequirementEntity requirement = requirementMapper.selectById(requirementPk);
        if (requirement == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "需求不存在");
        }
        permissionService.assertProjectMember(userId, requirement.getProjectId());
        return requirement;
    }

    private NormalizedUsage normalizeUsage(RunTokenUsageValueRequest usage) {
        long inputTokens = normalizeToken("inputTokens", usage.getInputTokens());
        long cachedInputTokens = normalizeToken("cachedInputTokens", usage.getCachedInputTokens());
        long outputTokens = normalizeToken("outputTokens", usage.getOutputTokens());
        long reasoningOutputTokens = normalizeToken("reasoningOutputTokens", usage.getReasoningOutputTokens());
        return new NormalizedUsage(
            inputTokens,
            cachedInputTokens,
            outputTokens,
            reasoningOutputTokens,
            inputTokens + outputTokens);
    }

    private long normalizeToken(String field, Long value) {
        if (value == null) {
            return 0L;
        }
        if (value < 0L) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, field + " 不能为负数");
        }
        return value;
    }

    private String normalizeFingerprint(RunTokenUsageCreateRequest request, NormalizedUsage usage) {
        String provided = trimToNull(request.getUsageFingerprint());
        if (provided != null && provided.matches("[0-9a-fA-F]{64}")) {
            return provided.toLowerCase();
        }
        String seed = new StringBuilder()
            .append(request.getRunId()).append('|')
            .append(request.getSeq()).append('|')
            .append(trimToNull(request.getSourceEventType())).append('|')
            .append(trimToNull(request.getRawUsageJson())).append('|')
            .append(usage.inputTokens).append('|')
            .append(usage.cachedInputTokens).append('|')
            .append(usage.outputTokens).append('|')
            .append(usage.reasoningOutputTokens).append('|')
            .append(provided)
            .toString();
        return sha256(seed);
    }

    private String sha256(String seed) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(seed.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) {
                builder.append(String.format("%02x", b));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 algorithm unavailable", ex);
        }
    }

    private String firstNonBlank(String first, String second) {
        String value = trimToNull(first);
        return value == null ? trimToNull(second) : value;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String nullToUnknown(String value) {
        String normalized = trimToNull(value);
        return normalized == null ? "UNKNOWN" : normalized;
    }

    private long safe(Long value) {
        return value == null ? 0L : value;
    }

    private boolean isAfter(LocalDateTime left, LocalDateTime right) {
        if (left == null) {
            return false;
        }
        return right == null || left.isAfter(right);
    }

    private static class RunContext {

        private final RunEntity run;
        private final RequirementEntity requirement;

        RunContext(RunEntity run, RequirementEntity requirement) {
            this.run = run;
            this.requirement = requirement;
        }
    }

    private static class NormalizedUsage {

        private final long inputTokens;
        private final long cachedInputTokens;
        private final long outputTokens;
        private final long reasoningOutputTokens;
        private final long totalTokens;

        NormalizedUsage(
            long inputTokens,
            long cachedInputTokens,
            long outputTokens,
            long reasoningOutputTokens,
            long totalTokens
        ) {
            this.inputTokens = inputTokens;
            this.cachedInputTokens = cachedInputTokens;
            this.outputTokens = outputTokens;
            this.reasoningOutputTokens = reasoningOutputTokens;
            this.totalTokens = totalTokens;
        }
    }
}
