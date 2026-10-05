import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Shell } from './Shell';
import { AuthGuard } from './AuthGuard';
import { ErrorBoundary } from './ErrorBoundary';
import { Skeleton } from '@/components/ui/Skeleton';

// Lazy loading route chunks for performance budget compliance
const LoginRoute = lazy(() => import('@/features/auth/LoginRoute').then((m) => ({ default: m.LoginRoute })));
const OverviewRoute = lazy(() => import('@/features/overview/OverviewRoute').then((m) => ({ default: m.OverviewRoute })));
const UsersListRoute = lazy(() => import('@/features/users/UsersListRoute').then((m) => ({ default: m.UsersListRoute })));
const UserDetailRoute = lazy(() => import('@/features/users/UserDetailRoute').then((m) => ({ default: m.UserDetailRoute })));
const AccessMatrixRoute = lazy(() => import('@/features/access/AccessMatrixRoute').then((m) => ({ default: m.AccessMatrixRoute })));
const RolesRoute = lazy(() => import('@/features/access/RolesRoute').then((m) => ({ default: m.RolesRoute })));
const PermissionsRoute = lazy(() => import('@/features/access/PermissionsRoute').then((m) => ({ default: m.PermissionsRoute })));
const ModulesRoute = lazy(() => import('@/features/access/ModulesRoute').then((m) => ({ default: m.ModulesRoute })));
const StepUpPolicyRoute = lazy(() => import('@/features/access/StepUpPolicyRoute').then((m) => ({ default: m.StepUpPolicyRoute })));
const SessionsListRoute = lazy(() => import('@/features/sessions/SessionsListRoute').then((m) => ({ default: m.SessionsListRoute })));
const SessionDetailRoute = lazy(() => import('@/features/sessions/SessionDetailRoute').then((m) => ({ default: m.SessionDetailRoute })));
const ReportsRoute = lazy(() => import('@/features/reports/ReportsRoute').then((m) => ({ default: m.ReportsRoute })));
const AuditRoute = lazy(() => import('@/features/audit/AuditRoute').then((m) => ({ default: m.AuditRoute })));
const SettingsRoute = lazy(() => import('@/features/settings/SettingsRoute').then((m) => ({ default: m.SettingsRoute })));
const AccountRoute = lazy(() => import('@/features/account/AccountRoute').then((m) => ({ default: m.AccountRoute })));
const NotFoundRoute = lazy(() => import('@/features/system/NotFoundRoute').then((m) => ({ default: m.NotFoundRoute })));

const RouteLoading = () => (
  <div className="p-8 space-y-4 text-start">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-44 w-full rounded-3xl" />
    <Skeleton className="h-72 w-full rounded-3xl" />
  </div>
);

export const router = createBrowserRouter(
  [
    {
      path: '/login',
      element: (
        <Suspense fallback={<RouteLoading />}>
          <LoginRoute />
        </Suspense>
      ),
    },
    {
      path: '/',
      element: (
        <AuthGuard>
          <ErrorBoundary>
            <Shell />
          </ErrorBoundary>
        </AuthGuard>
      ),
      children: [
        {
          index: true,
          element: (
            <Suspense fallback={<RouteLoading />}>
              <OverviewRoute />
            </Suspense>
          ),
        },
        {
          path: 'users',
          element: (
            <Suspense fallback={<RouteLoading />}>
              <UsersListRoute />
            </Suspense>
          ),
        },
        {
          path: 'users/:id',
          element: (
            <Suspense fallback={<RouteLoading />}>
              <UserDetailRoute />
            </Suspense>
          ),
        },
        {
          path: 'access',
          children: [
            {
              index: true,
              element: <Navigate to="/access/matrix" replace />,
            },
            {
              path: 'matrix',
              element: (
                <Suspense fallback={<RouteLoading />}>
                  <AccessMatrixRoute />
                </Suspense>
              ),
            },
            {
              path: 'roles',
              element: (
                <Suspense fallback={<RouteLoading />}>
                  <RolesRoute />
                </Suspense>
              ),
            },
            {
              path: 'permissions',
              element: (
                <Suspense fallback={<RouteLoading />}>
                  <PermissionsRoute />
                </Suspense>
              ),
            },
            {
              path: 'modules',
              element: (
                <Suspense fallback={<RouteLoading />}>
                  <ModulesRoute />
                </Suspense>
              ),
            },
            {
              path: 'step-up',
              element: (
                <Suspense fallback={<RouteLoading />}>
                  <StepUpPolicyRoute />
                </Suspense>
              ),
            },
          ],
        },
        {
          path: 'sessions',
          element: (
            <Suspense fallback={<RouteLoading />}>
              <SessionsListRoute />
            </Suspense>
          ),
        },
        {
          path: 'sessions/:id',
          element: (
            <Suspense fallback={<RouteLoading />}>
              <SessionDetailRoute />
            </Suspense>
          ),
        },
        {
          path: 'reports',
          element: (
            <Suspense fallback={<RouteLoading />}>
              <ReportsRoute />
            </Suspense>
          ),
        },
        {
          path: 'audit',
          element: (
            <Suspense fallback={<RouteLoading />}>
              <AuditRoute />
            </Suspense>
          ),
        },
        {
          path: 'settings',
          element: (
            <Suspense fallback={<RouteLoading />}>
              <SettingsRoute />
            </Suspense>
          ),
        },
        {
          path: 'account',
          element: (
            <Suspense fallback={<RouteLoading />}>
              <AccountRoute />
            </Suspense>
          ),
        },
        {
          path: '*',
          element: (
            <Suspense fallback={<RouteLoading />}>
              <NotFoundRoute />
            </Suspense>
          ),
        },
      ],
    },
  ],
  {
    basename: import.meta.env.BASE_URL,
  }
);
