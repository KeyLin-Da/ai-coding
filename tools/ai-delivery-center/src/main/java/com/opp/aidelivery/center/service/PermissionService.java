package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.ProjectMapper;
import com.opp.aidelivery.center.mapper.TeamMemberMapper;
import com.opp.aidelivery.center.model.entity.ProjectEntity;
import com.opp.aidelivery.center.model.entity.TeamMemberEntity;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PermissionService {

    private final ProjectMapper projectMapper;
    private final TeamMemberMapper teamMemberMapper;

    public ProjectEntity assertProjectMember(Long userId, Long projectId) {
        ProjectEntity project = projectMapper.selectById(projectId);
        if (project == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "项目不存在");
        }
        TeamMemberEntity member = teamMemberMapper.selectOne(new LambdaQueryWrapper<TeamMemberEntity>()
            .eq(TeamMemberEntity::getTeamId, project.getTeamId())
            .eq(TeamMemberEntity::getUserId, userId)
            .last("LIMIT 1"));
        if (member == null) {
            throw new BusinessException(AiDeliveryErrorCode.ACCESS_DENIED, "用户不属于项目团队");
        }
        return project;
    }
}
