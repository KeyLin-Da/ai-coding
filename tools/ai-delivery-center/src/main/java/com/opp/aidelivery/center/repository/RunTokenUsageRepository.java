package com.opp.aidelivery.center.repository;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.mapper.RunTokenUsageMapper;
import com.opp.aidelivery.center.model.entity.RunTokenUsageEntity;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class RunTokenUsageRepository {

    private final RunTokenUsageMapper runTokenUsageMapper;

    public RunTokenUsageEntity append(RunTokenUsageEntity entity) {
        runTokenUsageMapper.insert(entity);
        return entity;
    }

    public RunTokenUsageEntity findByRunIdAndFingerprint(Long runId, String fingerprint) {
        return runTokenUsageMapper.selectOne(new LambdaQueryWrapper<RunTokenUsageEntity>()
            .eq(RunTokenUsageEntity::getRunId, runId)
            .eq(RunTokenUsageEntity::getUsageFingerprint, fingerprint)
            .last("LIMIT 1"));
    }

    public List<RunTokenUsageEntity> listByRunId(Long runId) {
        return runTokenUsageMapper.selectList(new LambdaQueryWrapper<RunTokenUsageEntity>()
            .eq(RunTokenUsageEntity::getRunId, runId)
            .orderByAsc(RunTokenUsageEntity::getOccurredAt)
            .orderByAsc(RunTokenUsageEntity::getId));
    }

    public List<RunTokenUsageEntity> listByRequirementPk(
        Long requirementPk,
        String stage,
        String agentId,
        LocalDateTime from,
        LocalDateTime to
    ) {
        LambdaQueryWrapper<RunTokenUsageEntity> wrapper = new LambdaQueryWrapper<RunTokenUsageEntity>()
            .eq(RunTokenUsageEntity::getRequirementPk, requirementPk);
        applyOptionalFilters(wrapper, stage, agentId, from, to);
        return runTokenUsageMapper.selectList(wrapper
            .orderByAsc(RunTokenUsageEntity::getOccurredAt)
            .orderByAsc(RunTokenUsageEntity::getId));
    }

    public List<RunTokenUsageEntity> listByRequirementPks(List<Long> requirementPks) {
        if (requirementPks == null || requirementPks.isEmpty()) {
            return Collections.emptyList();
        }
        return runTokenUsageMapper.selectList(new LambdaQueryWrapper<RunTokenUsageEntity>()
            .in(RunTokenUsageEntity::getRequirementPk, requirementPks)
            .orderByAsc(RunTokenUsageEntity::getOccurredAt)
            .orderByAsc(RunTokenUsageEntity::getId));
    }

    private void applyOptionalFilters(
        LambdaQueryWrapper<RunTokenUsageEntity> wrapper,
        String stage,
        String agentId,
        LocalDateTime from,
        LocalDateTime to
    ) {
        if (stage != null && !stage.trim().isEmpty()) {
            wrapper.eq(RunTokenUsageEntity::getStage, stage.trim());
        }
        if (agentId != null && !agentId.trim().isEmpty()) {
            wrapper.eq(RunTokenUsageEntity::getAgentId, agentId.trim());
        }
        if (from != null) {
            wrapper.ge(RunTokenUsageEntity::getOccurredAt, from);
        }
        if (to != null) {
            wrapper.le(RunTokenUsageEntity::getOccurredAt, to);
        }
    }
}
