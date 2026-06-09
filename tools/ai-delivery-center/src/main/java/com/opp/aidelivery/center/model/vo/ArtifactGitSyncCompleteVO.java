package com.opp.aidelivery.center.model.vo;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class ArtifactGitSyncCompleteVO {

    private ArtifactSyncVO sync;
    private List<ArtifactGitVersionVO> versions = new ArrayList<>();
}
