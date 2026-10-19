import { create } from 'zustand';
import {
  Vehicle,
  Driver,
  Custody,
  Role,
  ServiceCase,
  PenaltyIncident,
  PlateOwnerSettlement,
  WorkspacePortalMode,
  WorkshopPartItem,
  LedgerEntryItem,
} from '../types';
import { collection, onSnapshot, doc, setDoc, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  dbService,
  ServiceEntryInput,
  ServiceExitInput,
  ShiftCloseCollectionInput,
  PreShiftDepartureRequestInput,
  PenaltyIncidentInput,
  PlateOwnerInput,
} from '../services/dbService';

export interface Shift {
  id: string;
  vehicleId: string;
  driverId: string;
  status: 'pending_approval' | 'active' | 'completed' | 'delayed';
  startedAt: string;
  endedAt?: string;
  type: string;
  slot?: 'day_12h' | 'night_12h' | 'full_24h';
  accrual: number;
  collection: number;
  cashCollected?: number;
  posCollected?: number;
  ibanCollected?: number;
  arrearsAmount?: number;
  odometerStart?: number;
  odometerEnd?: number;
  fuelLevelEighths?: number;
  photosVerifiedCount?: number;
  taximeterSlipNo?: string;
  posDeviceDelivered?: boolean;
  contractPinCode?: string;
  newDriverReportedDamage?: boolean;
  newDriverDamageNotes?: string;
  fuelDeficitAdjustmentTl?: number;
  unaccountedKm?: number;
  custodyId?: string;
  tenantId?: string;
  branchId?: string;
}

export interface AppTask {
  id: number;
  title: string;
  type: string;
  priority: 'Kritik' | 'Yüksek' | 'Orta';
  time: string;
  role: Role;
}

interface DataState {
  activePortal: WorkspacePortalMode;
  setActivePortal: (portal: WorkspacePortalMode) => void;

  vehicles: Vehicle[];
  drivers: Driver[];
  shifts: Shift[];
  custodies: Custody[];
  tasks: AppTask[];
  serviceCases: ServiceCase[];
  penalties: PenaltyIncident[];
  plateOwners: PlateOwnerSettlement[];
  ledgerEntries: LedgerEntryItem[];
  auditLogs: Record<string, unknown>[];
  workshopParts: WorkshopPartItem[];

  addVehicle: (vehicle: Omit<Vehicle, 'id'>) => Promise<void>;
  updateVehicleStatus: (id: string, status: Vehicle['status']) => Promise<void>;
  enterService: (input: ServiceEntryInput) => Promise<void>;
  exitService: (input: ServiceExitInput) => Promise<void>;
  completeWorkshopServiceWithFullIntegration: (
    input: Parameters<typeof dbService.completeWorkshopServiceWithFullIntegration>[0]
  ) => Promise<void>;
  updatePartStock: (partId: string, deltaQty: number) => void;
  addDriver: (driver: Omit<Driver, 'id'>) => Promise<void>;
  recordDriverLedgerPayment: (
    driverId: string,
    amount: number,
    paymentKind: 'debt_payment' | 'deposit_payment'
  ) => Promise<void>;
  offsetDriverDebtFromDeposit: (driverId: string) => Promise<void>;
  submitPreShiftDepartureRequest: (input: PreShiftDepartureRequestInput) => Promise<void>;
  approveShiftDeparture: (shiftId: string) => Promise<void>;
  addShift: (shift: Omit<Shift, 'id'>) => Promise<void>;
  closeShift: (
    id: string,
    collectionDetails?: Omit<ShiftCloseCollectionInput, 'shiftId'>
  ) => Promise<void>;
  addCustody: (custody: Omit<Custody, 'id'>) => Promise<void>;
  returnCustody: (
    id: string,
    data: { odometerIn: number; otpId?: string; returnFuelEighths?: number; returnDamageNotes?: string }
  ) => Promise<void>;
  addPenaltyIncident: (input: PenaltyIncidentInput) => Promise<void>;
  disputePenaltyIncident: (id: string, disputeReason: string) => Promise<void>;
  resolvePenaltyDispute: (
    penaltyId: string,
    resolution: 'accept_cancel' | 'reject_confirm' | 'escalate_legal',
    notes: string,
    legalCaseNo?: string,
    lawyerName?: string
  ) => Promise<void>;
  collectPenaltyIncident: (id: string) => Promise<void>;
  assignVehicleRoster: (
    vehicleId: string,
    dayDriverId: string,
    nightDriverId: string,
    shiftModel: '2x12_double' | '24h_single'
  ) => Promise<void>;
  addPlateOwnerSettlement: (input: PlateOwnerInput) => Promise<void>;
  settlePlateOwnerPayout: (ownerId: string, payoutAmount: number) => Promise<void>;
  resolveTask: (id: number) => Promise<void>;
  refreshData: () => Promise<void>;
}

const initialVehicles: Vehicle[] = [
  {
    id: 'v1',
    plate: '34 TXX 101',
    brand: 'Fiat',
    model: 'Egea 1.6 Multijet Taksi',
    status: 'available',
    group: 'Sarı Taksi',
    lastOdometer: 145200,
    nextMaintenanceOdometer: 150000,
    shiftModel: '2x12_double',
    ownershipType: 'owned',
    dailyDayRate: 2400,
    dailyNightRate: 2600,
    daily24hRate: 4600,
    assignedDayDriverId: 'd1',
    assignedNightDriverId: 'd2',
    inspectionExpiry: '2027-04-15',
    insuranceExpiry: '2027-02-10',
    cascoExpiry: '2027-02-10',
    taximeterExpiry: '2027-06-01',
    stopName: 'Şişli Merkez Durak',
    idleHours: 5,
    lastReturnFuelEighths: 8,
    tenantId: 't1',
    branchId: 'b1',
  },
  {
    id: 'v2',
    plate: '34 TXX 102',
    brand: 'Renault',
    model: 'Megane Sedan Taksi',
    status: 'in_custody',
    group: 'Sarı Taksi',
    lastOdometer: 92500,
    nextMaintenanceOdometer: 100000,
    shiftModel: '2x12_double',
    ownershipType: 'leased_plate',
    plateOwnerName: 'Hüseyin Karahan',
    monthlyPlateRent: 95000,
    dailyDayRate: 2500,
    dailyNightRate: 2700,
    daily24hRate: 4800,
    assignedDayDriverId: 'd2',
    inspectionExpiry: '2027-01-20',
    insuranceExpiry: '2027-03-18',
    cascoExpiry: '2027-03-18',
    taximeterExpiry: '2027-05-12',
    stopName: 'Beşiktaş Meydan',
    idleHours: 0,
    lastReturnFuelEighths: 8,
    tenantId: 't1',
    branchId: 'b1',
  },
  {
    id: 'v3',
    plate: '34 TXX 103',
    brand: 'Toyota',
    model: 'Corolla Hybrid Taksi',
    status: 'in_shift',
    group: 'Turkuaz Taksi',
    lastOdometer: 68300,
    nextMaintenanceOdometer: 68650,
    shiftModel: '24h_single',
    ownershipType: 'leased_plate',
    plateOwnerName: 'Nermin Yalçın',
    monthlyPlateRent: 110000,
    dailyDayRate: 2900,
    dailyNightRate: 3100,
    daily24hRate: 5400,
    assignedDayDriverId: 'd1',
    inspectionExpiry: '2027-08-10',
    insuranceExpiry: '2027-05-01',
    cascoExpiry: '2027-05-01',
    taximeterExpiry: '2027-09-01',
    stopName: 'Kadıköy Rıhtım',
    idleHours: 0,
    lastReturnFuelEighths: 8,
    tenantId: 't1',
    branchId: 'b1',
  },
  {
    id: 'v4',
    plate: '34 TXX 104',
    brand: 'Fiat',
    model: 'Egea Cross Taksi',
    status: 'maintenance',
    group: 'Sarı Taksi',
    lastOdometer: 212000,
    nextMaintenanceOdometer: 220000,
    shiftModel: '2x12_double',
    ownershipType: 'owned',
    dailyDayRate: 2400,
    dailyNightRate: 2600,
    daily24hRate: 4600,
    inspectionExpiry: '2027-03-11',
    insuranceExpiry: '2027-03-11',
    cascoExpiry: '2027-03-11',
    taximeterExpiry: '2027-04-01',
    stopName: 'Bakırköy İncirli',
    idleHours: 14,
    tenantId: 't1',
    branchId: 'b1',
  },
  {
    id: 'v5',
    plate: '34 TXX 105',
    brand: 'Mercedes-Benz',
    model: 'Vito VIP Taksi',
    status: 'blocked',
    group: 'Siyah Lüks Taksi',
    lastOdometer: 160400,
    nextMaintenanceOdometer: 160000,
    shiftModel: '24h_single',
    ownershipType: 'leased_plate',
    plateOwnerName: 'Cemil Aydın',
    monthlyPlateRent: 135000,
    dailyDayRate: 3800,
    dailyNightRate: 4200,
    daily24hRate: 7200,
    inspectionExpiry: '2026-05-01',
    insuranceExpiry: '2027-01-15',
    cascoExpiry: '2027-01-15',
    taximeterExpiry: '2027-02-20',
    stopName: 'Havalimanı / Levent',
    idleHours: 22,
    tenantId: 't1',
    branchId: 'b1',
  },
];

const initialDrivers: Driver[] = [
  {
    id: 'd1',
    name: 'Ahmet Yılmaz',
    tc: '12345678901',
    phone: '+90 532 123 4567',
    status: 'eligible',
    ibbCardNo: 'IBB-34-88412',
    ibbCardExpiry: '2027-11-30',
    licenseExpiry: '2029-05-14',
    srcExpiry: '2028-04-20',
    psychotechnicExpiry: '2028-04-20',
    depositRequired: 20000,
    depositPaid: 20000,
    currentDebt: 0,
    maxDebtLimit: 5000,
    unpaidFineCount: 0,
    trustScore: 98,
    hoursWorkedLast24h: 0,
    recentShiftShortfalls: 0,
    lastShiftShortfall: 0,
    tenantId: 't1',
    branchId: 'b1',
  },
  {
    id: 'd2',
    name: 'Mehmet Kaya',
    tc: '23456789012',
    phone: '+90 533 234 5678',
    status: 'eligible',
    ibbCardNo: 'IBB-34-90125',
    ibbCardExpiry: '2027-08-15',
    licenseExpiry: '2028-10-01',
    srcExpiry: '2027-12-01',
    psychotechnicExpiry: '2027-12-01',
    depositRequired: 20000,
    depositPaid: 20000,
    currentDebt: 1000,
    maxDebtLimit: 5000,
    unpaidFineCount: 0,
    trustScore: 91,
    hoursWorkedLast24h: 6,
    recentShiftShortfalls: 0,
    lastShiftShortfall: 0,
    tenantId: 't1',
    branchId: 'b1',
  },
  {
    id: 'd3',
    name: 'Ayşe Demir',
    tc: '34567890123',
    phone: '+90 534 345 6789',
    status: 'conditional',
    ibbCardNo: 'IBB-34-77340',
    ibbCardExpiry: '2027-06-20',
    licenseExpiry: '2028-03-19',
    srcExpiry: '2027-09-10',
    psychotechnicExpiry: '2027-09-10',
    depositRequired: 20000,
    depositPaid: 15000,
    currentDebt: 3000,
    maxDebtLimit: 5000,
    unpaidFineCount: 0,
    trustScore: 74,
    hoursWorkedLast24h: 8,
    recentShiftShortfalls: 1,
    lastShiftShortfall: 0,
    tenantId: 't1',
    branchId: 'b1',
  },
  {
    id: 'd4',
    name: 'Can Özkan',
    tc: '45678901234',
    phone: '+90 535 456 7890',
    status: 'suspended',
    ibbCardNo: 'IBB-34-51009',
    ibbCardExpiry: '2026-03-01',
    licenseExpiry: '2028-01-10',
    srcExpiry: '2027-07-15',
    psychotechnicExpiry: '2027-07-15',
    depositRequired: 20000,
    depositPaid: 10000,
    currentDebt: 8400,
    maxDebtLimit: 5000,
    unpaidFineCount: 2,
    trustScore: 48,
    hoursWorkedLast24h: 11,
    recentShiftShortfalls: 2,
    lastShiftShortfall: 1,
    tenantId: 't1',
    branchId: 'b1',
  },
];

const initialShifts: Shift[] = [
  {
    id: 's1',
    vehicleId: 'v3',
    driverId: 'd1',
    status: 'active',
    startedAt: '2026-10-16T08:00:00Z',
    type: 'Gündüz (12 Saat)',
    slot: 'day_12h',
    accrual: 2900,
    collection: 1900,
    cashCollected: 1000,
    posCollected: 900,
    ibanCollected: 0,
    arrearsAmount: 1000,
    odometerStart: 68100,
    fuelLevelEighths: 8,
    photosVerifiedCount: 4,
    taximeterSlipNo: 'TKS-88401',
    posDeviceDelivered: true,
    contractPinCode: '4829',
    tenantId: 't1',
    branchId: 'b1',
  },
  {
    id: 's2',
    vehicleId: 'v2',
    driverId: 'd2',
    status: 'completed',
    startedAt: '2026-10-15T08:00:00Z',
    endedAt: '2026-10-15T20:00:00Z',
    type: 'Gündüz (12 Saat)',
    slot: 'day_12h',
    accrual: 2500,
    collection: 2500,
    cashCollected: 1500,
    posCollected: 1000,
    ibanCollected: 0,
    arrearsAmount: 0,
    odometerStart: 92200,
    odometerEnd: 92500,
    fuelLevelEighths: 8,
    photosVerifiedCount: 4,
    taximeterSlipNo: 'TKS-88190',
    posDeviceDelivered: true,
    contractPinCode: '1923',
    tenantId: 't1',
    branchId: 'b1',
  },
  {
    id: 's3',
    vehicleId: 'v1',
    driverId: 'd2',
    status: 'pending_approval',
    startedAt: '2026-10-16T09:15:00Z',
    type: 'Gündüz (12 Saat)',
    slot: 'day_12h',
    accrual: 2400,
    collection: 0,
    cashCollected: 0,
    posCollected: 0,
    ibanCollected: 0,
    arrearsAmount: 2400,
    odometerStart: 145200,
    fuelLevelEighths: 8,
    photosVerifiedCount: 4,
    taximeterSlipNo: 'TKS-90412',
    posDeviceDelivered: true,
    contractPinCode: '5514',
    tenantId: 't1',
    branchId: 'b1',
  },
];

const initialCustodies: Custody[] = [
  {
    id: 'c1',
    vehicleId: 'v2',
    driverId: 'd2',
    status: 'active',
    handedOverAt: '2026-10-16T07:30:00Z',
    odometerOut: 92450,
    fuelLevelEighths: 8,
    photosVerified: true,
    taximeterSlipNo: 'TKS-88211',
    posDeviceDelivered: true,
    contractPinCode: '3910',
    tenantId: 't1',
    branchId: 'b1',
  },
  {
    id: 'c2',
    vehicleId: 'v1',
    driverId: 'd1',
    status: 'returned',
    handedOverAt: '2026-10-15T08:00:00Z',
    returnedAt: '2026-10-15T20:00:00Z',
    odometerOut: 145000,
    odometerIn: 145200,
    fuelLevelEighths: 8,
    returnFuelEighths: 8,
    photosVerified: true,
    taximeterSlipNo: 'TKS-88004',
    posDeviceDelivered: true,
    contractPinCode: '7120',
    tenantId: 't1',
    branchId: 'b1',
  },
];

const initialPenalties: PenaltyIncident[] = [
  {
    id: 'pen1',
    tenantId: 't1',
    branchId: 'b1',
    vehicleId: 'v3',
    plate: '34 TXX 103',
    driverId: 'd4',
    driverName: 'Can Özkan',
    type: 'traffic_fine',
    violationAt: '2026-10-14T14:20:00Z',
    amount: 3135,
    downtimeDays: 0,
    dailyYattiRate: 0,
    faultPercentage: 100,
    totalCharge: 3135,
    documentNo: 'EGM-2026-99812',
    status: 'pending_collection',
    description: 'EDS Hız İhlali (%30-50) - Saniye bazlı vardiya kesişimi ile otomatik eşleşti',
    matchedRecordId: 's2',
    createdAt: '2026-10-15T09:00:00Z',
  },
  {
    id: 'pen2',
    tenantId: 't1',
    branchId: 'b1',
    vehicleId: 'v4',
    plate: '34 TXX 104',
    driverId: 'd4',
    driverName: 'Can Özkan',
    type: 'accident_damage',
    violationAt: '2026-10-12T22:15:00Z',
    amount: 6000,
    downtimeDays: 2,
    dailyYattiRate: 2400,
    faultPercentage: 100,
    totalCharge: 10800,
    documentNo: 'KZA-2026-441',
    status: 'pending_collection',
    description: 'Sağ ön çamurluk hasarı + 2 gün servis yattı parası (%100 kusur)',
    matchedRecordId: 'c2',
    createdAt: '2026-10-13T10:00:00Z',
  },
];

const initialPlateOwners: PlateOwnerSettlement[] = [
  {
    id: 'po1',
    tenantId: 't1',
    branchId: 'b1',
    ownerName: 'Hüseyin Karahan',
    phone: '+90 532 400 1122',
    iban: 'TR44 0006 2000 1230 0006 5544 11',
    plate: '34 TXX 102',
    vehicleId: 'v2',
    periodMonth: '2026-10',
    monthlyBaseRent: 95000,
    deductedExpenses: 7500,
    paidAmount: 45000,
    status: 'open',
    notes: 'MTV 2. Taksit ve Zorunlu Trafik Sigortası 3-Taraf Matris ile mal sahibinden mahsup edildi',
    updatedAt: '2026-10-15T12:00:00Z',
  },
  {
    id: 'po2',
    tenantId: 't1',
    branchId: 'b1',
    ownerName: 'Nermin Yalçın',
    phone: '+90 533 811 9900',
    iban: 'TR89 0001 0002 4450 0009 8877 00',
    plate: '34 TXX 103',
    vehicleId: 'v3',
    periodMonth: '2026-10',
    monthlyBaseRent: 110000,
    deductedExpenses: 5000,
    paidAmount: 105000,
    status: 'settled',
    notes: 'Turkuaz taksi plaka kirası tam mutabakatla ödendi',
    updatedAt: '2026-10-15T15:00:00Z',
  },
  {
    id: 'po3',
    tenantId: 't1',
    branchId: 'b1',
    ownerName: 'Cemil Aydın',
    phone: '+90 532 700 8811',
    iban: 'TR12 0006 4000 0011 2233 4455 66',
    plate: '34 TXX 105',
    vehicleId: 'v5',
    periodMonth: '2026-10',
    monthlyBaseRent: 135000,
    deductedExpenses: 12000,
    paidAmount: 60000,
    status: 'open',
    notes: 'TÜVTÜRK Muayene ve Ağır Bakım kesintisi mahsup edildi',
    updatedAt: '2026-10-15T16:30:00Z',
  },
];

const initialTasks: AppTask[] = [
  { id: 1, title: 'Kasa sayımı ve POS Z-raporu mutabakatı eksik', type: 'Finans', priority: 'Kritik', time: '10:30', role: 'finance' },
  { id: 2, title: '34 TXX 101 vardiya çıkış doğrulaması onay bekliyor', type: 'Operasyon', priority: 'Yüksek', time: '11:15', role: 'operation' },
  { id: 3, title: 'Can Özkan - Teminat erimesi (%84) depozito mahsubu', type: 'Uyum', priority: 'Kritik', time: '14:00', role: 'operation' },
];

const initialWorkshopParts: WorkshopPartItem[] = [
  {
    id: 'prt1',
    code: 'PR-101',
    name: 'Ön Fren Balata Takımı (Ağır Hizmet Taksi)',
    category: 'Fren & Yürüyen',
    stockQty: 28,
    minAlertQty: 15,
    unitCostTl: 1450,
    compatibleModels: 'Fiat Egea / Renault Megane',
  },
  {
    id: 'prt2',
    code: 'PR-102',
    name: '5W-30 Tam Sentetik Motor Yağı (5L) + Yağ/Hava/Polen Filtre Seti',
    category: 'Bakım & Filtre',
    stockQty: 42,
    minAlertQty: 20,
    unitCostTl: 2650,
    compatibleModels: 'Tüm 1.6 Multijet / dCi / Hybrid Taksiler',
  },
  {
    id: 'prt3',
    code: 'PR-103',
    name: 'Debriyaj Baskı Balata & Volan Seti',
    category: 'Fren & Yürüyen',
    stockQty: 6,
    minAlertQty: 8,
    unitCostTl: 9800,
    compatibleModels: 'Fiat Egea 1.6 Multijet / Megane',
  },
  {
    id: 'prt4',
    code: 'PR-104',
    name: '205/55 R16 Ticari Taksi Dört Mevsim Lastik',
    category: 'Lastik & Akü',
    stockQty: 12,
    minAlertQty: 16,
    unitCostTl: 2950,
    compatibleModels: 'Egea / Corolla / Megane',
  },
  {
    id: 'prt5',
    code: 'PR-105',
    name: '72Ah EFB Start-Stop Ticari Taksi Aküsü',
    category: 'Lastik & Akü',
    stockQty: 9,
    minAlertQty: 5,
    unitCostTl: 3800,
    compatibleModels: 'Tüm Filo',
  },
  {
    id: 'prt6',
    code: 'PR-106',
    name: 'Ön Tampon & Sağ Far Komple (Sarı Taksi Folyo Kaplı)',
    category: 'Kaporta & Aydınlatma',
    stockQty: 4,
    minAlertQty: 4,
    unitCostTl: 8400,
    compatibleModels: 'Fiat Egea Sedan / Cross',
  },
];

function deduplicateById<T extends { id: string | number }>(items: T[]): T[] {
  const seen = new Map<string | number, T>();
  for (const item of items) {
    seen.set(item.id, item);
  }
  return Array.from(seen.values());
}

export const useDataStore = create<DataState>((set) => ({
  activePortal: 'operations',
  setActivePortal: (portal) => set({ activePortal: portal }),

  vehicles: [],
  drivers: [],
  shifts: [],
  custodies: [],
  tasks: [],
  serviceCases: [],
  penalties: [],
  plateOwners: [],
  ledgerEntries: [],
  auditLogs: [],
  workshopParts: initialWorkshopParts,

  addVehicle: async (vehicle) => {
    try {
      await dbService.addVehicle(vehicle);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'vehicles');
    }
  },

  updateVehicleStatus: async (id, status) => {
    try {
      await dbService.updateVehicleStatus(id, status);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `vehicles/${id}`);
    }
  },

  enterService: async (input) => {
    try {
      await dbService.enterService(input);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `service_cases/${input.vehicleId}`);
    }
  },

  exitService: async (input) => {
    try {
      await dbService.exitService(input);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `service_cases/${input.serviceCaseId}`);
    }
  },

  completeWorkshopServiceWithFullIntegration: async (input) => {
    try {
      await dbService.completeWorkshopServiceWithFullIntegration(input);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `service_cases/${input.serviceCaseId}`);
    }
  },

  updatePartStock: (partId, deltaQty) =>
    set((state) => ({
      workshopParts: state.workshopParts.map((p) =>
        p.id === partId ? { ...p, stockQty: Math.max(0, p.stockQty + deltaQty) } : p
      ),
    })),

  addDriver: async (driver) => {
    try {
      await dbService.addDriver(driver);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'drivers');
    }
  },

  recordDriverLedgerPayment: async (driverId, amount, paymentKind) => {
    try {
      await dbService.recordDriverLedgerPayment(driverId, amount, paymentKind);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `drivers/${driverId}`);
    }
  },

  offsetDriverDebtFromDeposit: async (driverId) => {
    try {
      await dbService.offsetDriverDebtFromDeposit(driverId);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `drivers/${driverId}`);
    }
  },

  submitPreShiftDepartureRequest: async (input) => {
    try {
      await dbService.submitPreShiftDepartureRequest(input);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'shifts');
    }
  },

  approveShiftDeparture: async (shiftId) => {
    try {
      await dbService.approveShiftDeparture(shiftId);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `shifts/${shiftId}`);
    }
  },

  addShift: async (shift) => {
    try {
      await dbService.addShift(shift);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'shifts');
    }
  },

  closeShift: async (id, collectionDetails) => {
    try {
      await dbService.closeShift(id, collectionDetails);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `shifts/${id}`);
    }
  },

  addCustody: async (custody) => {
    try {
      await dbService.addCustody({
        vehicleId: custody.vehicleId,
        driverId: custody.driverId,
        odometerOut: custody.odometerOut,
        status: 'active',
        handedOverAt: custody.handedOverAt,
        fuelLevelEighths: custody.fuelLevelEighths,
        photosVerified: custody.photosVerified,
        taximeterSlipNo: custody.taximeterSlipNo,
        posDeviceDelivered: custody.posDeviceDelivered,
        contractPinCode: custody.contractPinCode,
        damageNotes: custody.damageNotes,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'custodies');
    }
  },

  returnCustody: async (id, data) => {
    try {
      await dbService.returnCustody(id, data);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `custodies/${id}`);
    }
  },

  addPenaltyIncident: async (input) => {
    try {
      await dbService.addPenaltyIncident(input);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'penalties_incidents');
    }
  },

  disputePenaltyIncident: async (id, disputeReason) => {
    try {
      await dbService.disputePenaltyIncident(id, disputeReason);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `penalties_incidents/${id}`);
    }
  },

  resolvePenaltyDispute: async (penaltyId, resolution, notes, legalCaseNo, lawyerName) => {
    try {
      await dbService.resolvePenaltyDispute(penaltyId, resolution, notes, legalCaseNo, lawyerName);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `penalties_incidents/${penaltyId}`);
    }
  },

  collectPenaltyIncident: async (id) => {
    try {
      await dbService.collectPenaltyIncident(id);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `penalties_incidents/${id}`);
    }
  },

  assignVehicleRoster: async (vehicleId, dayDriverId, nightDriverId, shiftModel) => {
    try {
      await dbService.assignVehicleRoster(vehicleId, dayDriverId, nightDriverId, shiftModel);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `vehicles/${vehicleId}`);
    }
  },

  addPlateOwnerSettlement: async (input) => {
    try {
      await dbService.addPlateOwnerSettlement(input);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'plate_owners');
    }
  },

  settlePlateOwnerPayout: async (ownerId, payoutAmount) => {
    try {
      await dbService.settlePlateOwnerPayout(ownerId, payoutAmount);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `plate_owners/${ownerId}`);
    }
  },

  resolveTask: async (id) => {
    try {
      await dbService.resolveTask(id);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `tasks/${id}`);
    }
  },

  refreshData: async () => {
    subscribeToFirestoreData();
  },
}));

let unsubscribes: (() => void)[] = [];

export const getActiveListenerCount = (): number => unsubscribes.length;

export const subscribeToFirestoreData = () => {
  unsubscribeFromFirestore();

  const unsubVehicles = onSnapshot(
    collection(db, 'vehicles'),
    (snapshot) => {
      const list: Vehicle[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ ...docSnap.data(), id: docSnap.id } as Vehicle);
      });
      useDataStore.setState({ vehicles: deduplicateById(list) });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'vehicles');
    }
  );

  const unsubDrivers = onSnapshot(
    collection(db, 'drivers'),
    (snapshot) => {
      const list: Driver[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ ...docSnap.data(), id: docSnap.id } as Driver);
      });
      useDataStore.setState({ drivers: deduplicateById(list) });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'drivers');
    }
  );

  const unsubShifts = onSnapshot(
    collection(db, 'shifts'),
    (snapshot) => {
      const list: Shift[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ ...docSnap.data(), id: docSnap.id } as Shift);
      });
      useDataStore.setState({ shifts: deduplicateById(list) });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'shifts');
    }
  );

  const unsubCustodies = onSnapshot(
    collection(db, 'custodies'),
    (snapshot) => {
      const list: Custody[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ ...docSnap.data(), id: docSnap.id } as Custody);
      });
      useDataStore.setState({ custodies: deduplicateById(list) });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'custodies');
    }
  );

  const unsubTasks = onSnapshot(
    collection(db, 'tasks'),
    (snapshot) => {
      const list: AppTask[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: Number(docSnap.id) || 1,
          title: data.title || '',
          type: data.type || '',
          priority: data.priority || 'Orta',
          time: data.time || '',
          role: data.role || 'operation',
        });
      });
      useDataStore.setState({ tasks: deduplicateById(list) });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'tasks');
    }
  );

  const unsubServiceCases = onSnapshot(
    collection(db, 'service_cases'),
    (snapshot) => {
      const list: ServiceCase[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ ...docSnap.data(), id: docSnap.id } as ServiceCase);
      });
      useDataStore.setState({ serviceCases: deduplicateById(list) });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'service_cases');
    }
  );

  const unsubPenalties = onSnapshot(
    collection(db, 'penalties_incidents'),
    (snapshot) => {
      const list: PenaltyIncident[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ ...docSnap.data(), id: docSnap.id } as PenaltyIncident);
      });
      useDataStore.setState({ penalties: deduplicateById(list) });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'penalties_incidents');
    }
  );

  const unsubPlateOwners = onSnapshot(
    collection(db, 'plate_owners'),
    (snapshot) => {
      const list: PlateOwnerSettlement[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ ...docSnap.data(), id: docSnap.id } as PlateOwnerSettlement);
      });
      useDataStore.setState({ plateOwners: deduplicateById(list) });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, 'plate_owners');
    }
  );

  const unsubLedgers = onSnapshot(
    collection(db, 'ledger_entries'),
    (snapshot) => {
      const list: LedgerEntryItem[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ ...docSnap.data(), id: docSnap.id } as LedgerEntryItem);
      });
      useDataStore.setState({ ledgerEntries: deduplicateById(list) });
    },
    () => {
      // Optional listener
    }
  );

  const unsubAudits = onSnapshot(
    collection(db, 'audit_logs'),
    (snapshot) => {
      const list: Record<string, unknown>[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ ...docSnap.data(), id: docSnap.id });
      });
      list.sort((a, b) =>
        String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
      );
      useDataStore.setState({ auditLogs: list });
    },
    () => {
      // Optional listener
    }
  );

  unsubscribes = [
    unsubVehicles,
    unsubDrivers,
    unsubShifts,
    unsubCustodies,
    unsubTasks,
    unsubServiceCases,
    unsubPenalties,
    unsubPlateOwners,
    unsubLedgers,
    unsubAudits,
  ];
};

export const unsubscribeFromFirestore = () => {
  unsubscribes.forEach((unsub) => unsub());
  unsubscribes = [];
};

export async function seedInitialDataIfEmpty() {
  try {
    const vehiclesSnap = await getDocs(collection(db, 'vehicles'));
    if (vehiclesSnap.empty) {
      for (const v of initialVehicles) {
        await setDoc(doc(db, 'vehicles', v.id), v);
      }
    }

    const driversSnap = await getDocs(collection(db, 'drivers'));
    if (driversSnap.empty) {
      for (const d of initialDrivers) {
        await setDoc(doc(db, 'drivers', d.id), d);
      }
    }

    const shiftsSnap = await getDocs(collection(db, 'shifts'));
    if (shiftsSnap.empty) {
      for (const s of initialShifts) {
        await setDoc(doc(db, 'shifts', s.id), s);
      }
    }

    const custodiesSnap = await getDocs(collection(db, 'custodies'));
    if (custodiesSnap.empty) {
      for (const c of initialCustodies) {
        await setDoc(doc(db, 'custodies', c.id), c);
      }
    }

    const penaltiesSnap = await getDocs(collection(db, 'penalties_incidents'));
    if (penaltiesSnap.empty) {
      for (const p of initialPenalties) {
        await setDoc(doc(db, 'penalties_incidents', p.id), p);
      }
    }

    const plateOwnersSnap = await getDocs(collection(db, 'plate_owners'));
    if (plateOwnersSnap.empty) {
      for (const po of initialPlateOwners) {
        await setDoc(doc(db, 'plate_owners', po.id), po);
      }
    }

    const tasksSnap = await getDocs(collection(db, 'tasks'));
    if (tasksSnap.empty) {
      for (const t of initialTasks) {
        await setDoc(doc(db, 'tasks', String(t.id)), {
          id: String(t.id),
          title: t.title,
          type: t.type,
          priority: t.priority,
          time: t.time,
          role: t.role,
          tenantId: 't1',
          branchId: 'b1',
        });
      }
    }
  } catch {
    // Seed skipped if rules or connection disallow initial bootstrap
  }
}
