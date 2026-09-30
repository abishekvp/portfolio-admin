import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import './styles.css';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { ConfirmProvider, Spinner, ToastProvider } from './components/ui.jsx';
import { Layout } from './components/Layout.jsx';
import { SettingsForm } from './components/SettingsForm.jsx';
import { ResourceManager } from './components/ResourceManager.jsx';
import { collections } from './lib/schemas.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Analytics from './pages/Analytics.jsx';
import Skills from './pages/Skills.jsx';
import Testimonials from './pages/Testimonials.jsx';
import Messages from './pages/Messages.jsx';
import MediaLibrary from './pages/MediaLibrary.jsx';
import Vault from './pages/Vault.jsx';
import Limits from './pages/Limits.jsx';
import { Account, ActivityLog, Backup, Integration, SiteSettings } from './pages/System.jsx';
import { PageHeader } from './components/ui.jsx';

function ContentPage() {
  const { key } = useParams();
  if (!['hero', 'about', 'contact'].includes(key)) return <Navigate to="/" replace />;
  return (
    <div className="page page-narrow">
      <SettingsForm key={key} settingKey={key} />
    </div>
  );
}

function SimplePage({ settingKey, title, description }) {
  return (
    <div className="page page-narrow">
      <PageHeader title={title} description={description} />
      <SettingsForm settingKey={settingKey} card={false} />
    </div>
  );
}

function App() {
  const auth = useAuth();
  if (auth.loading) return <Spinner block label="Loading portfolio manager…" />;
  if (!auth.authenticated) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="profile" element={<SimplePage settingKey="profile" title="Profile & resume" description="Identity, contact details, photo and resume used across the portfolio." />} />
        <Route path="content/:key" element={<ContentPage />} />
        <Route path="sections" element={<SimplePage settingKey="sections" title="Section headers" description="Titles, badges and visibility of every section on the portfolio." />} />
        {['experience', 'education', 'projects', 'achievements'].map((r) => (
          <Route key={r} path={r} element={<ResourceManager key={r} resource={r} schema={collections[r]} />} />
        ))}
        <Route path="skills" element={<Skills />} />
        <Route path="testimonials" element={<Testimonials />} />
        <Route path="messages" element={<Messages />} />
        <Route path="limits" element={<Limits />} />
        <Route path="media" element={<MediaLibrary />} />
        <Route path="vault" element={<Vault />} />
        <Route path="site" element={<SiteSettings />} />
        <Route path="integration" element={<Integration />} />
        <Route path="backup" element={<Backup />} />
        <Route path="activity" element={<ActivityLog />} />
        <Route path="account" element={<Account />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);
