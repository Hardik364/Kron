/**
 * KRON Web Application root.
 *
 * Sets up client-side routing. Each page is lazily loaded so the initial
 * bundle stays small. Authentication redirect is handled inside each page's
 * Layout component — no route wrappers needed here.
 */

import { lazy, Suspense } from 'solid-js';
import { Route, Router } from '@solidjs/router';
import LoadingSkeleton from './components/ui/LoadingSkeleton';

const LoginPage = lazy(() => import('./pages/Login'));
const DashboardPage = lazy(() => import('./pages/Dashboard'));
const AlertsPage = lazy(() => import('./pages/Alerts'));
const EventsPage = lazy(() => import('./pages/Events'));
const MitrePage = lazy(() => import('./pages/Mitre'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const RuleBuilderPage = lazy(() => import('./pages/RuleBuilder'));

/** Full-screen skeleton shown while lazy page chunks are loading. */
function PageLoader() {
  return (
    <div
      style={{
        display: 'flex',
        'flex-direction': 'column',
        gap: '12px',
        padding: '32px',
        'max-width': '800px',
        margin: '0 auto',
      }}
    >
      <LoadingSkeleton height={40} />
      <LoadingSkeleton height={24} width="60%" />
      <LoadingSkeleton height={200} />
      <LoadingSkeleton height={120} />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Suspense fallback={<PageLoader />}>
        <Route path="/login" component={LoginPage} />
        <Route path="/" component={DashboardPage} />
        <Route path="/alerts" component={AlertsPage} />
        <Route path="/events" component={EventsPage} />
        <Route path="/mitre" component={MitrePage} />
        <Route path="/rules/new" component={RuleBuilderPage} />
        <Route path="/settings" component={SettingsPage} />
      </Suspense>
    </Router>
  );
}
