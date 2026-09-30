import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
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
import Downloads from './pages/Downloads.jsx';
import Notes from './pages/Notes.jsx';
import CustomContent from './pages/CustomContent.jsx';
import Limits from './pages/Limits.jsx';
import Accounts from './pages/Accounts.jsx';
import { Account, ActivityLog, Backup, Integration, SiteSettings } from './pages/System.jsx';
import { PageHeader } from './components/ui.jsx';

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
        <Route path="profile" element={<SimplePage settingKey="profile" title="Profile" description="Your personal details and about summary. How they look is decided by the portfolio's design." />} />
        {['contacts', 'experience', 'education', 'projects', 'achievements'].map((r) => (
          <Route key={r} path={r} element={<ResourceManager key={r} resource={r} schema={collections[r]} />} />
        ))}
        <Route path="skills" element={<Skills />} />
        <Route path="testimonials" element={<Testimonials />} />
        <Route path="messages" element={<Messages />} />
        <Route path="limits" element={<Limits />} />
        <Route path="media" element={<MediaLibrary />} />
        <Route path="downloads" element={<Downloads />} />
        <Route path="notes" element={<Notes />} />
        <Route path="custom" element={<CustomContent />} />
        <Route path="site" element={<SiteSettings />} />
        <Route path="integration" element={<Integration />} />
        <Route path="backup" element={<Backup />} />
        <Route path="activity" element={<ActivityLog />} />
        <Route path="account" element={<Account />} />
        {auth.user?.is_admin && <Route path="accounts" element={<Accounts />} />}
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
