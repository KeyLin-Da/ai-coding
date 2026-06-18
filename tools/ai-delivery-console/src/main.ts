import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import './styles/main.css';
import App from './App.vue';
import router from './router';
import { useAuthStore } from '@/stores/auth';
import { useProjectStore } from '@/stores/project';
import { useSettingsStore } from '@/stores/settings';

const pinia = createPinia();
const app = createApp(App);

app.use(pinia).use(ElementPlus);

async function bootstrap() {
  try {
    await useSettingsStore(pinia).load();
    const auth = useAuthStore(pinia);
    await auth.restore();
    if (auth.isAuthenticated) {
      await useSettingsStore(pinia).ensureClientSessionId();
      await useProjectStore(pinia).loadProjects();
    }
  } finally {
    app.use(router);
    await router.isReady();
    app.mount('#app');
  }
}

void bootstrap();
