import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity, Award, BarChart3, Blocks, Briefcase, Code2, Contact, Database, FolderKanban, GraduationCap, Image, LayoutDashboard,
  LogOut, Mail, Menu, MessageSquareQuote, Moon, Plug, Search, Settings2, ShieldAlert, StickyNote, Sun, UserRound, X,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { cx } from './ui.jsx';

const NAV = [
  { group: 'Overview', items: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  ] },
  { group: 'Content', items: [
    { to: '/profile', label: 'Profile', icon: UserRound },
    { to: '/contacts', label: 'Contacts', icon: Contact },
    { to: '/experience', label: 'Experience', icon: Briefcase },
    { to: '/education', label: 'Education', icon: GraduationCap },
    { to: '/skills', label: 'Skills', icon: Code2 },
    { to: '/projects', label: 'Projects', icon: FolderKanban },
    { to: '/achievements', label: 'Achievements', icon: Award },
    { to: '/testimonials', label: 'Testimonials', icon: MessageSquareQuote, badge: 'testimonials' },
  ] },
  { group: 'Customize', items: [
    { to: '/custom', label: 'Custom content', icon: Blocks },
  ] },
  { group: 'Inbox', items: [
    { to: '/messages', label: 'Messages', icon: Mail, badge: 'messages' },
    { to: '/limits', label: 'Spam & limits', icon: ShieldAlert },
  ] },
  { group: 'Library', items: [
    { to: '/media', label: 'Media', icon: Image },
    { to: '/notes', label: 'Notes', icon: StickyNote },
  ] },
  { group: 'Settings', items: [
    { to: '/site', label: 'Site & SEO', icon: Search },
    { to: '/integration', label: 'Integration', icon: Plug },
    { to: '/backup', label: 'Backup & restore', icon: Database },
    { to: '/activity', label: 'Activity log', icon: Activity },
    { to: '/account', label: 'Account', icon: Settings2 },
  ] },
];

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('pm-theme') || 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('pm-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return [isDark, () => setTheme(isDark ? 'light' : 'dark')];
}

export function Layout() {
  const { user, logout } = useAuth();
  const [badges, setBadges] = useState({});
  const [open, setOpen] = useState(false);
  const [isDark, toggleTheme] = useTheme();
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
    api.get('/api/admin/badges').then(setBadges).catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    const t = setInterval(() => api.get('/api/admin/badges').then(setBadges).catch(() => {}), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className={cx('shell', open && 'nav-open')}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">P</div>
          <div>
            <div className="brand-name">Portfolio Manager</div>
            <div className="brand-sub muted">{user?.display_name || user?.username}</div>
          </div>
          <button className="icon-btn icon-btn-ghost nav-close" aria-label="Close menu" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <nav className="nav">
          {NAV.map((g) => (
            <div key={g.group} className="nav-group">
              <div className="nav-group-label">{g.group}</div>
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => cx('nav-link', isActive && 'is-active')}>
                  <it.icon size={17} />
                  <span>{it.label}</span>
                  {it.badge && badges[it.badge] > 0 && <span className="nav-badge">{badges[it.badge]}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="nav-link" onClick={toggleTheme}>
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
            <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <button className="nav-link" onClick={logout}>
            <LogOut size={17} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar">
          <button className="icon-btn icon-btn-ghost" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu size={20} />
          </button>
          <span className="brand-name">Portfolio Manager</span>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
