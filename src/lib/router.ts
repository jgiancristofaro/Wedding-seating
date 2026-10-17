import { useEffect, useState } from 'react';

export type Route =
  { name: 'home' } | { name: 'plan'; token: string; mode: 'e' | 'v' } | { name: 'notFound' };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  if (!h) return { name: 'home' };
  const m = /^(e|v)\/([A-Za-z0-9_-]{16,128})$/.exec(h);
  if (m) return { name: 'plan', mode: m[1] as 'e' | 'v', token: m[2] };
  return { name: 'notFound' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const navigate = (hash: string) => {
  window.location.hash = hash;
};

export function planUrl(token: string, mode: 'e' | 'v'): string {
  const base = window.location.href.split('#')[0];
  return `${base}#/${mode}/${token}`;
}
