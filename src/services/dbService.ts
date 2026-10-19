import { db, auth } from '../lib/firebase';
import { runTransaction, doc, collection } from 'firebase/firestore';
import { useAuthStore } from '../store/authStore';
import {
  ServiceCase,
  Vehicle,
  Driver,
  Custody,
  PenaltyIncident,
  PenaltyIncidentType,
  PlateOwnerSettlement,
} from '../types';
import { evaluateShiftReturnAnomalies } from './decisionEngine';

const generateId = () => doc(collection(db, '_ids')).id;

export interface ServiceEntryInput {
  vehicleId: string;
  entryOdometer: number;
  reason: string;
  deliveredBy: string;
  provider: string;
  estimatedExitAt: string;
  costBearer: 'company' | 'driver' | 'owner' | 'insurance';
}

export interface ServiceExitInput {
  vehicleId: string;
  serviceCaseId: string;
  exitOdometer: number;
  invoiceDocumentNo: string;
  expenseAmount: number;
  ledgerEntryId: string;
  partsLinked: boolean;
  resultSummary: string;
  vehicleEligible: boolean;
}

export interface ShiftCloseCollectionInput {
  shiftId: string;
  cashCollected: number;
  posCollected: number;
  ibanCollected: number;
  odometerEnd?: number;
  returnFuelEighths?: number;
  returnDamageNotes?: string;
  lateHandoverMinutes?: number;
  earlyBreakdown?: boolean;
  workedHours?: number;
}

export interface PreShiftDepartureRequestInput {
  vehicleId: string;
  driverId: string;
  slot: 'day_12h' | 'night_12h' | 'full_24h';
  type: string;
  accrual: number;
  odometerOut: number;
  fuelLevelEighths: number;
  photosVerifiedCount: number;
  taximeterSlipNo: string;
  posDeviceDelivered: boolean;
  contractPinCode: string;
  newDriverReportedDamage?: boolean;
  newDriverDamageNotes?: string;
  fuelDeficitAdjustmentTl?: number;
  unaccountedKm?: number;
}

export interface PenaltyIncidentInput {
  vehicleId: string;
  driverId: string;
  type: PenaltyIncidentType;
  violationAt: string;
  amount: number;
  downtimeDays?: number;
  dailyYattiRate?: number;
  faultPercentage?: number;
  documentNo: string;
  description: string;
  matchedRecordId?: string;
}

export interface PlateOwnerInput {
  ownerName: string;
  phone: string;
  iban: string;
  plate: string;
  vehicleId: string;
  periodMonth: string;
  monthlyBaseRent: number;
  deductedExpenses: number;
  paidAmount: number;
  notes: string;
}

export function evaluateVehicleCompliance(
  vehicle: Partial<Vehicle>,
  referenceDateIso = new Date().toISOString().split('T')[0]
): string[] {
  const issues: string[] = [];
  if (
    vehicle.nextMaintenanceOdometer &&
    typeof vehicle.lastOdometer === 'number' &&
    vehicle.lastOdometer >= vehicle.nextMaintenanceOdometer
  ) {
    issues.push(
      `10.000 KM periyodik bakım eşiği aşıldı (${vehicle.lastOdometer.toLocaleString('tr-TR')} / ${vehicle.nextMaintenanceOdometer.toLocaleString('tr-TR')} km).`
    );
  }
  if (vehicle.inspectionExpiry && vehicle.inspectionExpiry < referenceDateIso) {
    issues.push(`TÜVTÜRK Muayene süresi dolmuş (${vehicle.inspectionExpiry}).`);
  }
  if (vehicle.insuranceExpiry && vehicle.insuranceExpiry < referenceDateIso) {
    issues.push(`Zorunlu Trafik Sigortası süresi dolmuş (${vehicle.insuranceExpiry}).`);
  }
  if (vehicle.taximeterExpiry && vehicle.taximeterExpiry < referenceDateIso) {
    issues.push(`Taksimetre kalibrasyon/muayene süresi dolmuş (${vehicle.taximeterExpiry}).`);
  }
  return issues;
}

export function evaluateDriverCompliance(
  driver: Partial<Driver>,
  referenceDateIso = new Date().toISOString().split('T')[0]
): string[] {
  const issues: string[] = [];
  if (driver.ibbCardExpiry && driver.ibbCardExpiry < referenceDateIso) {
    issues.push(`İBB Şoför Kartı (TUHİM) süresi dolmuş (${driver.ibbCardExpiry}).`);
  }
  if (driver.licenseExpiry && driver.licenseExpiry < referenceDateIso) {
    issues.push(`Sürücü Belgesi (Ehliyet) süresi dolmuş (${driver.licenseExpiry}).`);
  }
  if (driver.srcExpiry && driver.srcExpiry < referenceDateIso) {
    issues.push(`SRC Mesleki Yeterlilik Belgesi süresi dolmuş (${driver.srcExpiry}).`);
  }
  const currentDebt = Number(driver.currentDebt || 0);
  const maxDebtLimit = Number(driver.maxDebtLimit ?? 5000);
  if (currentDebt > maxDebtLimit) {
    issues.push(
      `Şoför cari borç limiti aşıldı (Borç: ₺${currentDebt.toLocaleString('tr-TR')} / Limit: ₺${maxDebtLimit.toLocaleString('tr-TR')}).`
    );
  }
  if (Number(driver.unpaidFineCount || 0) > 0) {
    issues.push(`Şoförün ödenmemiş ${driver.unpaidFineCount} adet açık ceza/rücu kaydı var.`);
  }
  return issues;
}

export function findResponsibleDriverByTimestamp(
  vehicleId: string,
  violationAt: string,
  shifts: Array<{
    id: string;
    vehicleId: string;
    driverId: string;
    startedAt: string;
    endedAt?: string;
  }>,
  custodies: Array<Custody>
): { driverId: string; matchedRecordId: string; source: 'shift' | 'custody' } | null {
  const targetTime = new Date(violationAt).getTime();
  if (Number.isNaN(targetTime)) return null;

  for (const s of shifts) {
    if (s.vehicleId !== vehicleId) continue;
    const start = new Date(s.startedAt).getTime();
    const end = s.endedAt ? new Date(s.endedAt).getTime() : Date.now() + 86400000;
    if (targetTime >= start && targetTime <= end) {
      return { driverId: s.driverId, matchedRecordId: s.id, source: 'shift' };
    }
  }

  for (const c of custodies) {
    if (c.vehicleId !== vehicleId) continue;
    const start = new Date(c.handedOverAt).getTime();
    const end = c.returnedAt ? new Date(c.returnedAt).getTime() : Date.now() + 86400000;
    if (targetTime >= start && targetTime <= end) {
      return { driverId: c.driverId, matchedRecordId: c.id, source: 'custody' };
    }
  }

  return null;
}

export function calculatePenaltyTotalCharge(input: {
  amount: number;
  downtimeDays?: number;
  dailyYattiRate?: number;
  faultPercentage?: number;
}): number {
  const baseAmount = Math.max(0, Math.round(Number(input.amount || 0)));
  const days = Math.max(0, Math.round(Number(input.downtimeDays || 0)));
  const dailyRate = Math.max(0, Math.round(Number(input.dailyYattiRate || 0)));
  const faultRatio = Math.min(100, Math.max(0, Number(input.faultPercentage ?? 100))) / 100;
  const downtimeCharge = Math.round(days * dailyRate * faultRatio);
  const faultAdjustedDamage = days > 0 ? Math.round(baseAmount * faultRatio) : baseAmount;
  return faultAdjustedDamage + downtimeCharge;
}

const getTrustedActor = () => {
  const user = useAuthStore.getState().user;
  if (!user || !user.id || !user.tenantId || !user.branchId) {
    throw new Error('Yetkisiz işlem: Oturum ve tenant bilgisi doğrulanamadı.');
  }
  return user;
};

const assertTenantAndBranchAccess = (
  actor: { tenantId: string; branchId: string; role: string },
  record: { tenantId?: string; branchId?: string }
) => {
  if (record.tenantId && record.tenantId !== actor.tenantId) {
    throw new Error('Erişim reddedildi: Farklı tenant kaydına işlem yapılamaz.');
  }
  if (record.branchId && record.branchId !== actor.branchId && actor.role !== 'admin') {
    throw new Error('Erişim reddedildi: Yetkisiz şube kaydına işlem yapılamaz.');
  }
};

const buildAuditLog = (
  actor: { id: string; role: string; tenantId: string; branchId: string },
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
  reason = ''
) => {
  const auditId = generateId();
  return {
    auditId,
    tenantId: actor.tenantId,
    branchId: actor.branchId,
    actorUserId: actor.id,
    actorRole: actor.role,
    action,
    entityType,
    entityId,
    before: before ?? null,
    after: after ?? null,
    reason,
    createdAt: new Date().toISOString(),
    correlationId: generateId(),
  };
};

export const dbService = {
  async addVehicle(data: Omit<Vehicle, 'id'>) {
    const actor = getTrustedActor();
    return await runTransaction(db, async (transaction) => {
      const vehicleId = generateId();
      const vehicleRef = doc(db, 'vehicles', vehicleId);
      const newVehicle: Vehicle = {
        ...data,
        id: vehicleId,
        tenantId: actor.tenantId,
        branchId: actor.branchId,
      };
      transaction.set(vehicleRef, newVehicle);

      const auditRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditRef,
        buildAuditLog(actor, 'CREATE_VEHICLE', 'vehicle', vehicleId, null, newVehicle, 'Yeni ticari taksi eklendi')
      );
      return newVehicle;
    });
  },

  async addDriver(data: Omit<Driver, 'id'>) {
    const actor = getTrustedActor();
    return await runTransaction(db, async (transaction) => {
      const driverId = generateId();
      const driverRef = doc(db, 'drivers', driverId);
      const newDriver: Driver = {
        trustScore: 95,
        ...data,
        id: driverId,
        tenantId: actor.tenantId,
        branchId: actor.branchId,
      };
      transaction.set(driverRef, newDriver);

      const auditRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditRef,
        buildAuditLog(actor, 'CREATE_DRIVER', 'driver', driverId, null, newDriver, 'Yeni şoför eklendi')
      );
      return newDriver;
    });
  },

  async addCustody(data: {
    vehicleId: string;
    driverId: string;
    odometerOut: number;
    status: 'active';
    handedOverAt: string;
    fuelLevelEighths?: number;
    photosVerified?: boolean;
    taximeterSlipNo?: string;
    posDeviceDelivered?: boolean;
    contractPinCode?: string;
    damageNotes?: string;
  }) {
    const actor = getTrustedActor();
    return await runTransaction(db, async (transaction) => {
      const todayKey = `${actor.tenantId}_${actor.branchId}_${new Date().toISOString().split('T')[0]}`;
      const dayLockRef = doc(db, 'day_closes', todayKey);
      const dayLockDoc = await transaction.get(dayLockRef);
      if (dayLockDoc.exists() && dayLockDoc.data()?.status === 'closed') {
        throw new Error('Mühürlü güne yeni zimmet kaydı açılamaz.');
      }

      const vehicleRef = doc(db, 'vehicles', data.vehicleId);
      const driverRef = doc(db, 'drivers', data.driverId);

      const vehicleDoc = await transaction.get(vehicleRef);
      const driverDoc = await transaction.get(driverRef);

      if (!vehicleDoc.exists()) throw new Error('Araç bulunamadı.');
      if (!driverDoc.exists()) throw new Error('Şoför bulunamadı.');

      const vehicleData = vehicleDoc.data() as Vehicle;
      const driverData = driverDoc.data() as Driver;

      assertTenantAndBranchAccess(actor, vehicleData);
      assertTenantAndBranchAccess(actor, driverData);

      if (vehicleData.status !== 'available') {
        throw new Error('Araç şu anda zimmet için uygun değil.');
      }
      if (driverData.status !== 'eligible') {
        throw new Error('Şoför şu anda zimmet için uygun durumda değil.');
      }

      const vehicleIssues = evaluateVehicleCompliance(vehicleData);
      if (vehicleIssues.length > 0) {
        throw new Error(`Araç otomatik uyum kilidi nedeniyle zimmete verilemez: ${vehicleIssues[0]}`);
      }

      const driverIssues = evaluateDriverCompliance(driverData);
      if (driverIssues.length > 0) {
        throw new Error(`Şoför otomatik uyum/borç kilidi nedeniyle zimmete çıkamaz: ${driverIssues[0]}`);
      }

      const custodyId = generateId();
      const custodyRef = doc(db, 'custodies', custodyId);
      const newCustody: Custody = {
        ...data,
        id: custodyId,
        tenantId: actor.tenantId,
        branchId: actor.branchId,
      };

      const updatedVehicle = { ...vehicleData, status: 'in_custody' };
      const updatedDriver = { ...driverData, status: 'conditional' };

      transaction.set(custodyRef, newCustody);
      transaction.update(vehicleRef, { status: 'in_custody', idleHours: 0 });
      transaction.update(driverRef, { status: 'conditional' });

      const auditLogRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditLogRef,
        buildAuditLog(actor, 'CREATE_CUSTODY', 'custody', custodyId, null, newCustody, 'Zimmet başlatıldı')
      );

      const auditLogRefV = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditLogRefV,
        buildAuditLog(actor, 'UPDATE_VEHICLE_STATUS', 'vehicle', data.vehicleId, vehicleData, updatedVehicle, 'Zimmet başlatıldı')
      );

      return newCustody;
    });
  },

  async returnCustody(custodyId: string, returnData: { odometerIn: number; otpId?: string; returnFuelEighths?: number; returnDamageNotes?: string }) {
    const actor = getTrustedActor();
    return await runTransaction(db, async (transaction) => {
      const custodyRef = doc(db, 'custodies', custodyId);
      const custodyDoc = await transaction.get(custodyRef);
      if (!custodyDoc.exists()) throw new Error('Zimmet bulunamadı.');

      const custodyData = custodyDoc.data();
      assertTenantAndBranchAccess(actor, custodyData);

      if (custodyData.status !== 'active') {
        throw new Error('Bu zimmet zaten kapatılmış.');
      }

      if (returnData.odometerIn < custodyData.odometerOut) {
        throw new Error('Dönüş kilometresi, çıkış kilometresinden küçük olamaz.');
      }

      if (returnData.otpId) {
        const otpRef = doc(db, 'otps', returnData.otpId);
        const otpDoc = await transaction.get(otpRef);
        if (!otpDoc.exists()) {
          throw new Error('OTP kaydı bulunamadı.');
        }
        const otpData = otpDoc.data();
        if (otpData.status === 'consumed') {
          throw new Error('Bu OTP kodu daha önce kullanılmış.');
        }
        if (otpData.status === 'expired' || new Date(otpData.expiresAt).getTime() < Date.now()) {
          throw new Error('OTP kodunun süresi dolmuş.');
        }
        if (otpData.status !== 'verified') {
          throw new Error('OTP doğrulanmadan zimmet iadesi tamamlanamaz.');
        }
        transaction.update(otpRef, {
          status: 'consumed',
          consumedAt: new Date().toISOString(),
        });
      }

      const vehicleRef = doc(db, 'vehicles', custodyData.vehicleId);
      const driverRef = doc(db, 'drivers', custodyData.driverId);
      const vehicleDoc = await transaction.get(vehicleRef);
      const driverDoc = await transaction.get(driverRef);

      const returnedAt = new Date().toISOString();
      const updatedCustody = {
        ...custodyData,
        odometerIn: returnData.odometerIn,
        returnFuelEighths: returnData.returnFuelEighths ?? 8,
        returnDamageNotes: returnData.returnDamageNotes ?? '',
        returnedAt,
        status: 'returned',
      };

      transaction.update(custodyRef, {
        odometerIn: returnData.odometerIn,
        returnFuelEighths: returnData.returnFuelEighths ?? 8,
        returnDamageNotes: returnData.returnDamageNotes ?? '',
        returnedAt,
        status: 'returned',
      });

      if (vehicleDoc.exists()) {
        const vehicleData = vehicleDoc.data() as Vehicle;
        const nextMaint = vehicleData.nextMaintenanceOdometer || 100000;
        const nextStatus = returnData.odometerIn >= nextMaint ? 'blocked' : 'available';
        const updatedVehicle = {
          ...vehicleData,
          status: nextStatus,
          lastOdometer: returnData.odometerIn,
        };
        transaction.update(vehicleRef, {
          status: nextStatus,
          lastOdometer: returnData.odometerIn,
          lastReturnFuelEighths: returnData.returnFuelEighths ?? 8,
          lastReturnDamageNotes: returnData.returnDamageNotes ?? '',
        });
        const auditLogRefV = doc(collection(db, 'audit_logs'));
        transaction.set(
          auditLogRefV,
          buildAuditLog(actor, 'UPDATE_VEHICLE_STATUS', 'vehicle', custodyData.vehicleId, vehicleData, updatedVehicle, 'Zimmet iade alındı')
        );
      }

      if (driverDoc.exists()) {
        transaction.update(driverRef, { status: 'eligible' });
      }

      const auditLogRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditLogRef,
        buildAuditLog(actor, 'RETURN_CUSTODY', 'custody', custodyId, custodyData, updatedCustody, 'Zimmet iade alındı')
      );

      return updatedCustody;
    });
  },

  /**
   * ŞOFÖR MOBİL EKRANI — 4 Aşamalı Doğrulama ile Çıkış Onayı Talebi Oluşturma
   */
  async submitPreShiftDepartureRequest(input: PreShiftDepartureRequestInput) {
    const actor = getTrustedActor();
    return await runTransaction(db, async (transaction) => {
      const todayKey = `${actor.tenantId}_${actor.branchId}_${new Date().toISOString().split('T')[0]}`;
      const dayLockRef = doc(db, 'day_closes', todayKey);
      const dayLockDoc = await transaction.get(dayLockRef);
      if (dayLockDoc.exists() && dayLockDoc.data()?.status === 'closed') {
        throw new Error('Mühürlü güne yeni vardiya talebi açılamaz.');
      }

      const vehicleRef = doc(db, 'vehicles', input.vehicleId);
      const driverRef = doc(db, 'drivers', input.driverId);
      const vehicleDoc = await transaction.get(vehicleRef);
      const driverDoc = await transaction.get(driverRef);

      if (!vehicleDoc.exists() || !driverDoc.exists()) {
        throw new Error('Araç veya şoför bulunamadı.');
      }

      const vehicleData = vehicleDoc.data() as Vehicle;
      const driverData = driverDoc.data() as Driver;

      const shiftId = generateId();
      const shiftRef = doc(db, 'shifts', shiftId);
      const adjustedAccrual = Math.max(
        0,
        Number(input.accrual) - Number(input.fuelDeficitAdjustmentTl || 0)
      );

      const newShift = {
        id: shiftId,
        vehicleId: input.vehicleId,
        driverId: input.driverId,
        type: input.type,
        slot: input.slot,
        accrual: adjustedAccrual,
        collection: 0,
        cashCollected: 0,
        posCollected: 0,
        ibanCollected: 0,
        arrearsAmount: adjustedAccrual,
        startedAt: new Date().toISOString(),
        status: 'pending_approval' as const,
        odometerStart: input.odometerOut,
        fuelLevelEighths: input.fuelLevelEighths,
        photosVerifiedCount: input.photosVerifiedCount,
        taximeterSlipNo: input.taximeterSlipNo,
        posDeviceDelivered: input.posDeviceDelivered,
        contractPinCode: input.contractPinCode,
        newDriverReportedDamage: Boolean(input.newDriverReportedDamage),
        newDriverDamageNotes: input.newDriverDamageNotes || '',
        fuelDeficitAdjustmentTl: Number(input.fuelDeficitAdjustmentTl || 0),
        unaccountedKm: Number(input.unaccountedKm || 0),
        tenantId: actor.tenantId,
        branchId: actor.branchId,
      };

      transaction.set(shiftRef, newShift);

      const auditRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditRef,
        buildAuditLog(
          actor,
          'REQUEST_SHIFT_APPROVAL',
          'shift',
          shiftId,
          null,
          newShift,
          `${vehicleData.plate} - ${driverData.name} 12-Kapılı doğrulamayı tamamlayıp çıkış onayına gönderdi`
        )
      );

      return newShift;
    });
  },

  /**
   * OPERASYON MERKEZİ — Tek Tıkla Vardiya + Zimmet Çıkış Onayı Verme
   */
  async approveShiftDeparture(shiftId: string) {
    const actor = getTrustedActor();
    return await runTransaction(db, async (transaction) => {
      const shiftRef = doc(db, 'shifts', shiftId);
      const shiftDoc = await transaction.get(shiftRef);
      if (!shiftDoc.exists()) throw new Error('Vardiya talebi bulunamadı.');

      const shiftData = shiftDoc.data();
      assertTenantAndBranchAccess(actor, shiftData);

      if (shiftData.status !== 'pending_approval') {
        throw new Error('Bu vardiya zaten onaylanmış veya tamamlanmış.');
      }

      const vehicleRef = doc(db, 'vehicles', shiftData.vehicleId);
      const driverRef = doc(db, 'drivers', shiftData.driverId);
      const vehicleDoc = await transaction.get(vehicleRef);
      const driverDoc = await transaction.get(driverRef);

      if (!vehicleDoc.exists() || !driverDoc.exists()) {
        throw new Error('Araç veya şoför bulunamadı.');
      }

      const vehicleData = vehicleDoc.data() as Vehicle;
      const approvedAt = new Date().toISOString();
      const custodyId = generateId();
      const custodyRef = doc(db, 'custodies', custodyId);

      const newCustody: Custody = {
        id: custodyId,
        vehicleId: shiftData.vehicleId,
        driverId: shiftData.driverId,
        status: 'active',
        handedOverAt: approvedAt,
        odometerOut: Number(shiftData.odometerStart || vehicleData.lastOdometer),
        fuelLevelEighths: Number(shiftData.fuelLevelEighths || 8),
        photosVerified: true,
        taximeterSlipNo: shiftData.taximeterSlipNo || 'TKS-OK',
        posDeviceDelivered: true,
        contractPinCode: shiftData.contractPinCode || '0000',
        damageNotes: shiftData.newDriverDamageNotes || '',
        tenantId: actor.tenantId,
        branchId: actor.branchId,
      };

      const updatedShift = {
        ...shiftData,
        status: 'active',
        startedAt: approvedAt,
        custodyId,
      };

      transaction.update(shiftRef, {
        status: 'active',
        startedAt: approvedAt,
        custodyId,
      });

      transaction.set(custodyRef, newCustody);

      transaction.update(vehicleRef, {
        status: 'in_shift',
        lastOdometer: Number(shiftData.odometerStart || vehicleData.lastOdometer),
        idleHours: 0,
      });

      const auditRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditRef,
        buildAuditLog(
          actor,
          'APPROVE_SHIFT_DEPARTURE',
          'shift',
          shiftId,
          shiftData,
          updatedShift,
          'Operasyon çıkış onayı verildi: Vardiya ve Zimmet aynı anda aktifleştirildi'
        )
      );

      return updatedShift;
    });
  },

  async addShift(data: {
    vehicleId: string;
    driverId: string;
    type: string;
    slot?: 'day_12h' | 'night_12h' | 'full_24h';
    accrual: number;
    collection: number;
    startedAt: string;
    status: 'pending_approval' | 'active' | 'completed' | 'delayed';
  }) {
    const actor = getTrustedActor();
    return await runTransaction(db, async (transaction) => {
      const todayKey = `${actor.tenantId}_${actor.branchId}_${new Date().toISOString().split('T')[0]}`;
      const dayLockRef = doc(db, 'day_closes', todayKey);
      const dayLockDoc = await transaction.get(dayLockRef);
      if (dayLockDoc.exists() && dayLockDoc.data()?.status === 'closed') {
        throw new Error('Mühürlü güne yeni vardiya açılamaz.');
      }

      const vehicleRef = doc(db, 'vehicles', data.vehicleId);
      const driverRef = doc(db, 'drivers', data.driverId);
      const vehicleDoc = await transaction.get(vehicleRef);
      const driverDoc = await transaction.get(driverRef);

      if (!vehicleDoc.exists() || !driverDoc.exists()) {
        throw new Error('Araç veya şoför bulunamadı.');
      }

      const vehicleData = vehicleDoc.data() as Vehicle;
      const driverData = driverDoc.data() as Driver;

      assertTenantAndBranchAccess(actor, vehicleData);
      assertTenantAndBranchAccess(actor, driverData);

      if (vehicleData.status !== 'available') {
        throw new Error('Araç vardiya için uygun değil.');
      }
      if (driverData.status !== 'eligible') {
        throw new Error('Şoför vardiya için uygun değil.');
      }

      const vehicleIssues = evaluateVehicleCompliance(vehicleData);
      if (vehicleIssues.length > 0) {
        throw new Error(`Araç otomatik uyum/bakım kilidi nedeniyle vardiyaya çıkamaz: ${vehicleIssues[0]}`);
      }

      const driverIssues = evaluateDriverCompliance(driverData);
      if (driverIssues.length > 0) {
        throw new Error(`Şoför otomatik uyum/borç kilidi nedeniyle vardiyaya çıkamaz: ${driverIssues[0]}`);
      }

      const shiftId = generateId();
      const shiftRef = doc(db, 'shifts', shiftId);
      const newShift = {
        ...data,
        id: shiftId,
        odometerStart: vehicleData.lastOdometer,
        cashCollected: 0,
        posCollected: 0,
        ibanCollected: 0,
        arrearsAmount: data.accrual,
        tenantId: actor.tenantId,
        branchId: actor.branchId,
      };

      const nextVehicleStatus = data.status === 'pending_approval' ? vehicleData.status : 'in_shift';
      const updatedVehicle = { ...vehicleData, status: nextVehicleStatus };

      transaction.set(shiftRef, newShift);
      if (data.status !== 'pending_approval') {
        transaction.update(vehicleRef, { status: 'in_shift', idleHours: 0 });
      }

      const auditLogRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditLogRef,
        buildAuditLog(actor, 'START_SHIFT', 'shift', shiftId, null, newShift, 'Vardiya başlatıldı')
      );

      const auditLogRefV = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditLogRefV,
        buildAuditLog(actor, 'UPDATE_VEHICLE_STATUS', 'vehicle', data.vehicleId, vehicleData, updatedVehicle, 'Vardiya başlatıldı')
      );

      return newShift;
    });
  },

  async closeShift(shiftId: string, collectionDetails?: Omit<ShiftCloseCollectionInput, 'shiftId'>) {
    const actor = getTrustedActor();
    return await runTransaction(db, async (transaction) => {
      const shiftRef = doc(db, 'shifts', shiftId);
      const shiftDoc = await transaction.get(shiftRef);
      if (!shiftDoc.exists()) throw new Error('Vardiya bulunamadı.');

      const shiftData = shiftDoc.data();
      assertTenantAndBranchAccess(actor, shiftData);

      if (shiftData.status === 'completed') {
        throw new Error('Vardiya zaten kapalı.');
      }

      const vehicleRef = doc(db, 'vehicles', shiftData.vehicleId);
      const driverRef = doc(db, 'drivers', shiftData.driverId);
      const vehicleDoc = await transaction.get(vehicleRef);
      const driverDoc = await transaction.get(driverRef);

      let custodyDoc = null;
      let custodyRef = null;
      if (shiftData.custodyId) {
        custodyRef = doc(db, 'custodies', shiftData.custodyId);
        custodyDoc = await transaction.get(custodyRef);
      }

      const accrual = Number(shiftData.accrual || 0);
      const cashCollected = collectionDetails
        ? Math.max(0, Math.round(Number(collectionDetails.cashCollected || 0)))
        : accrual;
      const posCollected = collectionDetails
        ? Math.max(0, Math.round(Number(collectionDetails.posCollected || 0)))
        : 0;
      const ibanCollected = collectionDetails
        ? Math.max(0, Math.round(Number(collectionDetails.ibanCollected || 0)))
        : 0;
      const totalCollected = cashCollected + posCollected + ibanCollected;

      const currentOdometer = vehicleDoc.exists() ? Number(vehicleDoc.data().lastOdometer || 0) : 0;
      const odometerStart = Number(shiftData.odometerStart || currentOdometer);
      const odometerEnd =
        collectionDetails?.odometerEnd && collectionDetails.odometerEnd >= odometerStart
          ? Math.round(collectionDetails.odometerEnd)
          : currentOdometer + 180;

      const anomalyEval = evaluateShiftReturnAnomalies({
        slot: shiftData.slot || 'day_12h',
        odometerStart,
        odometerEnd,
        accrualTl: accrual,
        collectedTl: totalCollected,
        lateHandoverMinutes: collectionDetails?.lateHandoverMinutes,
        earlyBreakdown: collectionDetails?.earlyBreakdown,
        workedHours: collectionDetails?.workedHours,
      });

      const arrearsAmount =
        anomalyEval.underpaymentAmountTl + anomalyEval.lateHandoverCompensationTl;

      const endedAt = new Date().toISOString();
      const updatedShift = {
        ...shiftData,
        status: 'completed',
        endedAt,
        collection: totalCollected,
        cashCollected,
        posCollected,
        ibanCollected,
        arrearsAmount,
        odometerEnd,
        returnWarnings: anomalyEval.warnings,
      };

      transaction.update(shiftRef, {
        status: 'completed',
        endedAt,
        collection: totalCollected,
        cashCollected,
        posCollected,
        ibanCollected,
        arrearsAmount,
        odometerEnd,
      });

      if (custodyRef && custodyDoc && custodyDoc.exists() && custodyDoc.data().status === 'active') {
        transaction.update(custodyRef, {
          status: 'returned',
          returnedAt: endedAt,
          odometerIn: odometerEnd,
          returnFuelEighths: collectionDetails?.returnFuelEighths ?? 8,
          returnDamageNotes: collectionDetails?.returnDamageNotes ?? '',
        });
      }

      if (vehicleDoc.exists()) {
        const vData = vehicleDoc.data() as Vehicle;
        const nextStatus =
          vData.nextMaintenanceOdometer && odometerEnd >= vData.nextMaintenanceOdometer
            ? 'blocked'
            : 'available';
        transaction.update(vehicleRef, {
          status: nextStatus,
          lastOdometer: odometerEnd,
          lastReturnFuelEighths: collectionDetails?.returnFuelEighths ?? 8,
          lastReturnDamageNotes: collectionDetails?.returnDamageNotes ?? '',
        });
      }

      if (driverDoc.exists()) {
        const dData = driverDoc.data() as Driver;
        const newDebt = Number(dData.currentDebt || 0) + arrearsAmount;
        const maxLimit = Number(dData.maxDebtLimit ?? 5000);
        const currentTrust = Number(dData.trustScore ?? 92);
        const nextTrust = Math.min(100, Math.max(0, currentTrust + anomalyEval.trustScoreDelta));
        const newDriverStatus = newDebt > maxLimit ? 'suspended' : 'eligible';
        transaction.update(driverRef, {
          currentDebt: newDebt,
          trustScore: nextTrust,
          lastShiftShortfall: arrearsAmount > 0 ? 1 : 0,
          status: newDriverStatus,
        });
      }

      const auditLogRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditLogRef,
        buildAuditLog(
          actor,
          'CLOSE_SHIFT',
          'shift',
          shiftId,
          shiftData,
          updatedShift,
          `Vardiya kapatıldı (Tahsilat: ₺${totalCollected}, Eksik/Gecikme: ₺${arrearsAmount}, KM: ${anomalyEval.drivenKm})`
        )
      );

      return updatedShift;
    });
  },

  async offsetDriverDebtFromDeposit(driverId: string) {
    const actor = getTrustedActor();
    return await runTransaction(db, async (transaction) => {
      const driverRef = doc(db, 'drivers', driverId);
      const driverDoc = await transaction.get(driverRef);
      if (!driverDoc.exists()) throw new Error('Şoför bulunamadı.');

      const driverData = driverDoc.data() as Driver;
      assertTenantAndBranchAccess(actor, driverData);

      const currentDebt = Number(driverData.currentDebt || 0);
      const depositPaid = Number(driverData.depositPaid || 0);
      if (currentDebt <= 0) {
        throw new Error('Şoförün mahsup edilecek cari borcu bulunmuyor.');
      }

      const offsetAmount = Math.min(currentDebt, depositPaid);
      const nextDebt = currentDebt - offsetAmount;
      const nextDeposit = depositPaid - offsetAmount;

      const updatedDriver: Driver = {
        ...driverData,
        currentDebt: nextDebt,
        depositPaid: nextDeposit,
        status: 'suspended',
      };

      transaction.update(driverRef, {
        currentDebt: nextDebt,
        depositPaid: nextDeposit,
        status: 'suspended',
      });

      const auditRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditRef,
        buildAuditLog(
          actor,
          'OFFSET_DEPOSIT_EROSION',
          'driver',
          driverId,
          driverData,
          updatedDriver,
          `Merkezi Karar Beyni: ₺${offsetAmount} cari borç depozitodan mahsup edildi; yeni teminat yatırılana kadar şoför bloke edildi.`
        )
      );

      return updatedDriver;
    });
  },

  async addPenaltyIncident(input: PenaltyIncidentInput) {
    const actor = getTrustedActor();
    if (!input.vehicleId || !input.driverId || !input.documentNo || !input.violationAt) {
      throw new Error('Plaka, sorumlu şoför, tebligat/belge no ve ihlal tarih-saati zorunludur.');
    }

    return await runTransaction(db, async (transaction) => {
      const vehicleRef = doc(db, 'vehicles', input.vehicleId);
      const driverRef = doc(db, 'drivers', input.driverId);
      const vehicleDoc = await transaction.get(vehicleRef);
      const driverDoc = await transaction.get(driverRef);

      if (!vehicleDoc.exists()) throw new Error('Araç bulunamadı.');
      if (!driverDoc.exists()) throw new Error('Sorumlu şoför bulunamadı.');

      const vehicleData = vehicleDoc.data() as Vehicle;
      const driverData = driverDoc.data() as Driver;

      assertTenantAndBranchAccess(actor, vehicleData);
      assertTenantAndBranchAccess(actor, driverData);

      const totalCharge = calculatePenaltyTotalCharge(input);
      const recordId = generateId();
      const recordRef = doc(db, 'penalties_incidents', recordId);

      const newRecord: PenaltyIncident = {
        id: recordId,
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        vehicleId: input.vehicleId,
        plate: vehicleData.plate,
        driverId: input.driverId,
        driverName: driverData.name,
        type: input.type,
        violationAt: input.violationAt,
        amount: Math.max(0, Math.round(Number(input.amount || 0))),
        downtimeDays: Math.max(0, Math.round(Number(input.downtimeDays || 0))),
        dailyYattiRate: Math.max(0, Math.round(Number(input.dailyYattiRate || 0))),
        faultPercentage: Math.min(100, Math.max(0, Math.round(Number(input.faultPercentage ?? 100)))),
        totalCharge,
        documentNo: input.documentNo,
        status: 'pending_collection',
        description: input.description || 'Otomatik tarih-saat eşleşmeli rücu kaydı',
        matchedRecordId: input.matchedRecordId || '',
        createdAt: new Date().toISOString(),
      };

      const faultPct = Number(input.faultPercentage ?? 100);
      const trustDrop = faultPct === 0 ? 0 : input.type === 'accident_damage' ? 15 : 5;
      const nextTrust = Math.max(0, Number(driverData.trustScore ?? 92) - trustDrop);
      const newDebt = Number(driverData.currentDebt || 0) + totalCharge;
      const newFineCount = Number(driverData.unpaidFineCount || 0) + (totalCharge > 0 ? 1 : 0);

      transaction.set(recordRef, newRecord);
      transaction.update(driverRef, {
        currentDebt: newDebt,
        unpaidFineCount: newFineCount,
        trustScore: nextTrust,
        status: totalCharge > 0 ? 'suspended' : driverData.status,
      });

      const auditRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditRef,
        buildAuditLog(
          actor,
          'CREATE_PENALTY',
          'penalty_incident',
          recordId,
          null,
          newRecord,
          `${vehicleData.plate} - ${driverData.name} adına ₺${totalCharge} ceza/rücu işlendi`
        )
      );

      return newRecord;
    });
  },

  async disputePenaltyIncident(
    recordId: string,
    disputeReason: string,
    disputeImageUrl?: string,
    disputeDocumentName?: string
  ) {
    const actor = getTrustedActor();
    return await runTransaction(db, async (transaction) => {
      const recordRef = doc(db, 'penalties_incidents', recordId);
      const recordDoc = await transaction.get(recordRef);
      if (!recordDoc.exists()) throw new Error('Ceza/rücu kaydı bulunamadı.');

      const recordData = recordDoc.data() as PenaltyIncident;
      assertTenantAndBranchAccess(actor, recordData);

      const updated: PenaltyIncident = {
        ...recordData,
        status: 'disputed',
        disputeReason: disputeReason || 'Şoför kanıtlı itiraz bildirdi',
        disputeImageUrl: disputeImageUrl || recordData.disputeImageUrl || '',
        disputeDocumentName: disputeDocumentName || recordData.disputeDocumentName || '',
      };

      transaction.update(recordRef, {
        status: 'disputed',
        disputeReason: disputeReason || 'Şoför kanıtlı itiraz bildirdi',
        disputeImageUrl: disputeImageUrl || recordData.disputeImageUrl || '',
        disputeDocumentName: disputeDocumentName || recordData.disputeDocumentName || '',
      });

      const auditRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditRef,
        buildAuditLog(
          actor,
          'DISPUTE_PENALTY',
          'penalty_incident',
          recordId,
          recordData,
          updated,
          `${disputeReason} ${disputeDocumentName ? `[Belge: ${disputeDocumentName}]` : ''}`
        )
      );

      return updated;
    });
  },

  async collectPenaltyIncident(recordId: string) {
    const actor = getTrustedActor();
    return await runTransaction(db, async (transaction) => {
      const recordRef = doc(db, 'penalties_incidents', recordId);
      const recordDoc = await transaction.get(recordRef);
      if (!recordDoc.exists()) throw new Error('Ceza/rücu kaydı bulunamadı.');

      const recordData = recordDoc.data() as PenaltyIncident;
      assertTenantAndBranchAccess(actor, recordData);

      if (recordData.status === 'collected') {
        throw new Error('Bu rücu kaydı zaten tahsil edilmiş.');
      }

      const driverRef = doc(db, 'drivers', recordData.driverId);
      const driverDoc = await transaction.get(driverRef);

      const collectedAt = new Date().toISOString();
      const updatedRecord: PenaltyIncident = {
        ...recordData,
        status: 'collected',
        collectedAt,
      };

      transaction.update(recordRef, {
        status: 'collected',
        collectedAt,
      });

      if (driverDoc.exists()) {
        const dData = driverDoc.data() as Driver;
        const nextDebt = Math.max(0, Number(dData.currentDebt || 0) - Number(recordData.totalCharge || 0));
        const nextFineCount = Math.max(0, Number(dData.unpaidFineCount || 0) - 1);
        const remainingIssues = evaluateDriverCompliance({
          ...dData,
          currentDebt: nextDebt,
          unpaidFineCount: nextFineCount,
        });
        transaction.update(driverRef, {
          currentDebt: nextDebt,
          unpaidFineCount: nextFineCount,
          status: remainingIssues.length === 0 ? 'eligible' : 'suspended',
        });
      }

      const auditRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditRef,
        buildAuditLog(
          actor,
          'COLLECT_PENALTY',
          'penalty_incident',
          recordId,
          recordData,
          updatedRecord,
          'Ceza/rücu tahsil edildi'
        )
      );

      return updatedRecord;
    });
  },

  async submitDriverPaymentNotification(input: {
    driverId: string;
    amount: number;
    paymentKind: 'debt_payment' | 'deposit_payment';
    paymentMethod: 'Nakit' | 'IBAN / FAST' | 'POS';
    invoiceDocumentNo?: string;
    receiptImageUrl?: string;
    receiptDocumentName?: string;
    description?: string;
  }) {
    const actor = getTrustedActor();
    const cleanAmount = Math.max(0, Math.round(Number(input.amount || 0)));
    if (cleanAmount <= 0) {
      throw new Error('Ödeme bildirim tutarı 0 TL üzerinde olmalıdır.');
    }
    if (input.paymentMethod === 'IBAN / FAST' && !input.receiptImageUrl) {
      throw new Error('İBAN / FAST ödemelerinde kamera veya galeriden dekont fotoğrafı yüklenmesi zorunludur.');
    }

    return await runTransaction(db, async (transaction) => {
      const ledgerId = 'PAY-' + generateId().toUpperCase();
      const ledgerRef = doc(db, 'ledger_entries', ledgerId);

      const newLedgerEntry = {
        id: ledgerId,
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        type: 'collection' as const,
        amount: cleanAmount,
        status: 'pending' as const,
        paymentMethod: input.paymentMethod,
        paymentKind: input.paymentKind,
        receiptImageUrl: input.receiptImageUrl || '',
        receiptDocumentName: input.receiptDocumentName || '',
        relatedDriverId: input.driverId,
        invoiceDocumentNo: input.invoiceDocumentNo || `MAKBUZ-${Date.now().toString().slice(-5)}`,
        description:
          input.description ||
          `${input.paymentMethod} ile ${
            input.paymentKind === 'debt_payment' ? 'Yevmiye / Cari Borç' : 'Teminat Tamamlama'
          } Bildirimi (Gişe Onayı Bekliyor)`,
        createdAt: new Date().toISOString(),
      };

      transaction.set(ledgerRef, newLedgerEntry);

      const auditRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditRef,
        buildAuditLog(
          actor,
          'SUBMIT_DRIVER_PAYMENT_RECEIPT',
          'ledger_entry',
          ledgerId,
          null,
          newLedgerEntry,
          `Şoför ${input.paymentMethod} ödeme bildirimi gönderdi: ₺${cleanAmount} (${
            input.paymentMethod === 'IBAN / FAST' ? 'Dekont Fotoğraflı' : 'Nakit Teslim Bildirimi'
          })`
        )
      );

      return newLedgerEntry;
    });
  },

  async verifyDriverPaymentNotification(
    ledgerId: string,
    decision: 'approve' | 'reject',
    note?: string
  ) {
    const actor = getTrustedActor();
    if (!['admin', 'finance', 'operation'].includes(actor.role)) {
      throw new Error('Ödeme ve dekont onaylama yetkisi yalnızca Gişe/Finans ve Sistem Yöneticisine aittir.');
    }

    return await runTransaction(db, async (transaction) => {
      const ledgerRef = doc(db, 'ledger_entries', ledgerId);
      const ledgerDoc = await transaction.get(ledgerRef);
      if (!ledgerDoc.exists()) throw new Error('Ödeme bildirimi bulunamadı.');

      const ledgerData = ledgerDoc.data();
      if (ledgerData.status !== 'pending') {
        throw new Error('Bu ödeme bildirimi zaten sonuçlandırılmış.');
      }

      const driverId = ledgerData.relatedDriverId;
      let driverDoc = null;
      let driverRef = null;
      if (driverId) {
        driverRef = doc(db, 'drivers', driverId);
        driverDoc = await transaction.get(driverRef);
      }

      const settledAt = new Date().toISOString();
      const nextStatus = decision === 'approve' ? 'settled' : 'rejected';
      const updatedDescription = `${ledgerData.description || ''} — [${
        decision === 'approve' ? 'GİŞE ONAYLADI' : 'REDDEDİLDİ'
      }${note ? `: ${note}` : ''}]`;

      transaction.update(ledgerRef, {
        status: nextStatus,
        settledAt,
        description: updatedDescription,
      });

      if (decision === 'approve' && driverRef && driverDoc && driverDoc.exists()) {
        const driverData = driverDoc.data() as Driver;
        const cleanAmount = Number(ledgerData.amount || 0);
        const paymentKind = ledgerData.paymentKind || 'debt_payment';

        const nextDebt =
          paymentKind === 'debt_payment'
            ? Math.max(0, Number(driverData.currentDebt || 0) - cleanAmount)
            : Number(driverData.currentDebt || 0);
        const nextDeposit =
          paymentKind === 'deposit_payment'
            ? Number(driverData.depositPaid || 0) + cleanAmount
            : Number(driverData.depositPaid || 0);

        const remainingIssues = evaluateDriverCompliance({
          ...driverData,
          currentDebt: nextDebt,
        });
        const nextDriverStatus = remainingIssues.length === 0 ? 'eligible' : driverData.status;

        transaction.update(driverRef, {
          currentDebt: nextDebt,
          depositPaid: nextDeposit,
          lastShiftShortfall: nextDebt === 0 ? 0 : driverData.lastShiftShortfall ?? 0,
          status: nextDriverStatus,
        });
      }

      const auditRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditRef,
        buildAuditLog(
          actor,
          decision === 'approve' ? 'APPROVE_PAYMENT_RECEIPT' : 'REJECT_PAYMENT_RECEIPT',
          'ledger_entry',
          ledgerId,
          ledgerData,
          { ...ledgerData, status: nextStatus, settledAt },
          `Gişe/Finans ödeme bildirimini ${decision === 'approve' ? 'onayladı ve cariden düştü' : 'reddetti'}: ₺${ledgerData.amount}`
        )
      );
    });
  },

  async recordDriverLedgerPayment(
    driverId: string,
    amount: number,
    paymentKind: 'debt_payment' | 'deposit_payment'
  ) {
    const actor = getTrustedActor();
    const cleanAmount = Math.max(0, Math.round(Number(amount || 0)));
    if (cleanAmount <= 0) {
      throw new Error('Tahsilat tutarı 0 TL üzerinde olmalıdır.');
    }

    return await runTransaction(db, async (transaction) => {
      const driverRef = doc(db, 'drivers', driverId);
      const driverDoc = await transaction.get(driverRef);
      if (!driverDoc.exists()) throw new Error('Şoför bulunamadı.');

      const driverData = driverDoc.data() as Driver;
      assertTenantAndBranchAccess(actor, driverData);

      const nextDebt =
        paymentKind === 'debt_payment'
          ? Math.max(0, Number(driverData.currentDebt || 0) - cleanAmount)
          : Number(driverData.currentDebt || 0);
      const nextDeposit =
        paymentKind === 'deposit_payment'
          ? Number(driverData.depositPaid || 0) + cleanAmount
          : Number(driverData.depositPaid || 0);

      const remainingIssues = evaluateDriverCompliance({
        ...driverData,
        currentDebt: nextDebt,
      });
      const nextStatus = remainingIssues.length === 0 ? 'eligible' : driverData.status;

      const updatedDriver: Driver = {
        ...driverData,
        currentDebt: nextDebt,
        depositPaid: nextDeposit,
        lastShiftShortfall: nextDebt === 0 ? 0 : driverData.lastShiftShortfall,
        status: nextStatus,
      };

      transaction.update(driverRef, {
        currentDebt: nextDebt,
        depositPaid: nextDeposit,
        lastShiftShortfall: nextDebt === 0 ? 0 : driverData.lastShiftShortfall ?? 0,
        status: nextStatus,
      });

      const ledgerId = 'CSH-' + generateId().toUpperCase();
      const ledgerRef = doc(db, 'ledger_entries', ledgerId);
      transaction.set(ledgerRef, {
        id: ledgerId,
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        type: 'collection',
        amount: cleanAmount,
        status: 'settled',
        paymentMethod: 'Nakit',
        paymentKind,
        relatedDriverId: driverId,
        invoiceDocumentNo: `GISE-${Date.now().toString().slice(-5)}`,
        description: `Gişe Doğrudan Tahsilat (${driverData.name}) — ${
          paymentKind === 'debt_payment' ? 'Cari Borç' : 'Teminat'
        }`,
        createdAt: new Date().toISOString(),
        settledAt: new Date().toISOString(),
      });

      const auditRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditRef,
        buildAuditLog(
          actor,
          'DRIVER_LEDGER_PAYMENT',
          'driver',
          driverId,
          driverData,
          updatedDriver,
          `${paymentKind === 'debt_payment' ? 'Cari borç tahsilatı' : 'Güvence depozitosu tahsilatı'}: ₺${cleanAmount}`
        )
      );

      return updatedDriver;
    });
  },

  async addPlateOwnerSettlement(input: PlateOwnerInput) {
    const actor = getTrustedActor();
    if (!input.ownerName || !input.plate || !input.iban) {
      throw new Error('Plaka sahibi adı, plaka ve IBAN zorunludur.');
    }

    return await runTransaction(db, async (transaction) => {
      const id = generateId();
      const ref = doc(db, 'plate_owners', id);
      const monthlyBaseRent = Math.max(0, Math.round(Number(input.monthlyBaseRent || 0)));
      const deductedExpenses = Math.max(0, Math.round(Number(input.deductedExpenses || 0)));
      const paidAmount = Math.max(0, Math.round(Number(input.paidAmount || 0)));
      const netPayable = Math.max(0, monthlyBaseRent - deductedExpenses);

      const record: PlateOwnerSettlement = {
        id,
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        ownerName: input.ownerName,
        phone: input.phone,
        iban: input.iban,
        plate: input.plate.toUpperCase(),
        vehicleId: input.vehicleId || 'v1',
        periodMonth: input.periodMonth || '2026-10',
        monthlyBaseRent,
        deductedExpenses,
        paidAmount,
        status: paidAmount >= netPayable ? 'settled' : 'open',
        notes: input.notes || 'Aylık plaka kira hakedişi',
        updatedAt: new Date().toISOString(),
      };

      transaction.set(ref, record);

      const auditRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditRef,
        buildAuditLog(actor, 'CREATE_PLATE_OWNER', 'plate_owner', id, null, record, 'Plaka sahibi hakediş kaydı oluşturuldu')
      );

      return record;
    });
  },

  async settlePlateOwnerPayout(ownerId: string, payoutAmount: number) {
    const actor = getTrustedActor();
    const cleanPayout = Math.max(0, Math.round(Number(payoutAmount || 0)));
    if (cleanPayout <= 0) {
      throw new Error('Ödeme tutarı 0 TL üzerinde olmalıdır.');
    }

    return await runTransaction(db, async (transaction) => {
      const ref = doc(db, 'plate_owners', ownerId);
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error('Plaka sahibi hakediş kaydı bulunamadı.');

      const data = snap.data() as PlateOwnerSettlement;
      assertTenantAndBranchAccess(actor, data);

      const newPaidAmount = Number(data.paidAmount || 0) + cleanPayout;
      const netTarget = Math.max(0, Number(data.monthlyBaseRent || 0) - Number(data.deductedExpenses || 0));
      const newStatus = newPaidAmount >= netTarget ? 'settled' : 'open';
      const updatedAt = new Date().toISOString();

      const updated: PlateOwnerSettlement = {
        ...data,
        paidAmount: newPaidAmount,
        status: newStatus,
        updatedAt,
      };

      transaction.update(ref, {
        paidAmount: newPaidAmount,
        status: newStatus,
        updatedAt,
      });

      const auditRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditRef,
        buildAuditLog(
          actor,
          'SETTLE_PLATE_OWNER',
          'plate_owner',
          ownerId,
          data,
          updated,
          `Plaka sahibine ₺${cleanPayout} hakediş ödemesi yapıldı`
        )
      );

      return updated;
    });
  },

  async enterService(input: ServiceEntryInput) {
    const actor = getTrustedActor();
    if (!input.reason || !input.deliveredBy || !input.provider || !input.estimatedExitAt) {
      throw new Error('Servis nedeni, teslim eden, servis sağlayıcı ve tahmini çıkış alanları zorunludur.');
    }

    return await runTransaction(db, async (transaction) => {
      const vehicleRef = doc(db, 'vehicles', input.vehicleId);
      const vehicleDoc = await transaction.get(vehicleRef);
      if (!vehicleDoc.exists()) throw new Error('Araç bulunamadı.');

      const vehicleData = vehicleDoc.data();
      assertTenantAndBranchAccess(actor, vehicleData);

      const isEmergencyFieldBreakdown = input.reason.includes('[SAHA');
      if (
        !isEmergencyFieldBreakdown &&
        (vehicleData.status === 'in_custody' || vehicleData.status === 'in_shift')
      ) {
        throw new Error('Araç aktif zimmette veya vardiyada olduğu için servise alınamaz.');
      }
      if (vehicleData.status === 'maintenance') {
        throw new Error('Araç zaten serviste.');
      }
      if (input.entryOdometer < (vehicleData.lastOdometer || 0)) {
        throw new Error('Servis giriş kilometresi son kilometreden küçük olamaz.');
      }

      const caseId = generateId();
      const serviceCaseRef = doc(db, 'service_cases', caseId);
      const serviceCase: ServiceCase = {
        id: caseId,
        vehicleId: input.vehicleId,
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        status: 'open',
        entryOdometer: input.entryOdometer,
        reason: input.reason,
        deliveredBy: input.deliveredBy,
        provider: input.provider,
        estimatedExitAt: input.estimatedExitAt,
        costBearer: input.costBearer,
        createdAt: new Date().toISOString(),
      };

      const updatedVehicle = {
        ...vehicleData,
        status: 'maintenance',
        lastOdometer: input.entryOdometer,
        activeServiceCaseId: caseId,
      };

      transaction.set(serviceCaseRef, serviceCase);
      transaction.update(vehicleRef, {
        status: 'maintenance',
        lastOdometer: input.entryOdometer,
        activeServiceCaseId: caseId,
      });

      const auditCaseRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditCaseRef,
        buildAuditLog(actor, 'ENTER_SERVICE', 'service_case', caseId, null, serviceCase, input.reason)
      );

      const auditVehicleRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditVehicleRef,
        buildAuditLog(actor, 'UPDATE_VEHICLE_STATUS', 'vehicle', input.vehicleId, vehicleData, updatedVehicle, 'Araç servise alındı')
      );

      return serviceCase;
    });
  },

  async exitService(input: ServiceExitInput) {
    const actor = getTrustedActor();
    if (!input.invoiceDocumentNo || !input.ledgerEntryId || !input.resultSummary) {
      throw new Error('Fatura/belge no, cari kayıt no ve servis sonucu tamamlanmadan araç servisten çıkarılamaz.');
    }
    if (!input.partsLinked) {
      throw new Error('Parça/depo bağlantıları doğrulanmadan araç servisten çıkarılamaz.');
    }
    if (!input.vehicleEligible) {
      throw new Error('Araç uygunluk kontrolü onaylanmadan araç müsait duruma alınamaz.');
    }
    if (input.expenseAmount < 0) {
      throw new Error('Servis masraf tutarı geçersiz.');
    }

    return await runTransaction(db, async (transaction) => {
      const vehicleRef = doc(db, 'vehicles', input.vehicleId);
      const caseRef = doc(db, 'service_cases', input.serviceCaseId);

      const vehicleDoc = await transaction.get(vehicleRef);
      const caseDoc = await transaction.get(caseRef);

      if (!vehicleDoc.exists()) throw new Error('Araç bulunamadı.');
      if (!caseDoc.exists()) throw new Error('Açık servis dosyası bulunamadı.');

      const vehicleData = vehicleDoc.data();
      const caseData = caseDoc.data() as ServiceCase;

      assertTenantAndBranchAccess(actor, vehicleData);
      assertTenantAndBranchAccess(actor, caseData);

      if (caseData.status !== 'open') {
        throw new Error('Servis dosyası zaten kapatılmış.');
      }
      if (input.exitOdometer < caseData.entryOdometer) {
        throw new Error('Servis çıkış kilometresi giriş kilometresinden küçük olamaz.');
      }

      const closedAt = new Date().toISOString();
      const updatedCase: ServiceCase = {
        ...caseData,
        status: 'closed',
        exitOdometer: input.exitOdometer,
        invoiceDocumentNo: input.invoiceDocumentNo,
        expenseAmount: input.expenseAmount,
        ledgerEntryId: input.ledgerEntryId,
        partsLinked: input.partsLinked,
        resultSummary: input.resultSummary,
        vehicleEligible: input.vehicleEligible,
        closedAt,
      };

      const nextMaintenanceOdometer = input.exitOdometer + 10000;
      const updatedVehicle = {
        ...vehicleData,
        status: 'available',
        lastOdometer: input.exitOdometer,
        nextMaintenanceOdometer,
        activeServiceCaseId: null,
      };

      transaction.update(caseRef, {
        status: 'closed',
        exitOdometer: input.exitOdometer,
        invoiceDocumentNo: input.invoiceDocumentNo,
        expenseAmount: input.expenseAmount,
        ledgerEntryId: input.ledgerEntryId,
        partsLinked: input.partsLinked,
        resultSummary: input.resultSummary,
        vehicleEligible: input.vehicleEligible,
        closedAt,
      });

      transaction.update(vehicleRef, {
        status: 'available',
        lastOdometer: input.exitOdometer,
        nextMaintenanceOdometer,
        activeServiceCaseId: null,
      });

      const auditCaseRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditCaseRef,
        buildAuditLog(actor, 'EXIT_SERVICE', 'service_case', input.serviceCaseId, caseData, updatedCase, input.resultSummary)
      );

      const auditVehicleRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditVehicleRef,
        buildAuditLog(actor, 'UPDATE_VEHICLE_STATUS', 'vehicle', input.vehicleId, vehicleData, updatedVehicle, 'Araç servisten çıkarıldı (+10.000 km bakım sayacı yenilendi)')
      );

      return updatedCase;
    });
  },

  async completeWorkshopServiceWithFullIntegration(input: {
    serviceCaseId: string;
    vehicleId: string;
    exitOdometer: number;
    invoiceDocumentNo: string;
    expenseAmount: number;
    resultSummary: string;
    partsUsedSummary?: string;
    costBearer: 'company' | 'driver' | 'owner' | 'insurance';
    responsibleDriverId?: string;
    faultPercentage?: number;
    downtimeDays?: number;
    dailyYattiRate?: number;
    insuranceClaimNo?: string;
    expertName?: string;
    insurancePayoutTl?: number;
    ownerSettlementId?: string;
  }) {
    const actor = getTrustedActor();
    if (!input.invoiceDocumentNo || !input.resultSummary) {
      throw new Error('Fatura numarası ve yapılan işlem özeti zorunludur.');
    }

    return await runTransaction(db, async (transaction) => {
      const vehicleRef = doc(db, 'vehicles', input.vehicleId);
      const caseRef = doc(db, 'service_cases', input.serviceCaseId);

      const vehicleDoc = await transaction.get(vehicleRef);
      const caseDoc = await transaction.get(caseRef);

      if (!vehicleDoc.exists()) throw new Error('Araç bulunamadı.');
      if (!caseDoc.exists()) throw new Error('Açık sanayi iş emri bulunamadı.');

      const vehicleData = vehicleDoc.data() as Vehicle;
      const caseData = caseDoc.data() as ServiceCase;

      let driverRef = null;
      let driverData: Driver | null = null;
      if (input.responsibleDriverId) {
        driverRef = doc(db, 'drivers', input.responsibleDriverId);
        const driverSnap = await transaction.get(driverRef);
        if (driverSnap.exists()) {
          driverData = driverSnap.data() as Driver;
        }
      }

      let ownerRef = null;
      let ownerData: PlateOwnerSettlement | null = null;
      if (input.ownerSettlementId) {
        ownerRef = doc(db, 'plate_owners', input.ownerSettlementId);
        const ownerSnap = await transaction.get(ownerRef);
        if (ownerSnap.exists()) {
          ownerData = ownerSnap.data() as PlateOwnerSettlement;
        }
      }

      const closedAt = new Date().toISOString();
      const ledgerId = 'LED-' + generateId().toUpperCase();
      const cleanExpense = Math.max(0, Math.round(Number(input.expenseAmount || 0)));
      const downtimeDays = Math.max(0, Math.round(Number(input.downtimeDays || 0)));
      const dailyYattiRate = Math.max(0, Math.round(Number(input.dailyYattiRate || vehicleData.dailyDayRate || 2400)));
      const faultPct = Math.min(100, Math.max(0, Math.round(Number(input.faultPercentage ?? 0))));
      const exitKm = Math.max(caseData.entryOdometer, Number(input.exitOdometer || caseData.entryOdometer));

      const updatedCase: ServiceCase = {
        ...caseData,
        status: 'closed',
        exitOdometer: exitKm,
        invoiceDocumentNo: input.invoiceDocumentNo,
        expenseAmount: cleanExpense,
        ledgerEntryId: ledgerId,
        partsLinked: true,
        partsUsedSummary: input.partsUsedSummary || 'Stoktan düşüldü',
        resultSummary: input.resultSummary,
        vehicleEligible: true,
        costBearer: input.costBearer,
        responsibleDriverId: input.responsibleDriverId,
        faultPercentage: faultPct,
        downtimeDays,
        dailyYattiRate,
        insuranceClaimNo: input.insuranceClaimNo,
        expertName: input.expertName,
        insurancePayoutTl: input.insurancePayoutTl,
        closedAt,
      };

      const nextMaintenanceOdometer = exitKm + 10000;
      transaction.update(caseRef, { ...updatedCase });
      transaction.update(vehicleRef, {
        status: 'available',
        lastOdometer: exitKm,
        nextMaintenanceOdometer,
        activeServiceCaseId: null,
        idleHours: 0,
      });

      // 1. Record Central Ledger Expense
      if (cleanExpense > 0) {
        const ledgerRef = doc(db, 'ledger_entries', ledgerId);
        transaction.set(ledgerRef, {
          id: ledgerId,
          tenantId: actor.tenantId,
          branchId: actor.branchId,
          type: 'expense',
          amount: cleanExpense,
          status: 'settled',
          paymentMethod: 'IBAN / FAST',
          relatedServiceCaseId: input.serviceCaseId,
          invoiceDocumentNo: input.invoiceDocumentNo,
          description: `${vehicleData.plate} Sanayi/Bakım Faturası (${input.resultSummary})`,
          createdAt: closedAt,
          settledAt: closedAt,
        });
      }

      // 2. If Driver has fault or costBearer === 'driver', charge driver + yatti parası
      if (driverRef && driverData && (input.costBearer === 'driver' || faultPct > 0)) {
        const effectivePct = input.costBearer === 'driver' && faultPct === 0 ? 100 : faultPct;
        const yattiTotal = downtimeDays * dailyYattiRate;
        const driverCharge = Math.round(((cleanExpense + yattiTotal) * effectivePct) / 100);

        if (driverCharge > 0) {
          const penId = generateId();
          const penRef = doc(db, 'penalties_incidents', penId);
          const penDoc: PenaltyIncident = {
            id: penId,
            tenantId: actor.tenantId,
            branchId: actor.branchId,
            vehicleId: vehicleData.id,
            plate: vehicleData.plate,
            driverId: driverData.id,
            driverName: driverData.name,
            type: 'accident_damage',
            violationAt: closedAt,
            amount: cleanExpense,
            downtimeDays,
            dailyYattiRate,
            faultPercentage: effectivePct,
            totalCharge: driverCharge,
            documentNo: input.invoiceDocumentNo,
            status: 'pending_collection',
            description: `Sanayi Hasar & ${downtimeDays} Gün Yattı Rücusu (%${effectivePct} Kusur): ${input.resultSummary}`,
            createdAt: closedAt,
          };
          transaction.set(penRef, penDoc);

          const newDebt = Number(driverData.currentDebt || 0) + driverCharge;
          const newTrust = Math.max(0, Number(driverData.trustScore ?? 90) - 15);
          const newFaultCount = Number(driverData.lifetimeFaultyAccidents || 0) + 1;
          const shouldBlock = newDebt > Number(driverData.maxDebtLimit ?? 5000);

          transaction.update(driverRef, {
            currentDebt: newDebt,
            trustScore: newTrust,
            lifetimeFaultyAccidents: newFaultCount,
            status: shouldBlock ? 'suspended' : driverData.status,
          });
        }
      }

      // 3. If Plate Owner bears cost, deduct from PlateOwnerSettlement
      if (ownerRef && ownerData && input.costBearer === 'owner' && cleanExpense > 0) {
        const newDeducted = Number(ownerData.deductedExpenses || 0) + cleanExpense;
        transaction.update(ownerRef, {
          deductedExpenses: newDeducted,
          notes: `${ownerData.notes || ''} | Sanayi Mahsup: ₺${cleanExpense} (${input.invoiceDocumentNo})`.trim(),
          updatedAt: closedAt,
        });
      }

      const auditRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditRef,
        buildAuditLog(
          actor,
          'COMPLETE_WORKSHOP_INTEGRATED',
          'service_case',
          input.serviceCaseId,
          caseData,
          updatedCase,
          `${vehicleData.plate} sanayi çıkışı, kasa gideri ve yattı/mahsup entegrasyonu tamamlandı`
        )
      );

      return updatedCase;
    });
  },

  async resolvePenaltyDispute(
    penaltyId: string,
    resolution: 'accept_cancel' | 'reject_confirm' | 'escalate_legal',
    notes: string,
    legalCaseNo?: string,
    lawyerName?: string
  ) {
    const actor = getTrustedActor();
    return await runTransaction(db, async (transaction) => {
      const penRef = doc(db, 'penalties_incidents', penaltyId);
      const penSnap = await transaction.get(penRef);
      if (!penSnap.exists()) throw new Error('Ceza veya hasar kaydı bulunamadı.');

      const penData = penSnap.data() as PenaltyIncident;
      const driverRef = doc(db, 'drivers', penData.driverId);
      const driverSnap = await transaction.get(driverRef);

      const nowIso = new Date().toISOString();
      let newStatus: PenaltyIncident['status'] = penData.status;

      if (resolution === 'accept_cancel') {
        newStatus = 'cancelled';
        if (driverSnap.exists()) {
          const d = driverSnap.data() as Driver;
          const updatedDebt = Math.max(0, Number(d.currentDebt || 0) - Number(penData.totalCharge || 0));
          const updatedTrust = Math.min(100, Number(d.trustScore ?? 85) + 5);
          const updatedFines = Math.max(0, Number(d.unpaidFineCount || 0) - 1);
          const nextDriver: Driver = {
            ...d,
            currentDebt: updatedDebt,
            trustScore: updatedTrust,
            unpaidFineCount: updatedFines,
          };
          const issues = evaluateDriverCompliance(nextDriver);
          transaction.update(driverRef, {
            currentDebt: updatedDebt,
            trustScore: updatedTrust,
            unpaidFineCount: updatedFines,
            status: issues.length === 0 ? 'eligible' : d.status,
          });
        }
      } else if (resolution === 'reject_confirm') {
        newStatus = 'pending_collection';
      } else if (resolution === 'escalate_legal') {
        newStatus = 'legal_collection';
        if (driverSnap.exists()) {
          transaction.update(driverRef, {
            status: 'suspended',
          });
        }
      }

      const updatedPen: PenaltyIncident = {
        ...penData,
        status: newStatus,
        resolutionNotes: notes || 'Operasyon/Hukuk kararı işlendi',
        legalCaseNo: legalCaseNo || penData.legalCaseNo,
        lawyerName: lawyerName || penData.lawyerName,
      };

      transaction.update(penRef, {
        status: newStatus,
        resolutionNotes: updatedPen.resolutionNotes,
        legalCaseNo: updatedPen.legalCaseNo || '',
        lawyerName: updatedPen.lawyerName || '',
      });

      const auditRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditRef,
        buildAuditLog(
          actor,
          'RESOLVE_PENALTY_DISPUTE',
          'penalty',
          penaltyId,
          penData,
          updatedPen,
          `İtiraz/Hukuk Kararı (${resolution}): ${notes}`
        )
      );

      return updatedPen;
    });
  },

  async assignVehicleRoster(
    vehicleId: string,
    dayDriverId: string,
    nightDriverId: string,
    shiftModel: '2x12_double' | '24h_single'
  ) {
    const actor = getTrustedActor();
    return await runTransaction(db, async (transaction) => {
      const vRef = doc(db, 'vehicles', vehicleId);
      const vSnap = await transaction.get(vRef);
      if (!vSnap.exists()) throw new Error('Plaka bulunamadı.');

      const vData = vSnap.data() as Vehicle;
      const updated: Vehicle = {
        ...vData,
        assignedDayDriverId: dayDriverId,
        assignedNightDriverId: shiftModel === '2x12_double' ? nightDriverId : '',
        shiftModel,
      };

      transaction.update(vRef, {
        assignedDayDriverId: dayDriverId,
        assignedNightDriverId: shiftModel === '2x12_double' ? nightDriverId : '',
        shiftModel,
      });

      const auditRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditRef,
        buildAuditLog(
          actor,
          'ASSIGN_VEHICLE_ROSTER',
          'vehicle',
          vehicleId,
          vData,
          updated,
          `${vData.plate} nöbet kadrosu güncellendi (${shiftModel})`
        )
      );

      return updated;
    });
  },

  async updateVehicleStatus(vehicleId: string, status: string, reason = '') {
    const actor = getTrustedActor();
    return await runTransaction(db, async (transaction) => {
      const vehicleRef = doc(db, 'vehicles', vehicleId);
      const vehicleDoc = await transaction.get(vehicleRef);
      if (!vehicleDoc.exists()) throw new Error('Araç bulunamadı.');

      const vehicleData = vehicleDoc.data();
      assertTenantAndBranchAccess(actor, vehicleData);

      if (status === 'maintenance' && (vehicleData.status === 'in_custody' || vehicleData.status === 'in_shift')) {
        throw new Error('Araç zimmette veya vardiyada olduğu için servise alınamaz.');
      }

      const updatedVehicle = { ...vehicleData, status };
      transaction.update(vehicleRef, { status });

      const auditLogRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditLogRef,
        buildAuditLog(actor, 'UPDATE_VEHICLE_STATUS', 'vehicle', vehicleId, vehicleData, updatedVehicle, reason)
      );

      return updatedVehicle;
    });
  },

  async resolveTask(taskId: number) {
    const actor = getTrustedActor();
    return await runTransaction(db, async (transaction) => {
      const taskRef = doc(db, 'tasks', String(taskId));
      const taskDoc = await transaction.get(taskRef);
      if (!taskDoc.exists()) throw new Error('Görev bulunamadı.');

      const taskData = taskDoc.data();
      transaction.delete(taskRef);

      const auditLogRef = doc(collection(db, 'audit_logs'));
      transaction.set(
        auditLogRef,
        buildAuditLog(actor, 'RESOLVE_TASK', 'task', String(taskId), taskData, null, 'Görev tamamlandı')
      );
    });
  },

  async handleDayClose() {
    getTrustedActor();
    if (!auth.currentUser) {
      throw new Error('Firebase Auth oturumu doğrulanamadı.');
    }

    const token = await auth.currentUser.getIdToken();

    const response = await fetch('/api/day-close', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await response.json();
    if (!response.ok) {
      if (result.blockers && result.blockers.length > 0) {
        throw new Error(
          result.blockers
            .map((b: { blockerCode: string; message: string; blockerCount: number }) => `[${b.blockerCode}] ${b.message} (${b.blockerCount})`)
            .join('\n')
        );
      }
      throw new Error(result.error || 'Gün kapanışı sunucu tarafından reddedildi.');
    }

    return result;
  },
};
