import React from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import LoginScreen from './screens/auth/LoginScreen';
import CommandCenterScreen from './screens/dashboard/CommandCenterScreen';
import VehicleListScreen from './screens/vehicles/VehicleListScreen';
import ShiftListScreen from './screens/shifts/ShiftListScreen';
import DriverListScreen from './screens/drivers/DriverListScreen';
import PenaltyIncidentScreen from './screens/penalties/PenaltyIncidentScreen';
import DriverMobilePortalScreen from './components/DriverMobilePortalScreen';
import OwnerLivePortalScreen from './screens/owner-portal/OwnerLivePortalScreen';
import WorkshopServiceScreen from './screens/workshop/WorkshopServiceScreen';
import TelemetryIntegrationsScreen from './screens/integrations/TelemetryIntegrationsScreen';
import FinanceAndAuditScreen from './screens/finance/FinanceAndAuditScreen';
import { useAuthStore } from './store/authStore';
import { Role } from './types';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const RoleGuard = ({
  allowedRoles,
  children,
}: {
  allowedRoles: Role[];
  children: React.ReactNode;
}) => {
  const user = useAuthStore((state) => state.user);
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!allowedRoles.includes(user.role)) {
    if (user.role === 'driver') return <Navigate to="/driver-portal" replace />;
    if (user.role === 'owner') return <Navigate to="/owner-portal" replace />;
    if (user.role === 'workshop') return <Navigate to="/workshop" replace />;
    if (user.role === 'legal') return <Navigate to="/penalties" replace />;
    if (user.role === 'finance') return <Navigate to="/finance-audit" replace />;
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginScreen />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: (
          <RoleGuard allowedRoles={['admin', 'operation']}>
            <CommandCenterScreen />
          </RoleGuard>
        ),
      },
      {
        path: 'driver-portal',
        element: (
          <RoleGuard allowedRoles={['driver', 'admin']}>
            <DriverMobilePortalScreen />
          </RoleGuard>
        ),
      },
      {
        path: 'owner-portal',
        element: (
          <RoleGuard allowedRoles={['owner', 'admin']}>
            <OwnerLivePortalScreen />
          </RoleGuard>
        ),
      },
      {
        path: 'shifts',
        element: (
          <RoleGuard allowedRoles={['admin', 'operation']}>
            <ShiftListScreen />
          </RoleGuard>
        ),
      },
      {
        path: 'vehicles',
        element: (
          <RoleGuard allowedRoles={['admin', 'operation', 'workshop']}>
            <VehicleListScreen />
          </RoleGuard>
        ),
      },
      {
        path: 'drivers',
        element: (
          <RoleGuard allowedRoles={['admin', 'operation', 'finance', 'legal']}>
            <DriverListScreen />
          </RoleGuard>
        ),
      },
      {
        path: 'workshop',
        element: (
          <RoleGuard allowedRoles={['admin', 'operation', 'workshop']}>
            <WorkshopServiceScreen />
          </RoleGuard>
        ),
      },
      {
        path: 'penalties',
        element: (
          <RoleGuard allowedRoles={['admin', 'operation', 'finance', 'legal']}>
            <PenaltyIncidentScreen />
          </RoleGuard>
        ),
      },
      {
        path: 'integrations',
        element: (
          <RoleGuard allowedRoles={['admin', 'operation']}>
            <TelemetryIntegrationsScreen />
          </RoleGuard>
        ),
      },
      {
        path: 'finance-audit',
        element: (
          <RoleGuard allowedRoles={['admin', 'finance']}>
            <FinanceAndAuditScreen />
          </RoleGuard>
        ),
      },
      {
        path: 'plate-owners',
        element: (
          <RoleGuard allowedRoles={['admin', 'finance', 'owner']}>
            <OwnerLivePortalScreen />
          </RoleGuard>
        ),
      },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
