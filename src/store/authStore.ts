import { create } from 'zustand';
import { User, Role, SystemAccount } from '../types';
import { auth, db } from '../lib/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

export const INITIAL_SYSTEM_ACCOUNTS: SystemAccount[] = [
  {
    id: 'acc_admin',
    username: 'admin',
    password: 'Admin!2026',
    name: 'Selçuk Karadağ (Sistem Yöneticisi)',
    role: 'admin',
    permissions: [
      'komuta_merkezi',
      'vardiya_onay',
      'plaka_yonetimi',
      'sofor_cari',
      'sanayi_eksper',
      'ceza_hukuk',
      'telemetri_iot',
      'plaka_sahibi_kira',
      'merkezi_kasa_denetim',
      'kullanici_yetki_yonetimi',
    ],
    status: 'active',
    departmentSummary: 'Tam Yetkili Kurumsal Yönetim & Denetim',
    tenantId: 't1',
    branchId: 'b1',
    createdAt: '2026-01-01T08:00:00Z',
  },
  {
    id: 'acc_operasyon',
    username: 'operasyon',
    password: 'Operasyon!2026',
    name: 'Murat Özkan (Operasyon Komuta Sorumlusu)',
    role: 'operation',
    permissions: [
      'komuta_merkezi',
      'vardiya_onay',
      'plaka_yonetimi',
      'sofor_cari',
      'telemetri_iot',
    ],
    status: 'active',
    departmentSummary: '12-Kapı Çıkış Onayı, Vardiya, Nöbet & Telemetri',
    tenantId: 't1',
    branchId: 'b1',
    createdAt: '2026-01-05T08:00:00Z',
  },
  {
    id: 'acc_finans',
    username: 'finans',
    password: 'Finans!2026',
    name: 'Ayşe Tekin (Gişe & Finans Kasa Sorumlusu)',
    role: 'finance',
    permissions: [
      'merkezi_kasa_denetim',
      'sofor_cari',
      'plaka_sahibi_kira',
    ],
    status: 'active',
    departmentSummary: 'Merkezi Kasa, Nakit & İBAN Dekont Onayı, Gün Sonu Mührü',
    tenantId: 't1',
    branchId: 'b1',
    createdAt: '2026-01-05T08:30:00Z',
  },
  {
    id: 'acc_sanayi',
    username: 'sanayi',
    password: 'Sanayi!2026',
    name: 'Kemal Usta (Sanayi & Eksper Sorumlusu)',
    role: 'workshop',
    permissions: ['sanayi_eksper', 'plaka_yonetimi'],
    status: 'active',
    departmentSummary: 'Sanayi İş Emirleri, Parça Stok & Sigorta Eksper Dosyaları',
    tenantId: 't1',
    branchId: 'b1',
    createdAt: '2026-01-08T09:00:00Z',
  },
  {
    id: 'acc_hukuk',
    username: 'hukuk',
    password: 'Hukuk!2026',
    name: 'Av. Zeynep Kaya (Hukuk & İtiraz Masası)',
    role: 'legal',
    permissions: ['ceza_hukuk', 'sofor_cari'],
    status: 'active',
    departmentSummary: 'HGS/EDS Ceza Rücu, Fotoğraflı İtiraz Çözümü & İcra Takibi',
    tenantId: 't1',
    branchId: 'b1',
    createdAt: '2026-01-10T09:00:00Z',
  },
  {
    id: 'acc_driver_d1',
    username: 'ahmet.yilmaz',
    password: 'Sofor!101',
    name: 'Ahmet Yılmaz (34 TXX 101 Gündüz Şoförü)',
    role: 'driver',
    permissions: ['sofor_mobil_kisisel'],
    linkedDriverId: 'd1',
    status: 'active',
    departmentSummary: 'Saha Şoförü — Yalnızca Kendi Plakası (34 TXX 101) & Cari Verisi',
    tenantId: 't1',
    branchId: 'b1',
    createdAt: '2026-01-12T07:00:00Z',
  },
  {
    id: 'acc_driver_d2',
    username: 'mehmet.demir',
    password: 'Sofor!204',
    name: 'Mehmet Demir (34 TXX 102 Şoförü)',
    role: 'driver',
    permissions: ['sofor_mobil_kisisel'],
    linkedDriverId: 'd2',
    status: 'active',
    departmentSummary: 'Saha Şoförü — Yalnızca Kendi Plakası (34 TXX 102) & Cari Verisi',
    tenantId: 't1',
    branchId: 'b1',
    createdAt: '2026-01-12T07:30:00Z',
  },
  {
    id: 'acc_driver_d3',
    username: 'ali.kaya',
    password: 'Sofor!305',
    name: 'Ali Kaya (Yedek Havuz Şoförü)',
    role: 'driver',
    permissions: ['sofor_mobil_kisisel'],
    linkedDriverId: 'd3',
    status: 'active',
    departmentSummary: 'Saha Yedek Şoförü — Yalnızca Kendi Zimmet & Cari Verisi',
    tenantId: 't1',
    branchId: 'b1',
    createdAt: '2026-01-15T08:00:00Z',
  },
  {
    id: 'acc_owner_po1',
    username: 'huseyin.karahan',
    password: 'Plaka!102',
    name: 'Hüseyin Karahan (34 TXX 102 Plaka Sahibi)',
    role: 'owner',
    permissions: ['plaka_sahibi_kisisel'],
    linkedOwnerId: 'po1',
    status: 'active',
    departmentSummary: 'Yatırımcı — Yalnızca 34 TXX 102 Canlı KM & Hakediş Verisi',
    tenantId: 't1',
    branchId: 'b1',
    createdAt: '2026-01-18T10:00:00Z',
  },
  {
    id: 'acc_owner_po2',
    username: 'nermin.yalcin',
    password: 'Plaka!103',
    name: 'Nermin Yalçın (34 TXX 103 Plaka Sahibi)',
    role: 'owner',
    permissions: ['plaka_sahibi_kisisel'],
    linkedOwnerId: 'po2',
    status: 'active',
    departmentSummary: 'Yatırımcı — Yalnızca 34 TXX 103 Canlı KM & Hakediş Verisi',
    tenantId: 't1',
    branchId: 'b1',
    createdAt: '2026-01-18T10:30:00Z',
  },
];

interface AuthState {
  user: User | null;
  systemAccounts: SystemAccount[];
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitializing: boolean;
  loginWithFirebase: (username: string, pass: string, role?: Role) => Promise<User>;
  logoutWithFirebase: () => Promise<void>;
  setAuthUser: (user: User | null) => void;
  addSystemAccount: (account: Omit<SystemAccount, 'id' | 'createdAt' | 'tenantId' | 'branchId'>) => void;
  toggleSystemAccountStatus: (accountId: string) => void;
  updateSystemAccountPassword: (accountId: string, newPassword: string) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  systemAccounts: INITIAL_SYSTEM_ACCOUNTS,
  isAuthenticated: false,
  isLoading: false,
  isInitializing: false,

  setAuthUser: (user) =>
    set({ user, isAuthenticated: !!user, isLoading: false, isInitializing: false }),

  addSystemAccount: (accountInput) => {
    const actor = get().user;
    if (!actor || actor.role !== 'admin') {
      throw new Error('Yalnızca Sistem Yöneticisi yeni kullanıcı hesabı tanımlayabilir.');
    }
    const cleanUsername = accountInput.username.trim().toLowerCase();
    if (get().systemAccounts.some((a) => a.username.toLowerCase() === cleanUsername)) {
      throw new Error('Bu kullanıcı adı zaten sistemde kayıtlı.');
    }
    const newAccount: SystemAccount = {
      ...accountInput,
      id: `acc_${Date.now()}`,
      username: cleanUsername,
      tenantId: 't1',
      branchId: 'b1',
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      systemAccounts: [newAccount, ...state.systemAccounts],
    }));
  },

  toggleSystemAccountStatus: (accountId) => {
    const actor = get().user;
    if (!actor || actor.role !== 'admin') return;
    set((state) => ({
      systemAccounts: state.systemAccounts.map((acc) =>
        acc.id === accountId
          ? { ...acc, status: acc.status === 'active' ? 'suspended' : 'active' }
          : acc
      ),
    }));
  },

  updateSystemAccountPassword: (accountId, newPassword) => {
    const actor = get().user;
    if (!actor || actor.role !== 'admin') return;
    set((state) => ({
      systemAccounts: state.systemAccounts.map((acc) =>
        acc.id === accountId ? { ...acc, password: newPassword } : acc
      ),
    }));
  },

  loginWithFirebase: async (username, pass) => {
    set({ isLoading: true });
    const cleanUsername = username.trim().toLowerCase().replace(/@fleetos\.com$/i, '');
    const matchedAccount = get().systemAccounts.find(
      (acc) => acc.username.toLowerCase() === cleanUsername && acc.password === pass
    );

    if (!matchedAccount) {
      set({ isLoading: false });
      throw new Error('Geçersiz kullanıcı adı veya şifre. Lütfen sistem yöneticisinin tanımladığı bilgileri girin.');
    }

    if (matchedAccount.status === 'suspended') {
      set({ isLoading: false });
      throw new Error('Bu kullanıcı hesabı Sistem Yöneticisi tarafından askıya alınmıştır. Giriş yapılamaz.');
    }

    const email = `${cleanUsername}@fleetos.com`;
    const firebasePass = pass.length >= 6 ? pass : `${pass}_fleet2026`;

    try {
      let uid = matchedAccount.id;
      try {
        const cred = await signInWithEmailAndPassword(auth, email, firebasePass);
        uid = cred.user.uid;
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (
          code === 'auth/user-not-found' ||
          code === 'auth/invalid-credential' ||
          code === 'auth/invalid-login-credentials'
        ) {
          try {
            const created = await createUserWithEmailAndPassword(auth, email, firebasePass);
            uid = created.user.uid;
          } catch {
            // Fallback to deterministic session if email already exists with an older password
          }
        }
      }

      const firestoreRole =
        matchedAccount.role === 'workshop'
          ? 'operation'
          : matchedAccount.role === 'legal'
          ? 'finance'
          : matchedAccount.role;

      const firestoreUserDoc = {
        id: uid,
        name: matchedAccount.name,
        role: firestoreRole,
        tenantId: matchedAccount.tenantId,
        branchId: matchedAccount.branchId,
      };

      if (auth.currentUser) {
        try {
          await setDoc(doc(db, 'users', auth.currentUser.uid), {
            ...firestoreUserDoc,
            id: auth.currentUser.uid,
          });
        } catch {
          // Ignore if already exists and locked by rules
        }
      }

      const authenticatedUser: User = {
        id: auth.currentUser?.uid || uid,
        username: matchedAccount.username,
        name: matchedAccount.name,
        role: matchedAccount.role,
        permissions: matchedAccount.permissions,
        linkedDriverId: matchedAccount.linkedDriverId,
        linkedOwnerId: matchedAccount.linkedOwnerId,
        status: matchedAccount.status,
        tenantId: matchedAccount.tenantId,
        branchId: matchedAccount.branchId,
      };

      set({ user: authenticatedUser, isAuthenticated: true, isLoading: false });
      return authenticatedUser;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logoutWithFirebase: async () => {
    set({ isLoading: true });
    try {
      await signOut(auth);
    } catch {
      // Ignore signout error
    }
    set({ user: null, isAuthenticated: false, isLoading: false });
  },
}));
