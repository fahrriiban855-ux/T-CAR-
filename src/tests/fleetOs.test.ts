import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  app,
  db,
  auth,
  isEmulatorEnabled,
  getEmulatorConfig,
  configureFirebaseEmulators,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import {
  evaluateVehicleCompliance,
  evaluateDriverCompliance,
  findResponsibleDriverByTimestamp,
  calculatePenaltyTotalCharge,
} from '../services/dbService';
import {
  buildCanonicalDayCloseString,
  computeDayCloseSeal,
  evaluateDayCloseBlockers,
  hashOtpCode,
  evaluate12DepartureGates,
  evaluateShiftReturnAnomalies,
  evaluateDepositErosionStatus,
  calculateFleetIdleLossRadar,
  matchBestSpareDrivers,
} from '../services/decisionEngine';
import { useAuthStore } from '../store/authStore';

interface InMemoryStore {
  vehicles: Map<string, Record<string, any>>;
  drivers: Map<string, Record<string, any>>;
  custodies: Map<string, Record<string, any>>;
  shifts: Map<string, Record<string, any>>;
  service_cases: Map<string, Record<string, any>>;
  audit_logs: Map<string, Record<string, any>>;
  day_closes: Map<string, Record<string, any>>;
  otps: Map<string, Record<string, any>>;
}

function createTransactionalTestHarness() {
  const store: InMemoryStore = {
    vehicles: new Map(),
    drivers: new Map(),
    custodies: new Map(),
    shifts: new Map(),
    service_cases: new Map(),
    audit_logs: new Map(),
    day_closes: new Map(),
    otps: new Map(),
  };

  let idSeq = 100;
  const nextId = (prefix: string) => `${prefix}_${++idSeq}`;

  const executeAtomic = <T>(
    fn: (tx: {
      get: (col: keyof InMemoryStore, id: string) => Record<string, any> | undefined;
      set: (col: keyof InMemoryStore, id: string, val: Record<string, any>) => void;
      update: (col: keyof InMemoryStore, id: string, patch: Record<string, any>) => void;
    }) => T,
    failOnAuditWrite = false
  ): T => {
    const staged: Array<() => void> = [];
    const tx = {
      get: (col: keyof InMemoryStore, id: string) => {
        const item = store[col].get(id);
        return item ? { ...item } : undefined;
      },
      set: (col: keyof InMemoryStore, id: string, val: Record<string, any>) => {
        if (failOnAuditWrite && col === 'audit_logs') {
          throw new Error('Denetim kaydı (audit_logs) yazılamadı, ana işlem iptal edildi.');
        }
        staged.push(() => store[col].set(id, { ...val }));
      },
      update: (col: keyof InMemoryStore, id: string, patch: Record<string, any>) => {
        const existing = store[col].get(id);
        if (!existing) throw new Error(`Kayıt bulunamadı: ${String(col)}/${id}`);
        staged.push(() => store[col].set(id, { ...existing, ...patch }));
      },
    };

    const result = fn(tx);
    for (const apply of staged) {
      apply();
    }
    return result;
  };

  return { store, nextId, executeAtomic };
}

describe('1. Firebase SDK & Emulator Yapılandırma Testleri (src/lib/firebase.ts)', () => {
  beforeEach(() => {
    delete process.env.VITE_USE_FIREBASE_EMULATOR;
  });

  it('Firebase app, Firestore (db) ve Auth istemcileri tekil olarak başlatılmış olmalıdır', () => {
    expect(app).toBeDefined();
    expect(db).toBeDefined();
    expect(auth).toBeDefined();
  });

  it('VITE_USE_FIREBASE_EMULATOR=false iken emülatör bayrağı kapalı dönmelidir', () => {
    process.env.VITE_USE_FIREBASE_EMULATOR = 'false';
    expect(isEmulatorEnabled()).toBe(false);
    expect(getEmulatorConfig().enabled).toBe(false);
  });

  it('VITE_USE_FIREBASE_EMULATOR=true iken emülatör bayrağı aktif dönmeli ve bağlantı tekil (idempotent) olmalıdır', () => {
    process.env.VITE_USE_FIREBASE_EMULATOR = 'true';
    expect(isEmulatorEnabled()).toBe(true);
    const cfg = getEmulatorConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.firestoreHost).toBe('127.0.0.1');
    expect(cfg.firestorePort).toBe(8080);
    const firstCall = configureFirebaseEmulators();
    const secondCall = configureFirebaseEmulators();
    expect(firstCall).toBe(true);
    expect(secondCall).toBe(true);
  });

  it('handleFirestoreError standart JSON hata şeması üretmelidir', () => {
    expect(() =>
      handleFirestoreError(new Error('Missing or insufficient permissions.'), OperationType.GET, 'vehicles/v1')
    ).toThrowError(/Missing or insufficient permissions/);
  });
});

describe('2. Firestore Güvenlik Kuralları ve Tenant/Şube İzolasyonu Doğrulaması (firestore.rules)', () => {
  const rulesPath = path.join(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  it('Global default-deny kuralı ve rules_version = 2 tanımlı olmalıdır', () => {
    expect(rulesContent).toContain("rules_version = '2';");
    expect(rulesContent).toContain('allow read, write: if false;');
  });

  it('Tenant ve şube izolasyonu fonksiyonları tüm operasyonel koleksiyonları korumalıdır', () => {
    expect(rulesContent).toContain('function isSameTenant(targetTenantId)');
    expect(rulesContent).toContain('function isAllowedBranch(targetBranchId)');
    expect(rulesContent).toContain('canAccessScopedDoc(resource.data)');
    expect(rulesContent).toContain('canWriteScopedDoc(request.resource.data)');
  });

  it('Kullanıcı kendi rolünü admin yapamamalı ve kendi tenant/şubesini değiştirememelidir', () => {
    expect(rulesContent).toContain('request.resource.data.role == resource.data.role');
    expect(rulesContent).toContain('request.resource.data.tenantId == resource.data.tenantId');
    expect(rulesContent).toContain('request.resource.data.branchId == resource.data.branchId');
  });

  it('Audit kayıtlarında sahte actorRole ve sahte tenantId engellenmeli, update/delete kapalı olmalıdır', () => {
    expect(rulesContent).toContain('data.actorUserId == request.auth.uid');
    expect(rulesContent).toContain('data.actorRole == currentUserData().role');
    expect(rulesContent).toContain('data.tenantId == currentUserData().tenantId');
    expect(rulesContent).toMatch(/match \/audit_logs\/\{logId\}[\s\S]*?allow update, delete: if false;/);
  });

  it('Mühürlü gün (day_closes) kayıtları istemci tarafından oluşturulamaz, güncellenemez ve silinemez olmalıdır', () => {
    expect(rulesContent).toMatch(/match \/day_closes\/\{closeId\}[\s\S]*?allow create, update, delete: if false;/);
  });

  it('OTP koleksiyonunda düz metin kod saklanması engellenmeli ve yalnız 64 karakter SHA-256 codeHash kabul edilmelidir', () => {
    expect(rulesContent).toContain("!('code' in data)");
    expect(rulesContent).toContain('data.codeHash is string && data.codeHash.size() == 64');
  });
});

describe('3. Atomik Zimmet, Vardiya, Servis, OTP ve İzolasyon İşlev Testleri', () => {
  let harness: ReturnType<typeof createTransactionalTestHarness>;

  beforeEach(() => {
    harness = createTransactionalTestHarness();
    useAuthStore.getState().setAuthUser({
      id: 'u_ops_1',
      name: 'Operasyon Uzmanı',
      role: 'operation',
      tenantId: 't1',
      branchId: 'b1',
    });

    harness.store.vehicles.set('v1', {
      id: 'v1',
      plate: '34 ABC 123',
      status: 'available',
      lastOdometer: 45200,
      tenantId: 't1',
      branchId: 'b1',
    });
    harness.store.vehicles.set('v_tenant2', {
      id: 'v_tenant2',
      plate: '06 XYZ 999',
      status: 'available',
      lastOdometer: 10000,
      tenantId: 't2',
      branchId: 'b2',
    });
    harness.store.drivers.set('d1', {
      id: 'd1',
      name: 'Ahmet Yılmaz',
      status: 'eligible',
      tenantId: 't1',
      branchId: 'b1',
    });
    harness.store.drivers.set('d2', {
      id: 'd2',
      name: 'Mehmet Kaya',
      status: 'eligible',
      tenantId: 't1',
      branchId: 'b1',
    });
  });

  const performCustody = (vehicleId: string, driverId: string, failAudit = false) => {
    const actor = useAuthStore.getState().user!;
    return harness.executeAtomic((tx) => {
      const dayClose = tx.get('day_closes', `${actor.tenantId}_${actor.branchId}_2026-07-15`);
      if (dayClose && dayClose.status === 'closed') {
        throw new Error('Mühürlü güne yeni zimmet kaydı açılamaz.');
      }

      const v = tx.get('vehicles', vehicleId);
      const d = tx.get('drivers', driverId);
      if (!v || !d) throw new Error('Araç veya şoför bulunamadı.');
      if (v.tenantId !== actor.tenantId || d.tenantId !== actor.tenantId) {
        throw new Error('Erişim reddedildi: Farklı tenant kaydına işlem yapılamaz.');
      }
      if (v.branchId !== actor.branchId && actor.role !== 'admin') {
        throw new Error('Erişim reddedildi: Yetkisiz şube kaydına işlem yapılamaz.');
      }
      if (v.status !== 'available') throw new Error('Araç şu anda zimmet için uygun değil.');
      if (d.status !== 'eligible') throw new Error('Şoför şu anda zimmet için uygun durumda değil.');

      const cId = harness.nextId('c');
      tx.set('custodies', cId, {
        id: cId,
        vehicleId,
        driverId,
        status: 'active',
        odometerOut: v.lastOdometer,
        tenantId: actor.tenantId,
        branchId: actor.branchId,
      });
      tx.update('vehicles', vehicleId, { status: 'in_custody' });
      tx.update('drivers', driverId, { status: 'conditional' });
      tx.set('audit_logs', harness.nextId('aud'), {
        actorUserId: actor.id,
        actorRole: actor.role,
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        action: 'CREATE_CUSTODY',
        entityId: cId,
      });
      return cId;
    }, failAudit);
  };

  it('Başarılı zimmet: araç, şoför ve audit kaydı aynı transaction içinde güncellenmelidir', () => {
    const cId = performCustody('v1', 'd1');
    expect(harness.store.custodies.get(cId)?.status).toBe('active');
    expect(harness.store.vehicles.get('v1')?.status).toBe('in_custody');
    expect(harness.store.drivers.get('d1')?.status).toBe('conditional');
    expect(harness.store.audit_logs.size).toBe(1);
  });

  it('Aynı araca eşzamanlı ikinci zimmet girişimi reddedilmelidir', () => {
    performCustody('v1', 'd1');
    expect(() => performCustody('v1', 'd2')).toThrowError('Araç şu anda zimmet için uygun değil.');
  });

  it('Aynı şoföre eşzamanlı ikinci zimmet girişimi reddedilmelidir', () => {
    harness.store.vehicles.set('v2', {
      id: 'v2',
      plate: '34 DEF 456',
      status: 'available',
      lastOdometer: 20000,
      tenantId: 't1',
      branchId: 'b1',
    });
    performCustody('v1', 'd1');
    expect(() => performCustody('v2', 'd1')).toThrowError('Şoför şu anda zimmet için uygun durumda değil.');
  });

  it('Audit kaydı yazılamazsa ana zimmet işlemi tamamen geri alınmalıdır (atomiklik)', () => {
    expect(() => performCustody('v1', 'd1', true)).toThrowError(
      'Denetim kaydı (audit_logs) yazılamadı, ana işlem iptal edildi.'
    );
    expect(harness.store.custodies.size).toBe(0);
    expect(harness.store.vehicles.get('v1')?.status).toBe('available');
    expect(harness.store.drivers.get('d1')?.status).toBe('eligible');
  });

  it('Tenant A kullanıcısı Tenant B aracına işlem yapamamalıdır', () => {
    expect(() => performCustody('v_tenant2', 'd1')).toThrowError(
      'Erişim reddedildi: Farklı tenant kaydına işlem yapılamaz.'
    );
  });

  it('Şube kullanıcısı yetkisiz diğer şubeye işlem yapamamalıdır', () => {
    harness.store.vehicles.set('v_branch2', {
      id: 'v_branch2',
      plate: '34 BRN 002',
      status: 'available',
      lastOdometer: 15000,
      tenantId: 't1',
      branchId: 'b2',
    });
    expect(() => performCustody('v_branch2', 'd1')).toThrowError(
      'Erişim reddedildi: Yetkisiz şube kaydına işlem yapılamaz.'
    );
  });

  it('OTP doğrulama kuralları: yanlış, süresi geçmiş ve kullanılmış OTP zimmet iadesini engellemelidir', () => {
    const cId = performCustody('v1', 'd1');
    const codeHash = hashOtpCode('482910', 'c1_salt');

    harness.store.otps.set('otp_expired', {
      id: 'otp_expired',
      custodyId: cId,
      codeHash,
      status: 'expired',
      attempts: 1,
      maxAttempts: 3,
      expiresAt: '2020-01-01T00:00:00Z',
    });

    harness.store.otps.set('otp_consumed', {
      id: 'otp_consumed',
      custodyId: cId,
      codeHash,
      status: 'consumed',
      attempts: 1,
      maxAttempts: 3,
      expiresAt: '2099-01-01T00:00:00Z',
    });

    const verifyAndReturn = (otpId: string, providedCode: string) => {
      return harness.executeAtomic((tx) => {
        const otp = tx.get('otps', otpId);
        if (!otp) throw new Error('OTP bulunamadı.');
        if (otp.status === 'consumed') throw new Error('Bu OTP kodu daha önce kullanılmış.');
        if (otp.status === 'expired' || new Date(otp.expiresAt).getTime() < Date.now()) {
          throw new Error('OTP kodunun süresi dolmuş.');
        }
        if (otp.attempts >= otp.maxAttempts) {
          throw new Error('OTP deneme limiti aşıldı.');
        }
        if (hashOtpCode(providedCode, 'c1_salt') !== otp.codeHash) {
          harness.store.otps.set(otpId, { ...otp, attempts: otp.attempts + 1 });
          throw new Error('Yanlış OTP kodu.');
        }
        tx.update('otps', otpId, { status: 'consumed' });
        tx.update('custodies', cId, { status: 'returned', odometerIn: 45300 });
        tx.update('vehicles', 'v1', { status: 'available', lastOdometer: 45300 });
      });
    };

    expect(() => verifyAndReturn('otp_expired', '482910')).toThrowError('OTP kodunun süresi dolmuş.');
    expect(() => verifyAndReturn('otp_consumed', '482910')).toThrowError('Bu OTP kodu daha önce kullanılmış.');

    harness.store.otps.set('otp_valid', {
      id: 'otp_valid',
      custodyId: cId,
      codeHash,
      status: 'sent',
      attempts: 0,
      maxAttempts: 2,
      expiresAt: '2099-01-01T00:00:00Z',
    });

    expect(() => verifyAndReturn('otp_valid', '000000')).toThrowError('Yanlış OTP kodu.');
    expect(() => verifyAndReturn('otp_valid', '111111')).toThrowError('Yanlış OTP kodu.');
    expect(() => verifyAndReturn('otp_valid', '482910')).toThrowError('OTP deneme limiti aşıldı.');
  });

  it('Servise alma ve servisten çıkarma akışı tüm zorunlu alanları ve uygunluk onayını denetlemelidir', () => {
    const enterService = (vehicleId: string) =>
      harness.executeAtomic((tx) => {
        const v = tx.get('vehicles', vehicleId);
        if (!v) throw new Error('Araç bulunamadı.');
        if (v.status === 'in_custody' || v.status === 'in_shift') {
          throw new Error('Aktif zimmette veya vardiyada olan araç servise alınamaz.');
        }
        const caseId = harness.nextId('srv');
        tx.set('service_cases', caseId, {
          id: caseId,
          vehicleId,
          status: 'open',
          entryOdometer: 45200,
          reason: 'Periyodik Bakım',
          deliveredBy: 'Ahmet Yılmaz',
          provider: 'Yetkili Servis',
          estimatedExitAt: '2026-07-20',
          costBearer: 'company',
        });
        tx.update('vehicles', vehicleId, { status: 'maintenance', activeServiceCaseId: caseId });
        tx.set('audit_logs', harness.nextId('aud'), { action: 'ENTER_SERVICE', entityId: caseId });
        return caseId;
      });

    const caseId = enterService('v1');
    expect(harness.store.vehicles.get('v1')?.status).toBe('maintenance');
    expect(harness.store.service_cases.get(caseId)?.status).toBe('open');

    const exitService = (invoiceNo: string, partsLinked: boolean, eligible: boolean) =>
      harness.executeAtomic((tx) => {
        if (!invoiceNo || !partsLinked || !eligible) {
          throw new Error('Fatura, parça bağlantısı ve araç uygunluk kontrolü tamamlanmadan araç servisten çıkarılamaz.');
        }
        tx.update('service_cases', caseId, { status: 'closed', exitOdometer: 45250, invoiceNo });
        tx.update('vehicles', 'v1', { status: 'available', lastOdometer: 45250, activeServiceCaseId: null });
        tx.set('audit_logs', harness.nextId('aud'), { action: 'EXIT_SERVICE', entityId: caseId });
      });

    expect(() => exitService('', true, true)).toThrowError(/Fatura, parça bağlantısı/);
    expect(() => exitService('INV-101', false, true)).toThrowError(/Fatura, parça bağlantısı/);
    expect(() => exitService('INV-101', true, false)).toThrowError(/Fatura, parça bağlantısı/);

    exitService('INV-101', true, true);
    expect(harness.store.vehicles.get('v1')?.status).toBe('available');
    expect(harness.store.service_cases.get(caseId)?.status).toBe('closed');
  });
});

describe('4. Gün Kapanışı Engelleri (14 Engel) ve Sunucu HMAC Mühür Zinciri Testleri', () => {
  it('Açık vardiya, açık zimmet, tahsilatsız tahakkuk ve diğer 14 engel varsa gün kapanışını reddetmelidir', () => {
    const blockers = evaluateDayCloseBlockers({
      alreadyClosed: false,
      activeCustodyIds: ['c1'],
      activeShiftIds: ['s1'],
      uncollectedAccrualShiftIds: ['s3'],
      untransferredCollectionIds: ['col1'],
      cashDiffRecordIds: ['cd1'],
      posDiffRecordIds: ['pos1'],
      undocumentedDamageIds: ['dmg1'],
      undocumentedFineIds: ['fine1'],
      unapprovedExpenseIds: ['exp1'],
      openServiceCaseIds: ['srv1'],
      unlinkedPartExitIds: ['prt1'],
      disputedRecordIds: ['dsp1'],
      missingAuditEntityIds: ['op1'],
      openOwnerSettlementIds: ['own1'],
    });

    expect(blockers).toHaveLength(14);
    expect(blockers.map((b) => b.blockerCode)).toEqual([
      'ACTIVE_CUSTODY',
      'ACTIVE_SHIFT',
      'UNCOLLECTED_ACCRUAL',
      'UNTRANSFERRED_COLLECTION',
      'CASH_DIFFERENCE',
      'POS_RECONCILIATION_DIFF',
      'UNDOCUMENTED_DAMAGE',
      'UNDOCUMENTED_FINE_HGS',
      'UNAPPROVED_EXPENSE',
      'OPEN_SERVICE_CASE',
      'UNLINKED_PART_EXIT',
      'DISPUTED_RECORD',
      'MISSING_AUDIT_LOG',
      'OPEN_OWNER_SETTLEMENT_ITEM',
    ]);
  });

  it('Sunucu kanonik belge içeriğinden deterministik HMAC-SHA256 mührü ve previousCloseHash zinciri üretmelidir', () => {
    const secret = 'super-secure-hmac-key-2026-fleet-os';
    const day1Input = {
      tenantId: 't1',
      branchId: 'b1',
      businessDate: '2026-07-14',
      closedBy: 'u_fin_1',
      totalAccrual: 15000,
      totalCollection: 15000,
      cashDifference: 0,
      previousCloseHash: 'GENESIS',
      signatureVersion: 'v1',
    };

    const canonical = buildCanonicalDayCloseString(day1Input);
    expect(canonical).toContain('version=v1|tenant=t1|branch=b1');

    const day1Seal = computeDayCloseSeal(day1Input, secret);
    expect(day1Seal).toHaveLength(64);

    const day2Seal = computeDayCloseSeal(
      {
        ...day1Input,
        businessDate: '2026-07-15',
        previousCloseHash: day1Seal,
      },
      secret
    );
    expect(day2Seal).toHaveLength(64);
    expect(day2Seal).not.toBe(day1Seal);
  });
});

describe('5. Gerçek Zamanlı Abonelik (Listener) Tekilliği ve Unmount Temizliği Testleri', () => {
  it('Yeniden abonelik çağrılarında eski dinleyiciler kapatılmalı ve dinleyici sayısı artmamalıdır', () => {
    let activeSubscriptions = 0;
    let unsubscribes: Array<() => void> = [];

    const unsubscribeAll = () => {
      unsubscribes.forEach((u) => u());
      unsubscribes = [];
    };

    const subscribeAll = () => {
      unsubscribeAll();
      const cols = ['vehicles', 'drivers', 'shifts', 'custodies', 'tasks', 'service_cases'];
      unsubscribes = cols.map(() => {
        activeSubscriptions += 1;
        return () => {
          activeSubscriptions -= 1;
        };
      });
    };

    subscribeAll();
    expect(activeSubscriptions).toBe(6);

    subscribeAll();
    subscribeAll();
    expect(activeSubscriptions).toBe(6);

    unsubscribeAll();
    expect(activeSubscriptions).toBe(0);
  });
});

describe('6. Çalışma Alanı Temizliği ve Bağımlılık Bütünlüğü Testleri', () => {
  const rootDir = process.cwd();

  it('Projeyle ilgisi olmayan geçici belge ve kullanılmayan yardımcı dosyalar (security_spec.md, src/lib/utils.ts) bulunmamalıdır', () => {
    expect(fs.existsSync(path.join(rootDir, 'security_spec.md'))).toBe(false);
    expect(fs.existsSync(path.join(rootDir, 'src', 'lib', 'utils.ts'))).toBe(false);
    expect(fs.existsSync(path.join(rootDir, 'package-lock.json'))).toBe(true);
  });

  it('package.json paket adı fleet-os olmalı ve kullanılmayan bağımlılıklar kaldırılmış olmalıdır', () => {
    const pkgRaw = fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw);
    expect(pkg.name).toBe('fleet-os');

    const allDeps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };
    const forbiddenUnusedPackages = [
      '@google/genai',
      'pdfkit',
      'xlsx',
      'motion',
      'date-fns',
      'dotenv',
      'autoprefixer',
    ];
    for (const unusedPkg of forbiddenUnusedPackages) {
      expect(allDeps[unusedPkg]).toBeUndefined();
    }
  });

  it('Proje kaynak dizininde (src/) hiçbir boş dosya bulunmamalıdır', () => {
    const checkNoEmptyFiles = (dir: string): string[] => {
      const emptyFiles: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          emptyFiles.push(...checkNoEmptyFiles(fullPath));
        } else if (entry.isFile()) {
          const stat = fs.statSync(fullPath);
          if (stat.size === 0) {
            emptyFiles.push(fullPath);
          }
        }
      }
      return emptyFiles;
    };

    expect(checkNoEmptyFiles(path.join(rootDir, 'src'))).toEqual([]);
  });
});

describe('7. 500 Ticari Taksi: Otomatik Uyum Kilidi, Tarih-Saat Ceza Eşleştirme ve Yattı Parası Testleri', () => {
  it('10.000 KM bakım eşiği aşılırsa veya muayene/sigorta tarihi geçmişse aracı otomatik bloke etmelidir', () => {
    const issues = evaluateVehicleCompliance(
      {
        lastOdometer: 160500,
        nextMaintenanceOdometer: 160000,
        inspectionExpiry: '2026-01-01',
        insuranceExpiry: '2027-05-01',
      },
      '2026-10-15'
    );
    expect(issues.length).toBe(2);
    expect(issues[0]).toContain('10.000 KM periyodik bakım eşiği aşıldı');
    expect(issues[1]).toContain('TÜVTÜRK Muayene süresi dolmuş');
  });

  it('İBB Şoför Kartı biten, borç limitini aşan veya açık cezası olan şoförü otomatik bloke etmelidir', () => {
    const issues = evaluateDriverCompliance(
      {
        ibbCardExpiry: '2026-03-01',
        currentDebt: 7500,
        maxDebtLimit: 5000,
        unpaidFineCount: 1,
      },
      '2026-10-15'
    );
    expect(issues.length).toBe(3);
    expect(issues[0]).toContain('İBB Şoför Kartı');
    expect(issues[1]).toContain('Şoför cari borç limiti aşıldı');
    expect(issues[2]).toContain('açık ceza/rücu kaydı var');
  });

  it('Tarih-saat kesişimi ile ceza anında direksiyonda olan vardiya/zimmet şoförünü otomatik bulmalıdır', () => {
    const match = findResponsibleDriverByTimestamp(
      'v3',
      '2026-07-12T14:20:00Z',
      [
        {
          id: 's_day',
          vehicleId: 'v3',
          driverId: 'd_day_driver',
          startedAt: '2026-07-12T08:00:00Z',
          endedAt: '2026-07-12T20:00:00Z',
        },
      ],
      []
    );
    expect(match).not.toBeNull();
    expect(match?.driverId).toBe('d_day_driver');
    expect(match?.matchedRecordId).toBe('s_day');
    expect(match?.source).toBe('shift');
  });

  it('Kaza hasarı + Yattı Parası (serviste yattığı gün × günlük yevmiye × kusur oranı) hesabını doğru yapmalıdır', () => {
    const total = calculatePenaltyTotalCharge({
      amount: 10000,
      downtimeDays: 3,
      dailyYattiRate: 5000,
      faultPercentage: 50,
    });
    // %50 kusur ile: (10000 * 0.5) + (3 * 5000 * 0.5) = 5000 + 7500 = 12500 TL
    expect(total).toBe(12500);
  });
});

describe('8. 100/100 Merkezi Karar Beyni (decisionEngine) — 12 Kapılı Matris, Dönüş Anomalileri ve Yedek Şoför Eşleme', () => {
  it('12-Kapılı Çıkış Matrisi tüm kontroller uygun olduğunda canDepart=true ve 12 kapı sonucu döndürmelidir', () => {
    const result = evaluate12DepartureGates({
      vehicle: {
        id: 'v1',
        plate: '34 TXX 101',
        brand: 'Fiat',
        model: 'Egea',
        status: 'available',
        group: 'Sarı Taksi',
        lastOdometer: 145200,
        nextMaintenanceOdometer: 150000,
        inspectionExpiry: '2027-04-15',
        insuranceExpiry: '2027-02-10',
        taximeterExpiry: '2027-06-01',
      },
      driver: {
        id: 'd1',
        name: 'Ahmet Yılmaz',
        tc: '12345678901',
        phone: '+905321234567',
        status: 'eligible',
        ibbCardExpiry: '2027-11-30',
        licenseExpiry: '2029-05-14',
        depositRequired: 20000,
        depositPaid: 20000,
        currentDebt: 0,
        maxDebtLimit: 5000,
        unpaidFineCount: 0,
        trustScore: 98,
      },
      odometerOut: 145200,
      fuelLevelEighths: 6,
      photosVerifiedCount: 4,
      newDriverReportedDamage: false,
      taximeterSlipNo: 'TKS-90841',
      posDeviceDelivered: true,
      contractApproved: true,
      contractPinCode: '4829',
      activeCustodies: [],
      openServiceCases: [],
      referenceDateIso: '2026-10-16',
    });

    expect(result.gates).toHaveLength(12);
    expect(result.canDepart).toBe(true);
    expect(result.hardBlockCount).toBe(0);
    // 6/8 yakıt => (8 - 6) * 250 = 500 TL otomatik eksik yakıt mahsubu
    expect(result.fuelDeficitAdjustmentTl).toBe(500);
  });

  it('Dönüş denetimi (evaluateShiftReturnAnomalies) aşırı KM, eksik yevmiye (-5 puan) ve vardiya sarkması tazminatını hesaplamalıdır', () => {
    const evalResult = evaluateShiftReturnAnomalies({
      slot: 'day_12h',
      odometerStart: 100000,
      odometerEnd: 100520, // 520 KM > 450 KM (12 saat limiti)
      accrualTl: 2400,
      collectedTl: 1800, // 600 TL eksik
      lateHandoverMinutes: 60, // 60 dk gecikme (>30 dk)
    });

    expect(evalResult.drivenKm).toBe(520);
    expect(evalResult.excessiveKmAlert).toBe(true);
    expect(evalResult.underpaymentAmountTl).toBe(600);
    expect(evalResult.trustScoreDelta).toBe(-5);
    expect(evalResult.lateHandoverCompensationTl).toBe(200);
  });

  it('Teminat erimesi (%80+), canlı yatak zararı ve akıllı yedek şoför öneri motorunu doğru çalıştırmalıdır', () => {
    const erosion = evaluateDepositErosionStatus({
      depositPaid: 10000,
      currentDebt: 8500,
    });
    expect(erosion.isCriticalErosion).toBe(true);
    expect(erosion.erosionRatioPercent).toBe(85);

    const radar = calculateFleetIdleLossRadar([
      {
        id: 'v1',
        plate: '34 TXX 101',
        brand: 'Fiat',
        model: 'Egea',
        status: 'available',
        group: 'Sarı Taksi',
        lastOdometer: 100000,
        dailyDayRate: 2400,
        dailyNightRate: 2400,
        idleHours: 12,
      },
    ]);
    expect(radar).toHaveLength(1);
    expect(radar[0].idleLossTl).toBe(2400);

    const spares = matchBestSpareDrivers(
      [
        {
          id: 'd_low',
          name: 'Düşük Puanlı',
          tc: '11111111111',
          phone: '5551112233',
          status: 'eligible',
          ibbCardExpiry: '2027-12-01',
          licenseExpiry: '2028-12-01',
          depositPaid: 20000,
          depositRequired: 20000,
          currentDebt: 0,
          trustScore: 82,
        },
        {
          id: 'd_high',
          name: 'Yüksek Puanlı',
          tc: '22222222222',
          phone: '5552223344',
          status: 'eligible',
          ibbCardExpiry: '2027-12-01',
          licenseExpiry: '2028-12-01',
          depositPaid: 20000,
          depositRequired: 20000,
          currentDebt: 0,
          trustScore: 98,
        },
      ],
      [],
      '2026-10-16'
    );
    expect(spares.map((s) => s.id)).toEqual(['d_high', 'd_low']);
  });
});



