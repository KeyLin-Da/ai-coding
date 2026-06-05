package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import com.opp.aidelivery.center.mapper.JobMapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.mapper.RunMapper;
import com.opp.aidelivery.center.model.dto.JobClaimRequest;
import com.opp.aidelivery.center.model.dto.JobCreateRequest;
import com.opp.aidelivery.center.model.dto.JobFailureRequest;
import com.opp.aidelivery.center.model.dto.JobLeaseRequest;
import com.opp.aidelivery.center.model.entity.ClientSessionEntity;
import com.opp.aidelivery.center.model.entity.JobEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.entity.RunEntity;
import com.opp.aidelivery.center.model.vo.JobVO;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class JobService {

    private final AiDeliveryCenterProperties properties;
    private final PermissionService permissionService;
    private final ClientSessionService clientSessionService;
    private final JobLeaseService jobLeaseService;
    private final DomainEventService domainEventService;
    private final RequirementMapper requirementMapper;
    private final JobMapper jobMapper;
    private final RunMapper runMapper;

    @Transactional(rollbackFor = Exception.class)
    public JobVO create(Long userId, JobCreateRequest request) {
        RequirementEntity requirement = loadRequirementAndCheckPermission(userId, request.getRequirementPk());
        JobEntity job = new JobEntity();
        job.setRequirementPk(requirement.getId());
        job.setActionType(request.getActionType());
        job.setParamsJson(request.getParamsJson());
        job.setStatus("QUEUED");
        job.setRetryTimes(0);
        job.setCreatedBy(userId);
        jobMapper.insert(job);
        publishJobEvent(requirement, job, null, "job.created");
        return toVO(job, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public JobVO claim(Long userId, JobClaimRequest request) {
        ClientSessionEntity session = clientSessionService.loadOwnedSession(userId, request.getClientSessionId());
        List<String> requestedCapabilities = request.getCapabilities();
        Set<String> capabilities = normalizeCapabilities(
            requestedCapabilities == null || requestedCapabilities.isEmpty() ? parseCapabilities(session.getCapabilities()) : requestedCapabilities
        );
        List<JobEntity> queuedJobs = jobMapper.selectList(new LambdaQueryWrapper<JobEntity>()
            .eq(JobEntity::getStatus, "QUEUED")
            .orderByAsc(JobEntity::getId));
        boolean blockedByLease = false;
        for (JobEntity job : queuedJobs) {
            RequirementEntity requirement = requirementMapper.selectById(job.getRequirementPk());
            if (requirement == null || !canAccess(userId, requirement) || !matchesCapabilities(job.getActionType(), capabilities)) {
                continue;
            }
            if (!jobLeaseService.claim(job.getId(), session.getId())) {
                blockedByLease = true;
                continue;
            }
            RunEntity run = createRun(job, session);
            job.setStatus("CLAIMED");
            job.setClaimedBy(session.getId());
            job.setLeaseExpireAt(LocalDateTime.now().plus(properties.getJob().getLeaseTtl()));
            jobMapper.updateById(job);
            publishJobEvent(requirement, job, run, "job.claimed");
            return toVO(job, run.getId());
        }
        if (blockedByLease) {
            throw new BusinessException(AiDeliveryErrorCode.JOB_ALREADY_CLAIMED);
        }
        return null;
    }

    @Transactional(rollbackFor = Exception.class)
    public JobVO renew(Long userId, Long jobId, JobLeaseRequest request) {
        JobEntity job = loadJob(jobId);
        ClientSessionEntity session = clientSessionService.loadOwnedSession(userId, request.getClientSessionId());
        assertJobHolder(job, session);
        if (!jobLeaseService.renew(job.getId(), session.getId())) {
            throw new BusinessException(AiDeliveryErrorCode.JOB_LEASE_EXPIRED);
        }
        job.setLeaseExpireAt(LocalDateTime.now().plus(properties.getJob().getLeaseTtl()));
        jobMapper.updateById(job);
        return toVO(job, latestRunId(job.getId(), session.getId()));
    }

    @Transactional(rollbackFor = Exception.class)
    public JobVO complete(Long userId, Long jobId, JobLeaseRequest request) {
        return finish(userId, jobId, request.getClientSessionId(), "SUCCEEDED", null);
    }

    @Transactional(rollbackFor = Exception.class)
    public JobVO fail(Long userId, Long jobId, JobFailureRequest request) {
        return finish(userId, jobId, request.getClientSessionId(), "FAILED", request.getErrorMessage());
    }

    @Transactional(rollbackFor = Exception.class)
    public JobVO cancel(Long userId, Long jobId) {
        JobEntity job = loadJob(jobId);
        RequirementEntity requirement = loadRequirementAndCheckPermission(userId, job.getRequirementPk());
        if ("CANCELLED".equals(job.getStatus())) {
            return toVO(job, latestRunId(job.getId(), job.getClaimedBy()));
        }
        job.setStatus("CANCELLED");
        jobMapper.updateById(job);
        updateLatestRun(job, "CANCELLED", "用户取消运行");
        if (job.getClaimedBy() != null) {
            jobLeaseService.release(job.getId(), job.getClaimedBy());
        }
        publishJobEvent(requirement, job, null, "job.cancelled");
        return toVO(job, latestRunId(job.getId(), job.getClaimedBy()));
    }

    @Transactional(rollbackFor = Exception.class)
    public int requeueExpiredLeases() {
        LocalDateTime now = LocalDateTime.now();
        List<JobEntity> expiredJobs = jobMapper.selectList(new LambdaQueryWrapper<JobEntity>()
            .eq(JobEntity::getStatus, "CLAIMED")
            .lt(JobEntity::getLeaseExpireAt, now));
        int count = 0;
        for (JobEntity job : expiredJobs) {
            RequirementEntity requirement = requirementMapper.selectById(job.getRequirementPk());
            job.setStatus("QUEUED");
            job.setClaimedBy(null);
            job.setLeaseExpireAt(null);
            job.setRetryTimes(job.getRetryTimes() == null ? 1 : job.getRetryTimes() + 1);
            jobMapper.updateById(job);
            if (requirement != null) {
                publishJobEvent(requirement, job, null, "job.lease.expired");
            }
            count++;
        }
        return count;
    }

    private JobVO finish(Long userId, Long jobId, Long clientSessionId, String status, String errorMessage) {
        JobEntity job = loadJob(jobId);
        ClientSessionEntity session = clientSessionService.loadOwnedSession(userId, clientSessionId);
        RequirementEntity requirement = loadRequirementAndCheckPermission(userId, job.getRequirementPk());
        if (status.equals(job.getStatus()) && session.getId().equals(job.getClaimedBy())) {
            return toVO(job, latestRunId(job.getId(), session.getId()));
        }
        assertJobHolder(job, session);
        if (!jobLeaseService.isHolder(job.getId(), session.getId())) {
            throw new BusinessException(AiDeliveryErrorCode.JOB_LEASE_EXPIRED);
        }
        job.setStatus(status);
        jobMapper.updateById(job);
        updateLatestRun(job, status, errorMessage);
        jobLeaseService.release(job.getId(), session.getId());
        publishJobEvent(requirement, job, null, "SUCCEEDED".equals(status) ? "job.completed" : "job.failed");
        return toVO(job, latestRunId(job.getId(), session.getId()));
    }

    private RunEntity createRun(JobEntity job, ClientSessionEntity session) {
        RunEntity run = new RunEntity();
        run.setJobId(job.getId());
        run.setRequirementPk(job.getRequirementPk());
        run.setStatus("RUNNING");
        run.setClientSessionId(session.getId());
        run.setStartedAt(LocalDateTime.now());
        runMapper.insert(run);
        return run;
    }

    private void updateLatestRun(JobEntity job, String status, String errorMessage) {
        RunEntity run = latestRun(job.getId(), job.getClaimedBy());
        if (run == null) {
            return;
        }
        run.setStatus(status);
        run.setFinishedAt(LocalDateTime.now());
        run.setErrorMessage(errorMessage);
        runMapper.updateById(run);
    }

    private Long latestRunId(Long jobId, Long clientSessionId) {
        RunEntity run = latestRun(jobId, clientSessionId);
        return run == null ? null : run.getId();
    }

    private RunEntity latestRun(Long jobId, Long clientSessionId) {
        if (clientSessionId == null) {
            return null;
        }
        return runMapper.selectOne(new LambdaQueryWrapper<RunEntity>()
            .eq(RunEntity::getJobId, jobId)
            .eq(RunEntity::getClientSessionId, clientSessionId)
            .orderByDesc(RunEntity::getId)
            .last("LIMIT 1"));
    }

    private JobEntity loadJob(Long jobId) {
        JobEntity job = jobMapper.selectById(jobId);
        if (job == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "Job 不存在");
        }
        return job;
    }

    private RequirementEntity loadRequirementAndCheckPermission(Long userId, Long requirementPk) {
        RequirementEntity requirement = requirementMapper.selectById(requirementPk);
        if (requirement == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "需求不存在");
        }
        permissionService.assertProjectMember(userId, requirement.getProjectId());
        return requirement;
    }

    private boolean canAccess(Long userId, RequirementEntity requirement) {
        try {
            permissionService.assertProjectMember(userId, requirement.getProjectId());
            return true;
        } catch (BusinessException exception) {
            return false;
        }
    }

    private void assertJobHolder(JobEntity job, ClientSessionEntity session) {
        if (!session.getId().equals(job.getClaimedBy()) || !"CLAIMED".equals(job.getStatus())) {
            throw new BusinessException(AiDeliveryErrorCode.JOB_LEASE_EXPIRED);
        }
    }

    private boolean matchesCapabilities(String actionType, Set<String> capabilities) {
        String capability = capabilityForAction(actionType);
        return capabilities.contains(capability) || capabilities.contains(actionType) || capabilities.contains("ALL");
    }

    private String capabilityForAction(String actionType) {
        if (actionType != null && actionType.startsWith("OPENSPEC_")) {
            return "OPENSPEC";
        }
        if ("CODE_REVIEW".equals(actionType) || "JUNIT_GENERATE".equals(actionType)
            || "PRD_ANALYZE".equals(actionType) || "DESIGN_GENERATE".equals(actionType)
            || "DESIGN_QUESTION".equals(actionType)) {
            return "CODEX";
        }
        if ("RETURN_TO_IMPLEMENTATION".equals(actionType) || "REFRESH_ARTIFACTS".equals(actionType)) {
            return "LOCAL";
        }
        return actionType == null ? "UNKNOWN" : actionType;
    }

    private Set<String> normalizeCapabilities(List<String> capabilities) {
        return capabilities.stream()
            .filter(item -> item != null && !item.trim().isEmpty())
            .map(item -> item.trim().toUpperCase(Locale.ROOT))
            .collect(Collectors.toCollection(HashSet::new));
    }

    private List<String> parseCapabilities(String capabilitiesJson) {
        if (capabilitiesJson == null || capabilitiesJson.trim().length() < 2) {
            return java.util.Collections.emptyList();
        }
        return java.util.Arrays.stream(capabilitiesJson.replace("[", "").replace("]", "").replace("\"", "").split(","))
            .map(String::trim)
            .filter(item -> !item.isEmpty())
            .collect(Collectors.toList());
    }

    private void publishJobEvent(RequirementEntity requirement, JobEntity job, RunEntity run, String eventType) {
        domainEventService.publishAfterCommit(
            requirement.getProjectId(),
            eventType,
            "JOB",
            job.getId(),
            "{\"requirementPk\":" + requirement.getId()
                + ",\"jobId\":" + job.getId()
                + (run == null ? "" : ",\"runId\":" + run.getId())
                + ",\"status\":\"" + job.getStatus() + "\"}"
        );
    }

    private JobVO toVO(JobEntity job, Long runId) {
        JobVO vo = new JobVO();
        vo.setId(job.getId());
        vo.setRequirementPk(job.getRequirementPk());
        vo.setActionType(job.getActionType());
        vo.setParamsJson(job.getParamsJson());
        vo.setStatus(job.getStatus());
        vo.setClaimedBy(job.getClaimedBy());
        vo.setRunId(runId);
        vo.setLeaseExpireAt(job.getLeaseExpireAt());
        vo.setRetryTimes(job.getRetryTimes());
        vo.setCreatedBy(job.getCreatedBy());
        return vo;
    }
}
