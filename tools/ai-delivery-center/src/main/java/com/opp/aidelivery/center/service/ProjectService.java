package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.ProjectMapper;
import com.opp.aidelivery.center.mapper.ProjectRepositoryMapper;
import com.opp.aidelivery.center.mapper.TeamMapper;
import com.opp.aidelivery.center.mapper.TeamMemberMapper;
import com.opp.aidelivery.center.model.AiDeliveryConstants;
import com.opp.aidelivery.center.model.dto.ProjectCreateRequest;
import com.opp.aidelivery.center.model.dto.ProjectJoinRequest;
import com.opp.aidelivery.center.model.dto.ProjectRepositoryRequest;
import com.opp.aidelivery.center.model.entity.ProjectEntity;
import com.opp.aidelivery.center.model.entity.ProjectRepositoryEntity;
import com.opp.aidelivery.center.model.entity.TeamEntity;
import com.opp.aidelivery.center.model.entity.TeamMemberEntity;
import com.opp.aidelivery.center.model.vo.ProjectVO;
import com.opp.aidelivery.center.model.vo.ProjectRepositoryVO;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ProjectService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final ProjectMapper projectMapper;
    private final ProjectRepositoryMapper projectRepositoryMapper;
    private final TeamMapper teamMapper;
    private final TeamMemberMapper teamMemberMapper;
    private final PermissionService permissionService;

    public List<ProjectVO> listMyProjects(Long userId) {
        List<TeamMemberEntity> members = teamMemberMapper.selectList(new LambdaQueryWrapper<TeamMemberEntity>()
            .eq(TeamMemberEntity::getUserId, userId));
        if (members.isEmpty()) {
            return Collections.emptyList();
        }
        Set<Long> teamIds = members.stream().map(TeamMemberEntity::getTeamId).collect(Collectors.toSet());
        Map<Long, String> roleByTeamId = members.stream()
            .collect(Collectors.toMap(TeamMemberEntity::getTeamId, TeamMemberEntity::getRole, (left, right) -> left));
        return projectMapper.selectList(new LambdaQueryWrapper<ProjectEntity>()
                .in(ProjectEntity::getTeamId, teamIds)
                .eq(ProjectEntity::getStatus, AiDeliveryConstants.STATUS_ACTIVE)
                .orderByDesc(ProjectEntity::getUpdatedAt))
            .stream()
            .map(project -> toVO(project, roleByTeamId.get(project.getTeamId()), false))
            .collect(Collectors.toList());
    }

    @Transactional(rollbackFor = Exception.class)
    public ProjectVO create(Long userId, ProjectCreateRequest request) {
        String name = normalizeName(request.getName());
        TeamEntity team = new TeamEntity();
        team.setName(name);
        team.setStatus(AiDeliveryConstants.STATUS_ACTIVE);
        teamMapper.insert(team);

        TeamMemberEntity owner = new TeamMemberEntity();
        owner.setTeamId(team.getId());
        owner.setUserId(userId);
        owner.setRole(AiDeliveryConstants.ROLE_OWNER);
        teamMemberMapper.insert(owner);

        ProjectEntity project = new ProjectEntity();
        project.setTeamId(team.getId());
        project.setName(name);
        project.setCode(generateUniqueProjectCode(name));
        project.setStatus(AiDeliveryConstants.STATUS_ACTIVE);
        projectMapper.insert(project);
        saveRepository(project, request.getRepository());
        return toVO(project, AiDeliveryConstants.ROLE_OWNER, true);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProjectVO join(Long userId, ProjectJoinRequest request) {
        String code = normalizeCode(request.getCode());
        ProjectEntity project = projectMapper.selectOne(new LambdaQueryWrapper<ProjectEntity>()
            .eq(ProjectEntity::getCode, code)
            .eq(ProjectEntity::getStatus, AiDeliveryConstants.STATUS_ACTIVE)
            .last("LIMIT 1"));
        if (project == null) {
            throw new BusinessException(AiDeliveryErrorCode.PROJECT_JOIN_DENIED, "项目不存在或加入码不可用");
        }
        TeamMemberEntity member = teamMemberMapper.selectOne(new LambdaQueryWrapper<TeamMemberEntity>()
            .eq(TeamMemberEntity::getTeamId, project.getTeamId())
            .eq(TeamMemberEntity::getUserId, userId)
            .last("LIMIT 1"));
        if (member == null) {
            member = new TeamMemberEntity();
            member.setTeamId(project.getTeamId());
            member.setUserId(userId);
            member.setRole(AiDeliveryConstants.ROLE_MEMBER);
            teamMemberMapper.insert(member);
        }
        return toVO(project, member.getRole(), true);
    }

    public ProjectVO select(Long userId, Long projectId) {
        ProjectEntity project = permissionService.assertProjectMember(userId, projectId);
        TeamMemberEntity member = teamMemberMapper.selectOne(new LambdaQueryWrapper<TeamMemberEntity>()
            .eq(TeamMemberEntity::getTeamId, project.getTeamId())
            .eq(TeamMemberEntity::getUserId, userId)
            .last("LIMIT 1"));
        return toVO(project, member == null ? AiDeliveryConstants.ROLE_MEMBER : member.getRole(), true);
    }

    @Transactional(rollbackFor = Exception.class)
    public ProjectVO bootstrapRepository(Long userId, Long projectId, ProjectRepositoryRequest request) {
        ProjectEntity project = permissionService.assertProjectMember(userId, projectId);
        TeamMemberEntity member = teamMemberMapper.selectOne(new LambdaQueryWrapper<TeamMemberEntity>()
            .eq(TeamMemberEntity::getTeamId, project.getTeamId())
            .eq(TeamMemberEntity::getUserId, userId)
            .last("LIMIT 1"));
        if (member == null || !AiDeliveryConstants.ROLE_OWNER.equals(member.getRole())) {
            throw new BusinessException(AiDeliveryErrorCode.ACCESS_DENIED, "只有项目Owner可以补齐产物Git仓");
        }
        saveRepository(project, request);
        return toVO(project, member.getRole(), true);
    }

    private String normalizeName(String name) {
        String value = name == null ? "" : name.trim();
        if (value.isEmpty()) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "项目名不能为空");
        }
        return value;
    }

    private String normalizeCode(String code) {
        String value = code == null ? "" : code.trim().toLowerCase(Locale.ROOT);
        if (value.isEmpty()) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "项目码不能为空");
        }
        return value;
    }

    private void saveRepository(ProjectEntity project, ProjectRepositoryRequest request) {
        if (request == null) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "项目必须配置AI产物Git仓");
        }
        String repoUrl = normalizeRepoUrl(request.getRepoUrl());
        ProjectRepositoryEntity existing = projectRepositoryMapper.selectOne(new LambdaQueryWrapper<ProjectRepositoryEntity>()
            .eq(ProjectRepositoryEntity::getProjectId, project.getId())
            .last("LIMIT 1"));
        if (existing != null) {
            throw new BusinessException(AiDeliveryErrorCode.PROJECT_REPOSITORY_IMMUTABLE);
        }
        ProjectRepositoryEntity repository = new ProjectRepositoryEntity();
        repository.setProjectId(project.getId());
        repository.setProvider(normalizeProvider(request.getProvider()));
        repository.setRepoUrl(repoUrl);
        repository.setDefaultBranch(normalizeDefaultBranch(request.getDefaultBranch()));
        repository.setRepoCode(project.getCode());
        repository.setStatus(AiDeliveryConstants.STATUS_ACTIVE);
        projectRepositoryMapper.insert(repository);
    }

    private String normalizeRepoUrl(String repoUrl) {
        String value = repoUrl == null ? "" : repoUrl.trim();
        if (value.isEmpty()) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "项目Git仓地址不能为空");
        }
        return value;
    }

    private String normalizeProvider(String provider) {
        String value = provider == null ? "" : provider.trim().toUpperCase(Locale.ROOT);
        return value.isEmpty() ? "PROJECT_GIT" : value;
    }

    private String normalizeDefaultBranch(String defaultBranch) {
        String value = defaultBranch == null ? "" : defaultBranch.trim();
        return value.isEmpty() ? "master" : value;
    }

    private String generateUniqueProjectCode(String name) {
        for (int i = 0; i < 5; i++) {
            String code = generateProjectCode(name);
            ProjectEntity existing = projectMapper.selectOne(new LambdaQueryWrapper<ProjectEntity>()
                .eq(ProjectEntity::getCode, code)
                .last("LIMIT 1"));
            if (existing == null) {
                return code;
            }
        }
        throw new BusinessException(AiDeliveryErrorCode.PROJECT_CODE_CONFLICT, "项目码冲突，请重试");
    }

    private String generateProjectCode(String name) {
        String slug = name.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        if (slug.isEmpty()) {
            slug = "project";
        }
        return slug + "-" + Integer.toHexString(RANDOM.nextInt(0x1000000));
    }

    private ProjectVO toVO(ProjectEntity project, String role, boolean selected) {
        ProjectVO vo = new ProjectVO();
        vo.setId(project.getId());
        vo.setName(project.getName());
        vo.setCode(project.getCode());
        vo.setStatus(project.getStatus());
        vo.setRole(role);
        vo.setSelected(selected);
        vo.setRepository(loadRepository(project.getId()));
        return vo;
    }

    private ProjectRepositoryVO loadRepository(Long projectId) {
        ProjectRepositoryEntity entity = projectRepositoryMapper.selectOne(new LambdaQueryWrapper<ProjectRepositoryEntity>()
            .eq(ProjectRepositoryEntity::getProjectId, projectId)
            .eq(ProjectRepositoryEntity::getStatus, AiDeliveryConstants.STATUS_ACTIVE)
            .last("LIMIT 1"));
        if (entity == null) {
            return null;
        }
        ProjectRepositoryVO vo = new ProjectRepositoryVO();
        vo.setId(entity.getId());
        vo.setProjectId(entity.getProjectId());
        vo.setProvider(entity.getProvider());
        vo.setRepoUrl(entity.getRepoUrl());
        vo.setDefaultBranch(entity.getDefaultBranch());
        vo.setRepoCode(entity.getRepoCode());
        vo.setStatus(entity.getStatus());
        return vo;
    }
}
