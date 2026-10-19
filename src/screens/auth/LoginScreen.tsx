import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useDataStore } from '../../store/dataStore';
import { Car, Lock, ShieldCheck } from 'lucide-react';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loginWithFirebase = useAuthStore((state) => state.loginWithFirebase);
  const setActivePortal = useDataStore((state) => state.setActivePortal);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const loggedInUser = await loginWithFirebase(username, password);
      if (loggedInUser.role === 'driver') {
        setActivePortal('driver_mobile');
        navigate('/driver-portal', { replace: true });
      } else if (loggedInUser.role === 'owner') {
        setActivePortal('plate_owner');
        navigate('/owner-portal', { replace: true });
      } else if (loggedInUser.role === 'workshop') {
        setActivePortal('operations');
        navigate('/workshop', { replace: true });
      } else if (loggedInUser.role === 'legal') {
        setActivePortal('operations');
        navigate('/penalties', { replace: true });
      } else if (loggedInUser.role === 'finance') {
        setActivePortal('operations');
        navigate('/finance-audit', { replace: true });
      } else {
        setActivePortal('operations');
        navigate('/', { replace: true });
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Giriş yapılamadı. Lütfen sistem yöneticisinin tanımladığı kullanıcı adı ve şifreyi kontrol edin.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shadow-lg">
            <Car className="w-8 h-8" />
          </div>
        </div>
        <h2 className="mt-5 text-center text-2xl font-extrabold text-white tracking-tight">
          Fleet OS Kurumsal Giriş
        </h2>
        <p className="mt-1.5 text-center text-xs text-slate-400">
          500 Ticari Taksi Merkezi Karar Beyni · Sıfır Güven (Zero-Trust) Kimlik Doğrulama
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl sm:px-10 border border-slate-200">
          <form className="space-y-5" onSubmit={handleLogin}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800 text-xs font-medium rounded-xl p-3.5">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-xs font-bold text-slate-700 mb-1.5">
                Kurumsal Kullanıcı Adı
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                placeholder="Kullanıcı adınızı girin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="appearance-none block w-full min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-bold text-slate-700 mb-1.5">
                Şifre
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none block w-full min-h-[44px] px-3.5 py-2 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-slate-600">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Rol ve ekran yetkileriniz Sistem Yöneticisi tarafından hesabınıza tanımlanmıştır. Kullanıcı kendi rolünü seçemez veya değiştiremez.
              </span>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full min-h-[46px] flex justify-center items-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              <Lock className="w-4 h-4 text-amber-400" />
              {isLoading ? 'Kimlik ve Yetki Doğrulanıyor...' : 'Güvenli Oturum Aç'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
