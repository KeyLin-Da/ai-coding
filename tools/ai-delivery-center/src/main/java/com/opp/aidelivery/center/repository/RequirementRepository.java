package com.opp.aidelivery.center.repository;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class RequirementRepository {

    private final RequirementMapper requirementMapper;

    public RequirementEntity save(RequirementEntity requirement) {
        if (requirement.getId() == null) {
            requirementMapper.insert(requirement);
        } else {
            requirementMapper.updateById(requirement);
        }
        return requirement;
    }

    public Optional<RequirementEntity> findByProjectAndRequirementId(Long projectId, String requirementId) {
        return Optional.ofNullable(requirementMapper.selectOne(new LambdaQueryWrapper<RequirementEntity>()
            .eq(RequirementEntity::getProjectId, projectId)
            .eq(RequirementEntity::getRequirementId, requirementId)
            .last("LIMIT 1")));
    }

    public List<RequirementEntity> listByProject(Long projectId) {
        return requirementMapper.selectList(new LambdaQueryWrapper<RequirementEntity>()
            .eq(RequirementEntity::getProjectId, projectId)
            .orderByDesc(RequirementEntity::getUpdatedAt));
    }
}
