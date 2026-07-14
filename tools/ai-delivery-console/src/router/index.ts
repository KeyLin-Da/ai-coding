import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';
import Login from '@/views/Login.vue';
import ProjectList from '@/views/ProjectList.vue';
import RequirementList from '@/views/RequirementList.vue';
import RequirementDetail from '@/views/RequirementDetail.vue';
import Settings from '@/views/Settings.vue';
import ProjectRepositoryRequired from '@/views/ProjectRepositoryRequired.vue';
import ArtifactPreviewPage from '@/views/ArtifactPreviewPage.vue';
import PublicArtifactPreviewPage from '@/views/PublicArtifactPreviewPage.vue';
import ProjectMemory from '@/views/ProjectMemory.vue';
import { useAuthStore } from '@/stores/auth';
import { useProjectStore } from '@/stores/project';

const router = createRouter({
  history: window.location.protocol === 'file:' ? createWebHashHistory() : createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: Login
    },
    {
      path: '/projects',
      name: 'projects',
      component: ProjectList
    },
    {
      path: '/',
      name: 'requirements',
      component: RequirementList
    },
    {
      path: '/requirements/:requirementId',
      name: 'requirement-detail',
      component: RequirementDetail,
      props: true
    },
    {
      path: '/memory',
      name: 'project-memory',
      component: ProjectMemory,
      props: { view: 'cards' }
    },
    {
      path: '/memory/candidates',
      name: 'project-memory-candidates',
      component: ProjectMemory,
      props: { view: 'candidates' }
    },
    {
      path: '/memory/recalls',
      name: 'project-memory-recalls',
      component: ProjectMemory,
      props: { view: 'recalls' }
    },
    {
      path: '/memory/archived',
      name: 'project-memory-archived',
      component: ProjectMemory,
      props: { view: 'archived' }
    },
    {
      path: '/artifacts/preview',
      name: 'artifact-preview',
      component: ArtifactPreviewPage,
      meta: { allowProjectless: true }
    },
    {
      path: '/share/artifacts/:token',
      name: 'public-artifact-preview',
      component: PublicArtifactPreviewPage,
      meta: { public: true }
    },
    {
      path: '/settings',
      name: 'settings',
      component: Settings
    },
    {
      path: '/projects/repository-required',
      name: 'project-repository-required',
      component: ProjectRepositoryRequired
    }
  ]
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  const project = useProjectStore();
  if (to.meta.public) {
    return true;
  }
  if (!auth.isAuthenticated && to.name !== 'login') {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (auth.isAuthenticated && to.name === 'login') {
    return project.current ? { name: 'requirements' } : { name: 'projects' };
  }
  if (auth.isAuthenticated && !project.current && !to.meta.allowProjectless && !['projects', 'settings'].includes(String(to.name))) {
    return { name: 'projects' };
  }
  if (
    auth.isAuthenticated &&
    project.current &&
    !project.current.repository?.repoUrl &&
    !to.meta.allowProjectless &&
    !['projects', 'settings', 'project-repository-required'].includes(String(to.name))
  ) {
    return { name: 'project-repository-required' };
  }
  return true;
});

export default router;
