import { createRouter, createWebHistory } from 'vue-router';
import RequirementList from '@/views/RequirementList.vue';
import RequirementDetail from '@/views/RequirementDetail.vue';
import Settings from '@/views/Settings.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
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
    }
  ]
});

export default router;
