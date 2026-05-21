import { createRouter, createWebHistory } from 'vue-router';
import RequirementList from '@/views/RequirementList.vue';
import RequirementDetail from '@/views/RequirementDetail.vue';

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
    }
  ]
});

export default router;
