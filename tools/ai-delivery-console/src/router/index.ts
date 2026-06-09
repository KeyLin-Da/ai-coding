import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router';
import Login from '@/views/Login.vue';
import ProjectList from '@/views/ProjectList.vue';
import RequirementList from '@/views/RequirementList.vue';
import RequirementDetail from '@/views/RequirementDetail.vue';
import Settings from '@/views/Settings.vue';
import ProjectRepositoryRequired from '@/views/ProjectRepositoryRequired.vue';
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
  if (!auth.isAuthenticated && to.name !== 'login') {
    return { name: 'login' };
  }
  if (auth.isAuthenticated && to.name === 'login') {
    return project.current ? { name: 'requirements' } : { name: 'projects' };
  }
  if (auth.isAuthenticated && !project.current && !['projects', 'settings'].includes(String(to.name))) {
    return { name: 'projects' };
  }
  if (
    auth.isAuthenticated &&
    project.current &&
    !project.current.repository?.repoUrl &&
    !['projects', 'settings', 'project-repository-required'].includes(String(to.name))
  ) {
    return { name: 'project-repository-required' };
  }
  return true;
});

export default router;
