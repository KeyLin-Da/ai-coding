package com.opp.aidelivery.center.repository;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.mapper.RunEventMapper;
import com.opp.aidelivery.center.model.entity.RunEventEntity;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class RunEventRepository {

    private final RunEventMapper runEventMapper;

    public RunEventEntity append(RunEventEntity event) {
        runEventMapper.insert(event);
        return event;
    }

    public List<RunEventEntity> listAfterSeq(Long runId, long afterSeq) {
        return runEventMapper.selectList(new LambdaQueryWrapper<RunEventEntity>()
            .eq(RunEventEntity::getRunId, runId)
            .gt(RunEventEntity::getSeq, afterSeq)
            .orderByAsc(RunEventEntity::getSeq));
    }

    public long nextSeq(Long runId) {
        RunEventEntity latest = runEventMapper.selectOne(new LambdaQueryWrapper<RunEventEntity>()
            .eq(RunEventEntity::getRunId, runId)
            .orderByDesc(RunEventEntity::getSeq)
            .last("LIMIT 1"));
        return latest == null || latest.getSeq() == null ? 1L : latest.getSeq() + 1L;
    }
}
