// "Recent plans" list in localStorage so returning users can reopen a plan without the link.
export interface RecentPlan {
  token: string;
  role: 'edit' | 'view';
  name: string;
  backend: 'cloud' | 'local';
  openedAt: number;
  guests?: number;
}

const KEY = 'ws.recentPlans.v1';

export function getRecent(): RecentPlan[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function rememberPlan(p: Omit<RecentPlan, 'openedAt'>) {
  try {
    const list = getRecent().filter((r) => r.token !== p.token);
    list.unshift({ ...p, openedAt: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 12)));
  } catch {
    /* storage unavailable — non-essential */
  }
}

export function forgetPlan(token: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(getRecent().filter((r) => r.token !== token)));
  } catch {
    /* ignore */
  }
}
