import { useEffect, useState } from 'react';

export function useTheme(): [boolean, () => void] {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    if (dark) document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem('ws.theme', dark ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#181614' : '#FAF7F2');
  }, [dark]);
  return [dark, () => setDark((d) => !d)];
}
