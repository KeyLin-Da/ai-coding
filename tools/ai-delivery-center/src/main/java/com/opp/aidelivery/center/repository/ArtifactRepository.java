package com.opp.aidelivery.center.repository;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.mapper.ArtifactMapper;
import com.opp.aidelivery.center.mapper.ArtifactVersionMapper;
import com.opp.aidelivery.center.mapper.FileObjectMapper;
import com.opp.aidelivery.center.model.entity.ArtifactEntity;
import com.opp.aidelivery.center.model.entity.ArtifactVersionEntity;
import com.opp.aidelivery.center.model.entity.FileObjectEntity;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class ArtifactRepository {

    private final ArtifactMapper artifactMapper;
    private final ArtifactVersionMapper artifactVersionMapper;
    private final FileObjectMapper fileObjectMapper;

    public ArtifactEntity saveArtifact(ArtifactEntity artifact) {
        if (artifact.getId() == null) {
            artifactMapper.insert(artifact);
        } else {
            artifactMapper.updateById(artifact);
        }
        return artifact;
    }

    public FileObjectEntity saveFileObject(FileObjectEntity fileObject) {
        fileObjectMapper.insert(fileObject);
        return fileObject;
    }

    public ArtifactVersionEntity saveVersion(ArtifactVersionEntity version) {
        artifactVersionMapper.insert(version);
        return version;
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

    public List<ArtifactVersionEntity> listVersions(Long artifactId) {
        return artifactVersionMapper.selectList(new LambdaQueryWrapper<ArtifactVersionEntity>()
            .eq(ArtifactVersionEntity::getArtifactId, artifactId)
            .orderByDesc(ArtifactVersionEntity::getVersionNo));
    }
}
