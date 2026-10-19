export type Role = 'admin' | 'operation' | 'finance' | 'workshop' | 'legal' | 'driver' | 'owner';

export type WorkspacePortalMode = 'operations' | 'driver_mobile' | 'plate_owner';

export interface User {
  id: string;
  username?: string;
  name: string;
  role: Role;
  permissions?: string[];
  linkedDriverId?: string;
  linkedOwnerId?: string;
  status?: 'active' | 'suspended';
  tenantId: string;
  branchId: string;
}

export interface SystemAccount {
  id: string;
  username: string;
  password: string;
  name: string;
  role: Role;
  permissions: string[];
  linkedDriverId?: string;
  linkedOwnerId?: string;
  status: 'active' | 'suspended';
  departmentSummary: string;
  tenantId: string;
  branchId: string;
  createdAt: string;
}

export type ShiftModel = '2x12_double' | '24h_single';
export type OwnershipType = 'owned' | 'leased_plate';

export interface Vehicle {
  id: string;
  plate: string;
  brand: string;
  model: string;
  status: 'available' | 'in_custody' | 'in_shift' | 'maintenance' | 'blocked';
  group: string;
  lastOdometer: number;
  tenantId?: string;
  branchId?: string;
  activeServiceCaseId?: string | null;
  shiftModel?: ShiftModel;
  ownershipType?: OwnershipType;
  plateOwnerName?: string;
  monthlyPlateRent?: number;
  dailyDayRate?: number;
  dailyNightRate?: number;
  daily24hRate?: number;
  assignedDayDriverId?: string;
  assignedNightDriverId?: string;
  nextMaintenanceOdometer?: number;
  inspectionExpiry?: string;
  insuranceExpiry?: string;
  cascoExpiry?: string;
  taximeterExpiry?: string;
  stopName?: string;
  idleHours?: number;
  lastReturnFuelEighths?: number;
  lastReturnDamageNotes?: string;
  taximeterState?: 'occupied' | 'empty' | 'off';
  currentDistrict?: string;
  currentSpeedKmh?: number;
  outOfProvinceViolation?: boolean;
  dailyTaximeterGrossTl?: number;
}

export interface Driver {
  id: string;
  name: string;
  status: 'eligible' | 'conditional' | 'suspended';
  tc: string;
  phone: string;
  tenantId?: string;
  branchId?: string;
  ibbCardNo?: string;
  ibbCardExpiry?: string;
  licenseExpiry?: string;
  srcExpiry?: string;
  psychotechnicExpiry?: string;
  depositRequired?: number;
  depositPaid?: number;
  currentDebt?: number;
  maxDebtLimit?: number;
  unpaidFineCount?: number;
  trustScore?: number;
  hoursWorkedLast24h?: number;
  recentShiftShortfalls?: number;
  lastShiftShortfall?: number;
  consecutiveShortfallCount?: number;
  lifetimeShiftsCompleted?: number;
  lifetimeFaultyAccidents?: number;
  penaltyPoints?: number;
}

export interface Custody {
  id: string;
  vehicleId: string;
  driverId: string;
  status: 'active' | 'returned' | 'disputed';
  handedOverAt: string;
  returnedAt?: string;
  odometerOut: number;
  odometerIn?: number;
  fuelLevelEighths?: number;
  returnFuelEighths?: number;
  photosVerified?: boolean;
  taximeterSlipNo?: string;
  posDeviceDelivered?: boolean;
  contractPinCode?: string;
  damageNotes?: string;
  returnDamageNotes?: string;
  tenantId?: string;
  branchId?: string;
}

export type WorkOrderType =
  | 'periodic_10k'
  | 'mechanical'
  | 'body_accident'
  | 'tire_alignment'
  | 'taximeter_seal';

export interface ServiceCase {
  id: string;
  vehicleId: string;
  tenantId: string;
  branchId: string;
  status: 'open' | 'closed';
  workOrderType?: WorkOrderType;
  entryOdometer: number;
  reason: string;
  deliveredBy: string;
  responsibleDriverId?: string;
  provider: string;
  estimatedExitAt: string;
  costBearer: 'company' | 'driver' | 'owner' | 'insurance';
  insuranceClaimNo?: string;
  expertName?: string;
  faultPercentage?: number;
  insurancePayoutTl?: number;
  downtimeDays?: number;
  dailyYattiRate?: number;
  partsUsedSummary?: string;
  createdAt: string;
  exitOdometer?: number;
  invoiceDocumentNo?: string;
  expenseAmount?: number;
  ledgerEntryId?: string;
  partsLinked?: boolean;
  resultSummary?: string;
  vehicleEligible?: boolean;
  closedAt?: string;
}

export interface WorkshopPartItem {
  id: string;
  code: string;
  name: string;
  category: 'Bakım & Filtre' | 'Fren & Yürüyen' | 'Lastik & Akü' | 'Kaporta & Aydınlatma';
  stockQty: number;
  minAlertQty: number;
  unitCostTl: number;
  compatibleModels: string;
}

export type PenaltyIncidentType =
  | 'traffic_fine'
  | 'hgs_toll'
  | 'accident_damage'
  | 'downtime_loss';

export interface PenaltyIncident {
  id: string;
  tenantId: string;
  branchId: string;
  vehicleId: string;
  plate: string;
  driverId: string;
  driverName: string;
  type: PenaltyIncidentType;
  violationAt: string;
  amount: number;
  downtimeDays?: number;
  dailyYattiRate?: number;
  faultPercentage?: number;
  totalCharge: number;
  documentNo: string;
  status: 'pending_collection' | 'collected' | 'disputed' | 'legal_collection' | 'cancelled';
  description: string;
  matchedRecordId?: string;
  disputeReason?: string;
  disputeImageUrl?: string;
  disputeDocumentName?: string;
  legalCaseNo?: string;
  lawyerName?: string;
  resolutionNotes?: string;
  createdAt: string;
  collectedAt?: string;
}

export interface PlateOwnerSettlement {
  id: string;
  tenantId: string;
  branchId: string;
  ownerName: string;
  phone: string;
  iban: string;
  plate: string;
  vehicleId: string;
  periodMonth: string;
  monthlyBaseRent: number;
  deductedExpenses: number;
  paidAmount: number;
  status: 'open' | 'settled';
  notes: string;
  updatedAt: string;
}

export interface LedgerEntryItem {
  id: string;
  tenantId: string;
  branchId: string;
  type: 'accrual' | 'collection' | 'expense' | 'penalty_charge';
  amount: number;
  status: 'pending' | 'settled' | 'rejected';
  paymentMethod?: 'Nakit' | 'POS' | 'IBAN / FAST' | 'Mahsup';
  paymentKind?: 'debt_payment' | 'deposit_payment';
  receiptImageUrl?: string;
  receiptDocumentName?: string;
  relatedShiftId?: string;
  relatedServiceCaseId?: string;
  relatedPenaltyId?: string;
  relatedDriverId?: string;
  relatedOwnerSettlementId?: string;
  invoiceDocumentNo?: string;
  description?: string;
  createdAt: string;
  settledAt?: string;
}

export interface AuditLogRecord {
  id: string;
  seq: number;
  actorId: string;
  role: Role;
  tenantId: string;
  branchId: string;
  action: string;
  entityType: string;
  entityId: string;
  prevHash: string;
  hash: string;
  createdAt: string;
  details: Record<string, unknown>;
}

export type GateSeverity = 'PASS' | 'WARNING' | 'HARD_BLOCK';

export interface DepartureGateEvaluation {
  gateNumber: number;
  gateCode: string;
  title: string;
  severity: GateSeverity;
  formulaSummary: string;
  message: string;
  suggestedAction?: string;
  financialAdjustmentTl?: number;
}

export interface DecisionBrainEvaluationResult {
  canDepart: boolean;
  requiresOperationApproval: boolean;
  hardBlockCount: number;
  warningCount: number;
  passedCount: number;
  netCollateralTl: number;
  minCollateralThresholdTl: number;
  fuelDeficitAdjustmentTl: number;
  unaccountedKm: number;
  priorDriverHiddenDamageFlag: boolean;
  gates: DepartureGateEvaluation[];
}

export type OtpStatus = 'requested' | 'sent' | 'verified' | 'expired' | 'consumed';

export interface OtpRecord {
  id: string;
  custodyId: string;
  tenantId: string;
  branchId: string;
  phone: string;
  codeHash: string;
  status: OtpStatus;
  attempts: number;
  maxAttempts: number;
  expiresAt: string;
  resendAfter: string;
  createdAt: string;
  verifiedAt?: string;
  consumedAt?: string;
}

export interface DayCloseBlocker {
  collection: string;
  blockerCode: string;
  blockerCount: number;
  blockerEntityIds: string[];
  message: string;
  resolutionRoute: string;
}
