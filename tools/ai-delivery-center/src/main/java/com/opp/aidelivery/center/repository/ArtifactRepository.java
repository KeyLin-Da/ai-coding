package com.opp.aidelivery.center.repository;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.mapper.ArtifactMapper;
import com.opp.aidelivery.center.model.entity.ArtifactEntity;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class ArtifactRepository {

    private final ArtifactMapper artifactMapper;

    public ArtifactEntity saveArtifact(ArtifactEntity artifact) {
        if (artifact.getId() == null) {
            artifactMapper.insert(artifact);
        } else {
            artifactMapper.updateById(artifact);
        }
        return artifact;
    }

    public boolean updateCurrentVersion(ArtifactEntity artifact, Long versionId) {
        artifact.setCurrentVersionId(versionId);
        return artifactMapper.updateById(artifact) == 1;
    }

    public Optional<ArtifactEntity> findByRequirementAndPath(Long requirementPk, String logicalPath) {
        return Optional.ofNullable(artifactMapper.selectOne(new LambdaQueryWrapper<ArtifactEntity>()
            .eq(ArtifactEntity::getRequirementPk, requirementPk)
            .eq(ArtifactEntity::getLogicalPath, logicalPath)
            .last("LIMIT 1")));
    }

}
