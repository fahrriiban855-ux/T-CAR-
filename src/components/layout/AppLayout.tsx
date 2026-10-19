import React, { useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import {
  seedInitialDataIfEmpty,
  subscribeToFirestoreData,
  unsubscribeFromFirestore,
  useDataStore,
} from '../../store/dataStore';
import {
  LayoutDashboard,
  Car,
  Clock,
  Users,
  ShieldAlert,
  Wallet,
  LogOut,
  Wrench,
  Radio,
  Landmark,
  Lock,
} from 'lucide-react';
import { Role } from '../../types';

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Sistem Yöneticisi (Root)',
  operation: 'Operasyon Sorumlusu',
  finance: 'Gişe & Finans Sorumlusu',
  workshop: 'Sanayi & Eksper Sorumlusu',
  legal: 'Hukuk & İtiraz Masası',
  driver: 'Saha Şoförü (Kişisel Hesap)',
  owner: 'Plaka Sahibi (Kişisel Hesap)',
};

export default function AppLayout() {
  const user = useAuthStore((state) => state.user);
  const logoutWithFirebase = useAuthStore((state) => state.logoutWithFirebase);
  const setActivePortal = useDataStore((state) => state.setActivePortal);
  const pendingCount = useDataStore(
    (state) => state.shifts.filter((s) => s.status === 'pending_approval').length
  );

  const navigate = useNavigate();

  useEffect(() => {
    seedInitialDataIfEmpty().then(() => {
      subscribeToFirestoreData();
    });
    return () => {
      unsubscribeFromFirestore();
    };
  }, []);

  useEffect(() => {
    if (user?.role === 'driver') {
      setActivePortal('driver_mobile');
    } else if (user?.role === 'owner') {
      setActivePortal('plate_owner');
    } else {
      setActivePortal('operations');
    }
  }, [user?.role, setActivePortal]);

  const handleLogout = async () => {
    unsubscribeFromFirestore();
    await logoutWithFirebase();
    navigate('/login', { replace: true });
  };

  const allNavItems: Array<{
    name: string;
    path: string;
    icon: React.ComponentType<{ className?: string }>;
    allowedRoles: Role[];
  }> = [
    {
      name: `Komuta & IAM Özeti ${pendingCount > 0 ? `(${pendingCount})` : ''}`,
      path: '/',
      icon: LayoutDashboard,
      allowedRoles: ['admin', 'operation'],
    },
    {
      name: 'Vardiya, Nöbet & Zimmet',
      path: '/shifts',
      icon: Clock,
      allowedRoles: ['admin', 'operation'],
    },
    {
      name: 'Plakalar & 360° Sicil',
      path: '/vehicles',
      icon: Car,
      allowedRoles: ['admin', 'operation', 'workshop'],
    },
    {
      name: 'Şoför Cari & Güven Puanı',
      path: '/drivers',
      icon: Users,
      allowedRoles: ['admin', 'operation', 'finance', 'legal'],
    },
    {
      name: 'Sanayi, Parça & Eksper',
      path: '/workshop',
      icon: Wrench,
      allowedRoles: ['admin', 'operation', 'workshop'],
    },
    {
      name: 'Ceza, İtiraz & Hukuk',
      path: '/penalties',
      icon: ShieldAlert,
      allowedRoles: ['admin', 'operation', 'finance', 'legal'],
    },
    {
      name: 'Telemetri & Entegrasyon',
      path: '/integrations',
      icon: Radio,
      allowedRoles: ['admin', 'operation'],
    },
    {
      name: 'Plaka Sahipleri & Kira',
      path: '/plate-owners',
      icon: Wallet,
      allowedRoles: ['admin', 'finance'],
    },
    {
      name: 'Merkezi Kasa & Dekont Onay',
      path: '/finance-audit',
      icon: Landmark,
      allowedRoles: ['admin', 'finance'],
    },
  ];

  const allowedNavItems = allNavItems.filter(
    (item) => user && item.allowedRoles.includes(user.role)
  );

  const isMobileOrOwnerLockedRole = user?.role === 'driver' || user?.role === 'owner';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col">
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Fleet OS
          </span>
          {user && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-semibold">
              <Lock className="w-3 h-3 text-amber-400" />
              {ROLE_LABELS[user.role]}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:block text-right">
            <span className="text-xs font-bold text-slate-900 block leading-tight">
              {user?.name || 'Kullanıcı'}
            </span>
            <span className="text-[11px] font-mono text-slate-500 block">
              @{user?.username || 'oturum'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            Güvenli Çıkış
          </button>
        </div>
      </header>

      <div className="flex-1 flex">
        {!isMobileOrOwnerLockedRole && allowedNavItems.length > 0 && (
          <aside className="w-60 bg-white border-r border-slate-200 hidden md:flex flex-col justify-between p-4 shrink-0">
            <nav className="space-y-1">
              {allowedNavItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </nav>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 mt-4 text-[11px] text-slate-600">
              <span className="font-bold text-slate-800 block">Yetki Kilidi Aktif</span>
              <span>
                Oturumunuz <strong>{user ? ROLE_LABELS[user.role] : ''}</strong> yetki sınırlarıyla korunmaktadır.
              </span>
            </div>
          </aside>
        )}

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
