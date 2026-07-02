import { defineStore } from 'pinia';
import { apiClient, type AuthSessionVO, type UserProfileVO } from '@/api/client';
import { setApiRuntimeConfig } from '@/api/runtime';

const AUTH_STORAGE_KEY = 'ai-delivery.auth-session';

interface StoredAuthSession {
  token: string;
  expireAt: string;
  user: UserProfileVO;
}

interface AuthState {
  token: string;
  expireAt: string;
  user?: UserProfileVO;
  loading: boolean;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: '',
    expireAt: '',
    user: undefined,
    loading: false
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token && state.user && new Date(state.expireAt).getTime() > Date.now())
  },
  actions: {
    async restore() {
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) {
        this.applyRuntime();
        return;
      }
      const stored = JSON.parse(raw) as StoredAuthSession;
      if (!stored.token || !stored.expireAt || new Date(stored.expireAt).getTime() <= Date.now()) {
        this.clear();
        return;
      }
      this.token = stored.token;
      this.expireAt = stored.expireAt;
      this.user = stored.user;
      this.applyRuntime();
      try {
        this.user = await apiClient.getCurrentUser();
        this.persist();
      } catch {
        this.clear();
      }
    },
    async login(account: string) {
      this.loading = true;
      try {
        this.applySession(await apiClient.login({ account }));
      } finally {
        this.loading = false;
      }
    },
    async register(account: string, displayName: string) {
      this.loading = true;
      try {
        this.applySession(await apiClient.register({ account, displayName }));
      } finally {
        this.loading = false;
      }
    },
    async updateProfile(displayName: string, avatarUrl?: string) {
      this.user = await apiClient.updateProfile({ displayName, avatarUrl });
      this.persist();
    },
    async logout() {
      try {
        if (this.token) {
          await apiClient.logout();
        }
      } finally {
        this.clear();
      }
    },
    applySession(session: AuthSessionVO) {
      this.token = session.token;
      this.expireAt = session.expireAt;
      this.user = session.user;
      this.applyRuntime();
      this.persist();
    },
    applyRuntime() {
      setApiRuntimeConfig({
        accessToken: this.token,
        userId: this.user?.id ? String(this.user.id) : ''
      });
    },
    persist() {
      if (!this.token || !this.user) {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          token: this.token,
          expireAt: this.expireAt,
          user: this.user
        } satisfies StoredAuthSession)
      );
    },
    clear() {
      this.token = '';
      this.expireAt = '';
      this.user = undefined;
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      this.applyRuntime();
    }
  }
});
