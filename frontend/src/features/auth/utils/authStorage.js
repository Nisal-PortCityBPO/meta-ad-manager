const USER_KEY = 'meat_dashboard_user';

export const authStorage = {
  getUser() {
    try {
      const raw = window.sessionStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  setUser(user) {
    window.sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    window.sessionStorage.removeItem(USER_KEY);
  },
};
