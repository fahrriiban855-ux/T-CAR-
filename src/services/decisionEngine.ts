import {
  Vehicle,
  Driver,
  Custody,
  ServiceCase,
  DepartureGateEvaluation,
  DecisionBrainEvaluationResult,
  DayCloseBlocker,
} from '../types';

export interface PreDepartureCheckInput {
  vehicle: Vehicle;
  driver: Driver;
  odometerOut: number;
  fuelLevelEighths: number; // 1..8 (8 = 8/8 Tam Dolu)
  photosVerifiedCount: number; // 0..4 (Ön, Arka, Sol, Sağ)
  newDriverReportedDamage: boolean;
  newDriverDamageNotes?: string;
  taximeterSlipNo: string;
  posDeviceDelivered: boolean;
  contractApproved: boolean;
  contractPinCode: string;
  activeCustodies: Custody[];
  openServiceCases: ServiceCase[];
  referenceDateIso?: string;
}

export interface ReturnAnomalyEvaluation {
  drivenKm: number;
  excessiveKmAlert: boolean;
  excessiveKmThreshold: number;
  underpaymentAmountTl: number;
  trustScoreDelta: number;
  lateHandoverMinutes: number;
  lateHandoverCompensationTl: number;
  proratedTargetRentTl: number;
  warnings: string[];
}

export interface IdleLossEntry {
  vehicle: Vehicle;
  idleHours: number;
  avgDailyRateTl: number;
  idleLossTl: number;
  lockReason: string | null;
}

const FUEL_UNIT_PRICE_PER_EIGHTH_TL = 250;

function daysBetween(targetDateIso: string | undefined, referenceDateIso: string): number {
  if (!targetDateIso) return 999;
  const target = new Date(targetDateIso).getTime();
  const ref = new Date(referenceDateIso).getTime();
  if (Number.isNaN(target) || Number.isNaN(ref)) return 999;
  return Math.floor((target - ref) / 86400000);
}

/**
 * 100/100 MERKEZİ KARAR BEYNİ — 12 KAPILI ÇIKIŞ KARAR MATRİSİ
 * Tek bir HARD_BLOCK dahi varsa çıkış kesin olarak engellenir.
 */
export function evaluate12DepartureGates(
  input: PreDepartureCheckInput
): DecisionBrainEvaluationResult {
  const refDate = input.referenceDateIso || new Date().toISOString().split('T')[0];
  const { vehicle, driver } = input;
  const gates: DepartureGateEvaluation[] = [];

  // KAPI 1: İBB Şoför Kartı & Ehliyet Süre Denetimi
  const ibbDays = daysBetween(driver.ibbCardExpiry, refDate);
  const licDays = daysBetween(driver.licenseExpiry, refDate);
  const minDocDays = Math.min(ibbDays, licDays);

  if (minDocDays <= 0) {
    gates.push({
      gateNumber: 1,
      gateCode: 'HARD_BLOCK_DOC_EXPIRED',
      title: 'İBB Kartı & Ehliyet Süre Denetimi',
      severity: 'HARD_BLOCK',
      formulaSummary: `günKalan = ${minDocDays} <= 0 => HARD_BLOCK`,
      message: `İBB Şoför Kartı (${driver.ibbCardExpiry || '-'}) veya Ehliyet (${driver.licenseExpiry || '-'}) süresi dolmuş.`,
      suggestedAction: 'Belge yenilenene kadar şoför statüsü bloke edilir.',
    });
  } else if (minDocDays <= 30) {
    gates.push({
      gateNumber: 1,
      gateCode: 'EXPIRY_WARNING',
      title: 'İBB Kartı & Ehliyet Süre Denetimi',
      severity: 'WARNING',
      formulaSummary: `0 < günKalan (${minDocDays} gün) <= 30 => EXPIRY_WARNING`,
      message: `Belge bitişine ${minDocDays} gün kaldı. Yenileme taahhüdü gerekli.`,
      suggestedAction: '30 gün içinde yenileme belgesi yüklenmeli.',
    });
  } else {
    gates.push({
      gateNumber: 1,
      gateCode: 'DOC_VALID',
      title: 'İBB Kartı & Ehliyet Süre Denetimi',
      severity: 'PASS',
      formulaSummary: `günKalan (${minDocDays} gün) > 30`,
      message: `İBB Kartı (${driver.ibbCardNo || 'Tam'}) ve Ehliyet geçerli.`,
    });
  }

  // KAPI 2: Net Teminat (Depozito Erimesi) Güvence Formülü
  const depositPaid = Number(driver.depositPaid ?? 20000);
  const depositRequired = Number(driver.depositRequired ?? 20000);
  const currentDebt = Number(driver.currentDebt ?? 0);
  const maxDebtLimit = Number(driver.maxDebtLimit ?? 5000);
  const netCollateralTl = depositPaid - currentDebt;
  const minCollateralThresholdTl = Math.round(depositRequired * 0.2);

  if (
    netCollateralTl <= 0 ||
    netCollateralTl <= minCollateralThresholdTl ||
    currentDebt > maxDebtLimit ||
    Number(driver.unpaidFineCount || 0) > 0
  ) {
    gates.push({
      gateNumber: 2,
      gateCode: 'DEPOSIT_EROSION_BLOCK',
      title: 'Net Teminat & Cari Borç Güvencesi',
      severity: 'HARD_BLOCK',
      formulaSummary: `NetTeminat (₺${netCollateralTl.toLocaleString('tr-TR')}) <= MinEşik (₺${minCollateralThresholdTl.toLocaleString('tr-TR')}) veya Borç (₺${currentDebt.toLocaleString('tr-TR')}) > Limit`,
      message:
        Number(driver.unpaidFineCount || 0) > 0
          ? `Şoförün ${driver.unpaidFineCount} adet ödenmemiş ceza/rücu kaydı ve ₺${currentDebt.toLocaleString('tr-TR')} borcu var.`
          : `Teminat erimesi veya borç limiti aşımı (Net Teminat: ₺${netCollateralTl.toLocaleString('tr-TR')}).`,
      suggestedAction: 'Gişeden borç tahsilatı veya depozito tamamlaması yapılmalı.',
    });
  } else {
    gates.push({
      gateNumber: 2,
      gateCode: 'COLLATERAL_OK',
      title: 'Net Teminat & Cari Borç Güvencesi',
      severity: 'PASS',
      formulaSummary: `NetTeminat = ₺${depositPaid.toLocaleString('tr-TR')} - ₺${currentDebt.toLocaleString('tr-TR')} = ₺${netCollateralTl.toLocaleString('tr-TR')}`,
      message: `Net teminat güvencesi yeterli (₺${netCollateralTl.toLocaleString('tr-TR')}).`,
    });
  }

  // KAPI 3: Ardışık Eksik Yevmiye Disiplin Kuralı
  const recentShortfalls = Number(driver.recentShiftShortfalls ?? 0);
  const lastShortfall = Number(driver.lastShiftShortfall ?? 0);
  if (recentShortfalls >= 2 || lastShortfall >= 1) {
    gates.push({
      gateNumber: 3,
      gateCode: 'CHRONIC_DEBT_BLOCK',
      title: 'Ardışık Eksik Yevmiye Disiplini',
      severity: 'HARD_BLOCK',
      formulaSummary: `Son3VardiyadaEksik (${recentShortfalls}) >= 2 veya SonVardiyaEksik (${lastShortfall}) >= 1`,
      message: 'Ardışık eksik yevmiye disiplinsizliği tespit edildi. Bakiye sıfırlanmadan araç verilmez.',
      suggestedAction: 'Açık yevmiye bakiyesi gişede kapatılmalı.',
    });
  } else {
    gates.push({
      gateNumber: 3,
      gateCode: 'PAYMENT_DISCIPLINE_OK',
      title: 'Ardışık Eksik Yevmiye Disiplini',
      severity: 'PASS',
      formulaSummary: 'Son 3 vardiyada kronik eksik ödeme yok',
      message: 'Yevmiye ödeme disiplini tam.',
    });
  }

  // KAPI 4: Çift Zimmet & Yorgunluk Kuralı
  const driverActiveCustody = input.activeCustodies.find(
    (c) => c.driverId === driver.id && c.status === 'active'
  );
  const hoursWorkedLast24h = Number(driver.hoursWorkedLast24h ?? 0);
  if (driverActiveCustody || hoursWorkedLast24h > 10) {
    gates.push({
      gateNumber: 4,
      gateCode: 'DUPLICATE_OR_FATIGUE_BLOCK',
      title: 'Çift Zimmet & UKOME Yorgunluk Denetimi',
      severity: 'HARD_BLOCK',
      formulaSummary: `AktifZimmet (${driverActiveCustody ? 'Var' : 'Yok'}) veya Son24SaatÇalışma (${hoursWorkedLast24h}s) > 10s`,
      message: driverActiveCustody
        ? 'Şoförün üzerinde zaten aktif bir araç zimmeti bulunuyor.'
        : `Şoför son 24 saatte ${hoursWorkedLast24h} saat çalıştı (UKOME yorgunluk sınırı > 10 saat).`,
      suggestedAction: 'Önceki zimmet kapatılmalı veya dinlenme süresi tamamlanmalı.',
    });
  } else {
    gates.push({
      gateNumber: 4,
      gateCode: 'FATIGUE_OK',
      title: 'Çift Zimmet & UKOME Yorgunluk Denetimi',
      severity: 'PASS',
      formulaSummary: `AktifZimmet = Yok · Son24Saat = ${hoursWorkedLast24h} saat <= 10 saat`,
      message: 'Aktif başka zimmet yok, çalışma süresi uygun.',
    });
  }

  // KAPI 5: Araç Yasal Uygunluk (Muayene, Sigorta, Taksimetre Mührü)
  const inspDays = daysBetween(vehicle.inspectionExpiry, refDate);
  const insDays = daysBetween(vehicle.insuranceExpiry, refDate);
  const taxiDays = daysBetween(vehicle.taximeterExpiry, refDate);
  if (inspDays <= 0 || insDays <= 0 || taxiDays <= 0) {
    gates.push({
      gateNumber: 5,
      gateCode: 'VEHICLE_LEGAL_LOCK',
      title: 'Araç Yasal Uygunluk (Muayene/Sigorta/Taksimetre)',
      severity: 'HARD_BLOCK',
      formulaSummary: `Muayene(${inspDays}g) / Sigorta(${insDays}g) / Taksimetre(${taxiDays}g) <= 0`,
      message: `${vehicle.plate} muayene, trafik sigortası veya taksimetre kalibrasyon süresi dolmuş.`,
      suggestedAction: 'Polis çevirmesinde bağlanma riski! Yasal işlem tamamlanmadan çıkamaz.',
    });
  } else {
    gates.push({
      gateNumber: 5,
      gateCode: 'VEHICLE_LEGAL_OK',
      title: 'Araç Yasal Uygunluk (Muayene/Sigorta/Taksimetre)',
      severity: 'PASS',
      formulaSummary: `Muayene: ${inspDays}g · Sigorta: ${insDays}g · Taksimetre: ${taxiDays}g`,
      message: 'Muayene, zorunlu trafik sigortası ve taksimetre mührü geçerli.',
    });
  }

  // KAPI 6: 10.000 KM Periyodik Bakım Kesici
  const nextMaintKm = Number(vehicle.nextMaintenanceOdometer || vehicle.lastOdometer + 10000);
  const remainingKm = nextMaintKm - Number(vehicle.lastOdometer || 0);
  if (remainingKm <= 0) {
    gates.push({
      gateNumber: 6,
      gateCode: 'MAINTENANCE_LOCK',
      title: '10.000 KM Periyodik Bakım Kilidi',
      severity: 'HARD_BLOCK',
      formulaSummary: `KalanKM = ${nextMaintKm.toLocaleString('tr-TR')} - ${vehicle.lastOdometer.toLocaleString('tr-TR')} = ${remainingKm} <= 0`,
      message: `10.000 KM periyodik bakım sınırı aşıldı (${vehicle.lastOdometer.toLocaleString('tr-TR')} KM).`,
      suggestedAction: 'Araç doğrudan bakım servisine yönlendirilmelidir.',
    });
  } else if (remainingKm <= 500) {
    gates.push({
      gateNumber: 6,
      gateCode: 'SON_VARDIYA_UYARISI',
      title: '10.000 KM Periyodik Bakım Kilidi',
      severity: 'WARNING',
      formulaSummary: `0 < KalanKM (${remainingKm} KM) <= 500 KM => SON_VARDİYA_UYARISI`,
      message: `Bakıma yalnızca ${remainingKm} KM kaldı. Bu vardiya dönüşünde otomatik servis kaydı açılacak.`,
      suggestedAction: 'Dönüşte aracı bakım atölyesine teslim ediniz.',
    });
  } else {
    gates.push({
      gateNumber: 6,
      gateCode: 'MAINTENANCE_OK',
      title: '10.000 KM Periyodik Bakım Kilidi',
      severity: 'PASS',
      formulaSummary: `KalanKM = ${remainingKm.toLocaleString('tr-TR')} KM > 500 KM`,
      message: `Periyodik bakıma ${remainingKm.toLocaleString('tr-TR')} KM mesafe var.`,
    });
  }

  // KAPI 7: Açık Kritik Arıza / Servis Kilidi
  const hasOpenService =
    vehicle.status === 'maintenance' ||
    Boolean(vehicle.activeServiceCaseId) ||
    input.openServiceCases.some((sc) => sc.vehicleId === vehicle.id && sc.status === 'open');
  if (hasOpenService) {
    gates.push({
      gateNumber: 7,
      gateCode: 'ACTIVE_SERVICE_LOCK',
      title: 'Açık Kritik Arıza & Servis Kontrolü',
      severity: 'HARD_BLOCK',
      formulaSummary: `serviceStatus IN {open, maintenance} => ACTIVE_SERVICE_LOCK`,
      message: 'Araçta kapatılmamış servis/hasar dosyası bulunuyor.',
      suggestedAction: 'Servis çıkış faturası ve uygunluk onayı girilmeden zimmetlenemez.',
    });
  } else {
    gates.push({
      gateNumber: 7,
      gateCode: 'NO_ACTIVE_SERVICE',
      title: 'Açık Kritik Arıza & Servis Kontrolü',
      severity: 'PASS',
      formulaSummary: 'Açık servis dosyası = 0',
      message: 'Araçta açık arıza veya hasar dosyası yok.',
    });
  }

  // KAPI 8: Kaçak KM (Kayıtsız Kullanım) Yakalayıcı
  const deltaKm = Number(input.odometerOut) - Number(vehicle.lastOdometer || 0);
  if (deltaKm < 0) {
    gates.push({
      gateNumber: 8,
      gateCode: 'ODOMETER_ROLLBACK_BLOCK',
      title: 'Kaçak KM & Kilometre Süreklilik Denetimi',
      severity: 'HARD_BLOCK',
      formulaSummary: `ΔKM = ${input.odometerOut} - ${vehicle.lastOdometer} = ${deltaKm} < 0`,
      message: `Girilen çıkış KM (${input.odometerOut}), aracın son dönüş KM'sinden (${vehicle.lastOdometer}) küçük olamaz!`,
      suggestedAction: 'Kadran kilometresini doğru giriniz.',
    });
  } else if (deltaKm > 5) {
    gates.push({
      gateNumber: 8,
      gateCode: 'UNACCOUNTED_KM_ALERT',
      title: 'Kaçak KM & Kilometre Süreklilik Denetimi',
      severity: 'WARNING',
      formulaSummary: `ΔKM = ${input.odometerOut} - ${vehicle.lastOdometer} = +${deltaKm} KM (Kayıtsız KM)`,
      message: `Önceki vardiya dönüşü ile yeni çıkış arasında +${deltaKm} KM kayıtsız (kaçak) kullanım tespit edildi!`,
      suggestedAction: 'Komuta merkezine kırmızı bayrak düşürüldü; önceki vardiya incelenecek.',
    });
  } else {
    gates.push({
      gateNumber: 8,
      gateCode: 'KM_CONTINUITY_OK',
      title: 'Kaçak KM & Kilometre Süreklilik Denetimi',
      severity: 'PASS',
      formulaSummary: `ΔKM = ${deltaKm} KM (Tam Süreklilik)`,
      message: `Önceki vardiya dönüş KM'si (${vehicle.lastOdometer.toLocaleString('tr-TR')}) ile tam uyumlu.`,
    });
  }

  // KAPI 9: Önceki Vardiyadan Kalan Gizli Hasar Kıyaslaması
  const priorDriverHiddenDamageFlag = Boolean(input.newDriverReportedDamage);
  if (priorDriverHiddenDamageFlag) {
    gates.push({
      gateNumber: 9,
      gateCode: 'PRIOR_SHIFT_DAMAGE_ATTRIBUTION',
      title: 'Çıkış - Dönüş Gizli Hasar Kıyaslaması',
      severity: 'WARNING',
      formulaSummary: `YeniŞoförBeyanı (Hasar Var) != ÖncekiDönüşBeyanı (Sorunsuz)`,
      message: `Yeni şoför teslim alırken hasar bildirdi (${input.newDriverDamageNotes || 'Kaporta/Tampon izi'}). Hasar önceki vardiya şoförünün siciline "Teslimde Gizlenen Hasar" olarak bağlandı.`,
      suggestedAction: 'Yeni şoför bu hasardan sorumlu tutulmayacak.',
    });
  } else {
    gates.push({
      gateNumber: 9,
      gateCode: 'DAMAGE_COMPARISON_OK',
      title: 'Çıkış - Dönüş Gizli Hasar Kıyaslaması',
      severity: 'PASS',
      formulaSummary: 'Önceki dönüş durumu = Yeni çıkış durumu',
      message: 'Önceki vardiyadan kalan gizli/bildirilmemiş hasar yok.',
    });
  }

  // KAPI 10: Eksik Yakıt Devir Otomatik Mahsup Motoru
  const fuelEighths = Math.min(8, Math.max(1, Number(input.fuelLevelEighths || 8)));
  const missingEighths = 8 - fuelEighths;
  const fuelDeficitAdjustmentTl = missingEighths * FUEL_UNIT_PRICE_PER_EIGHTH_TL;
  if (missingEighths > 0) {
    gates.push({
      gateNumber: 10,
      gateCode: 'FUEL_DEFICIT_AUTO_CLEARING',
      title: 'Eksik Yakıt Devir & Otomatik Mahsup',
      severity: 'WARNING',
      formulaSummary: `(8 - ${fuelEighths}) × ₺${FUEL_UNIT_PRICE_PER_EIGHTH_TL} = ₺${fuelDeficitAdjustmentTl}`,
      message: `Araç ${fuelEighths}/8 yakıtla teslim alındı. Eksik yakıt bedeli (₺${fuelDeficitAdjustmentTl}) önceki şoföre borç, yeni şoföre yevmiye indirimi olarak hesaplandı.`,
      financialAdjustmentTl: fuelDeficitAdjustmentTl,
    });
  } else {
    gates.push({
      gateNumber: 10,
      gateCode: 'FUEL_FULL_OK',
      title: 'Eksik Yakıt Devir & Otomatik Mahsup',
      severity: 'PASS',
      formulaSummary: 'Yakıt = 8/8 Tam Dolu (Mahsup = ₺0)',
      message: 'Araç 8/8 tam dolu yakıt ile teslim alındı.',
      financialAdjustmentTl: 0,
    });
  }

  // KAPI 11: Taksimetre Açılış Fişi, POS Cihazı & 4 Yön Fotoğraf Doğrulaması
  const slipValid = Boolean(input.taximeterSlipNo && input.taximeterSlipNo.trim().length >= 3);
  const photosComplete = Number(input.photosVerifiedCount || 0) >= 4;
  const contractComplete =
    Boolean(input.contractApproved) && Boolean(input.contractPinCode && input.contractPinCode.trim().length === 4);

  if (!slipValid || !input.posDeviceDelivered || !photosComplete || !contractComplete) {
    const missingParts: string[] = [];
    if (!photosComplete) missingParts.push(`4 yön fotoğraf (${input.photosVerifiedCount}/4)`);
    if (!slipValid) missingParts.push('Taksimetre Fiş No');
    if (!input.posDeviceDelivered) missingParts.push('Araç içi POS cihazı teslim onayı');
    if (!contractComplete) missingParts.push('Dijital sözleşme & 4 haneli PIN onayı');

    gates.push({
      gateNumber: 11,
      gateCode: 'TAXIMETER_POS_INCOMPLETE',
      title: '4 Yön Fotoğraf, Taksimetre Fişi, POS & Sözleşme',
      severity: 'HARD_BLOCK',
      formulaSummary: `Foto(${input.photosVerifiedCount}/4) · Fiş(${slipValid ? 'Tam' : 'Eksik'}) · POS(${input.posDeviceDelivered ? 'Tam' : 'Eksik'}) · PIN(${contractComplete ? 'Tam' : 'Eksik'})`,
      message: `Eksik saha doğrulaması: ${missingParts.join(', ')}.`,
      suggestedAction: 'Tüm zorunlu doğrulama adımlarını tamamlayınız.',
    });
  } else {
    gates.push({
      gateNumber: 11,
      gateCode: 'FIELD_VERIFICATION_OK',
      title: '4 Yön Fotoğraf, Taksimetre Fişi, POS & Sözleşme',
      severity: 'PASS',
      formulaSummary: `4/4 Fotoğraf · Fiş: ${input.taximeterSlipNo} · POS: Teslim · PIN: Onaylı`,
      message: '4 yön fotoğraf, taksimetre açılış fişi, POS cihazı ve dijital sözleşme doğrulandı.',
    });
  }

  // KAPI 12: Şoför Güven Puanı (trustScore <= 60 => Yüksek Risk Uyarısı)
  const trustScore = Number(driver.trustScore ?? 92);
  if (trustScore <= 60) {
    gates.push({
      gateNumber: 12,
      gateCode: 'LOW_TRUST_SCORE_WARNING',
      title: 'Şoför Ömür Boyu Güven Puanı Denetimi',
      severity: 'WARNING',
      formulaSummary: `trustScore (${trustScore}) <= 60 => Yüksek Riskli Şoför Uyarısı`,
      message: `Şoför güven puanı kritik eşikte (${trustScore}/100). Komuta merkezine yüksek risk uyarısı ve ek teminat şartı iletildi.`,
      suggestedAction: 'Operasyon sorumlusu ek kontrol ile onaylamalıdır.',
    });
  } else {
    gates.push({
      gateNumber: 12,
      gateCode: 'TRUST_SCORE_OK',
      title: 'Şoför Ömür Boyu Güven Puanı Denetimi',
      severity: 'PASS',
      formulaSummary: `trustScore = ${trustScore}/100 > 60`,
      message: `Şoför güven puanı yüksek (${trustScore}/100).`,
    });
  }

  const hardBlockCount = gates.filter((g) => g.severity === 'HARD_BLOCK').length;
  const warningCount = gates.filter((g) => g.severity === 'WARNING').length;
  const passedCount = gates.filter((g) => g.severity === 'PASS').length;

  return {
    canDepart: hardBlockCount === 0,
    requiresOperationApproval: true,
    hardBlockCount,
    warningCount,
    passedCount,
    netCollateralTl,
    minCollateralThresholdTl,
    fuelDeficitAdjustmentTl,
    unaccountedKm: Math.max(0, deltaKm),
    priorDriverHiddenDamageFlag,
    gates,
  };
}

/**
 * VARDİYA BİTİŞ & ZİMMET İADE ANOMALİ VE TAZMİNAT HESAPLAYICI (closeShiftAndCustody)
 */
export function evaluateShiftReturnAnomalies(input: {
  slot: 'day_12h' | 'night_12h' | 'full_24h';
  odometerStart: number;
  odometerEnd: number;
  accrualTl: number;
  collectedTl: number;
  lateHandoverMinutes?: number;
  workedHours?: number;
  earlyBreakdown?: boolean;
}): ReturnAnomalyEvaluation {
  const warnings: string[] = [];
  const drivenKm = Math.max(0, Number(input.odometerEnd) - Number(input.odometerStart));
  const is24h = input.slot === 'full_24h';
  const excessiveKmThreshold = is24h ? 800 : 450;
  const excessiveKmAlert = drivenKm > excessiveKmThreshold;

  if (excessiveKmAlert) {
    warnings.push(
      `AŞIRI_KM_UYARISI: Vardiyada ${drivenKm} KM yapıldı (Üst limit: ${excessiveKmThreshold} KM). İzinsiz şehir dışı veya alt şoför kullanımı incelenmeli.`
    );
  }

  const plannedHours = is24h ? 24 : 12;
  const actualHours = input.workedHours && input.workedHours > 0 ? input.workedHours : plannedHours;
  const proratedTargetRentTl = input.earlyBreakdown
    ? Math.round((Number(input.accrualTl) * Math.min(plannedHours, actualHours)) / plannedHours)
    : Number(input.accrualTl);

  const underpaymentAmountTl = Math.max(0, proratedTargetRentTl - Number(input.collectedTl));
  let trustScoreDelta = 2; // Tam ve sorunsuz ödemede +2 puan
  if (underpaymentAmountTl > 0 && !input.earlyBreakdown) {
    trustScoreDelta = -5; // Arıza yokken eksik yevmiye => -5 puan
    warnings.push(
      `EKSİK_YEVMİYE_DENETİMİ: Arıza kaydı yokken ₺${underpaymentAmountTl.toLocaleString('tr-TR')} eksik bırakıldı. Cari borca işlendi ve güven puanı -5 düşürüldü.`
    );
  }

  const lateMinutes = Math.max(0, Number(input.lateHandoverMinutes || 0));
  const hourlyRateTl = Number(input.accrualTl) / plannedHours;
  const lateHandoverCompensationTl =
    lateMinutes > 30 ? Math.round((lateMinutes / 60) * hourlyRateTl) : 0;

  if (lateHandoverCompensationTl > 0) {
    warnings.push(
      `VARDİYA_SARKMASI_TAZMİNATI: Araç ${lateMinutes} dk geç teslim edildi (>30 dk). Gecikme tazminatı ₺${lateHandoverCompensationTl.toLocaleString('tr-TR')} hesaplandı.`
    );
  }

  return {
    drivenKm,
    excessiveKmAlert,
    excessiveKmThreshold,
    underpaymentAmountTl,
    trustScoreDelta,
    lateHandoverMinutes: lateMinutes,
    lateHandoverCompensationTl,
    proratedTargetRentTl,
    warnings,
  };
}

/**
 * TEMİNAT ERİMESİ KRİTİK EŞİK DENETİMİ (ToplamBorç >= %80 * Teminat)
 */
export function evaluateDepositErosionStatus(driver: Partial<Driver>): {
  isCriticalErosion: boolean;
  erosionRatioPercent: number;
  netDepositRemainingTl: number;
} {
  const depositPaid = Math.max(1, Number(driver.depositPaid ?? 20000));
  const currentDebt = Math.max(0, Number(driver.currentDebt ?? 0));
  const erosionRatioPercent = Math.min(100, Math.round((currentDebt / depositPaid) * 100));
  return {
    isCriticalErosion: currentDebt >= depositPaid * 0.8,
    erosionRatioPercent,
    netDepositRemainingTl: Math.max(0, depositPaid - currentDebt),
  };
}

/**
 * CANLI YATAK ZARARI HESABI (Yatak Zarar Radarı)
 * YatakZararı_plaka = OrtalamaGünlükNetKazanç * (BoşBeklemeSaatleri / 24)
 */
export function calculateFleetIdleLossRadar(vehicles: Vehicle[]): IdleLossEntry[] {
  return vehicles
    .filter((v) => v.status === 'available' || v.status === 'blocked' || v.status === 'maintenance')
    .map((v) => {
      const avgDailyRateTl =
        v.shiftModel === '24h_single'
          ? Number(v.daily24hRate || 5000)
          : Number(v.dailyDayRate || 2400) + Number(v.dailyNightRate || 2600);
      const idleHours = Number(
        v.idleHours ?? (v.status === 'blocked' ? 18 : v.status === 'maintenance' ? 14 : 6)
      );
      const idleLossTl = Math.round((avgDailyRateTl * idleHours) / 24);

      let lockReason: string | null = null;
      if (v.status === 'maintenance' || v.activeServiceCaseId) {
        lockReason = 'ACTIVE_SERVICE_LOCK';
      } else if (v.nextMaintenanceOdometer && v.lastOdometer >= v.nextMaintenanceOdometer) {
        lockReason = 'MAINTENANCE_LOCK';
      } else if (v.inspectionExpiry && v.inspectionExpiry < new Date().toISOString().split('T')[0]) {
        lockReason = 'VEHICLE_LEGAL_LOCK';
      }

      return {
        vehicle: v,
        idleHours,
        avgDailyRateTl,
        idleLossTl,
        lockReason,
      };
    })
    .sort((a, b) => b.idleLossTl - a.idleLossTl);
}

/**
 * AKILLI YEDEK ŞOFÖR ÖNERİ MOTORU (matchBestSpareDrivers)
 * Filtreler: status === 'eligible', aktifZimmet === null, İBB/Ehliyet süresi tam, netTeminat > minEşik
 * Sıralama: trustScore büyükten küçüğe
 */
export function matchBestSpareDrivers(
  drivers: Driver[],
  activeCustodies: Custody[],
  referenceDateIso = new Date().toISOString().split('T')[0]
): Driver[] {
  const busyDriverIds = new Set(
    activeCustodies.filter((c) => c.status === 'active').map((c) => c.driverId)
  );

  return drivers
    .filter((d) => {
      if (d.status !== 'eligible') return false;
      if (busyDriverIds.has(d.id)) return false;
      if (daysBetween(d.ibbCardExpiry, referenceDateIso) <= 0) return false;
      if (daysBetween(d.licenseExpiry, referenceDateIso) <= 0) return false;
      const depositPaid = Number(d.depositPaid ?? 20000);
      const depositReq = Number(d.depositRequired ?? 20000);
      const debt = Number(d.currentDebt ?? 0);
      if (depositPaid - debt <= depositReq * 0.2) return false;
      return true;
    })
    .sort((a, b) => Number(b.trustScore ?? 90) - Number(a.trustScore ?? 90));
}

export interface CanonicalDayCloseInput {
  tenantId: string;
  branchId: string;
  businessDate: string;
  closedBy: string;
  totalAccrual: number;
  totalCollection: number;
  cashDifference: number;
  previousCloseHash: string;
  signatureVersion: string;
}

export function buildCanonicalDayCloseString(input: CanonicalDayCloseInput): string {
  return [
    `version=${input.signatureVersion}`,
    `tenant=${input.tenantId}`,
    `branch=${input.branchId}`,
    `date=${input.businessDate}`,
    `closedBy=${input.closedBy}`,
    `accrual=${input.totalAccrual}`,
    `collection=${input.totalCollection}`,
    `diff=${input.cashDifference}`,
    `prev=${input.previousCloseHash}`,
  ].join('|');
}

function simpleDeterministicHex(payload: string): string {
  let h1 = 0xdeadbeef ^ payload.length;
  let h2 = 0x41c6ce57 ^ payload.length;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${part1}${part2}${part1}${part2}${part1}${part2}${part1}${part2}`;
}

export function computeDayCloseSeal(input: CanonicalDayCloseInput, secret: string): string {
  if (!secret || secret.length < 16) {
    throw new Error('Sunucu mühür anahtarı (DAY_CLOSE_SECRET) eksik veya güvenli uzunlukta değil.');
  }
  const canonical = buildCanonicalDayCloseString(input);
  return simpleDeterministicHex(`${secret}:${canonical}`);
}

export interface DayCloseSnapshotInputs {
  alreadyClosed: boolean;
  activeCustodyIds: string[];
  activeShiftIds: string[];
  uncollectedAccrualShiftIds: string[];
  untransferredCollectionIds: string[];
  cashDiffRecordIds: string[];
  posDiffRecordIds: string[];
  undocumentedDamageIds: string[];
  undocumentedFineIds: string[];
  unapprovedExpenseIds: string[];
  openServiceCaseIds: string[];
  unlinkedPartExitIds: string[];
  disputedRecordIds: string[];
  missingAuditEntityIds: string[];
  openOwnerSettlementIds: string[];
}

export function evaluateDayCloseBlockers(inputs: DayCloseSnapshotInputs): DayCloseBlocker[] {
  const blockers: DayCloseBlocker[] = [];

  if (inputs.activeCustodyIds.length > 0) {
    blockers.push({
      collection: 'custodies',
      blockerCode: 'ACTIVE_CUSTODY',
      blockerCount: inputs.activeCustodyIds.length,
      blockerEntityIds: inputs.activeCustodyIds,
      message: 'Açık zimmet kayıtları mevcut. Kapanış öncesi tüm zimmetler iade alınmalıdır.',
      resolutionRoute: '/shifts',
    });
  }
  if (inputs.activeShiftIds.length > 0) {
    blockers.push({
      collection: 'shifts',
      blockerCode: 'ACTIVE_SHIFT',
      blockerCount: inputs.activeShiftIds.length,
      blockerEntityIds: inputs.activeShiftIds,
      message: 'Açık veya gecikmiş vardiyalar mevcut. Kapanış öncesi vardiyalar sonlandırılmalıdır.',
      resolutionRoute: '/shifts',
    });
  }
  if (inputs.uncollectedAccrualShiftIds.length > 0) {
    blockers.push({
      collection: 'shifts',
      blockerCode: 'UNCOLLECTED_ACCRUAL',
      blockerCount: inputs.uncollectedAccrualShiftIds.length,
      blockerEntityIds: inputs.uncollectedAccrualShiftIds,
      message: 'Tahsilatsız tahakkuk bulunan vardiyalar var.',
      resolutionRoute: '/shifts',
    });
  }
  if (inputs.untransferredCollectionIds.length > 0) {
    blockers.push({
      collection: 'collections',
      blockerCode: 'UNTRANSFERRED_COLLECTION',
      blockerCount: inputs.untransferredCollectionIds.length,
      blockerEntityIds: inputs.untransferredCollectionIds,
      message: 'Kasaya aktarılmamış tahsilat kayıtları mevcut.',
      resolutionRoute: '/',
    });
  }
  if (inputs.cashDiffRecordIds.length > 0) {
    blockers.push({
      collection: 'vault_reconciliations',
      blockerCode: 'CASH_DIFFERENCE',
      blockerCount: inputs.cashDiffRecordIds.length,
      blockerEntityIds: inputs.cashDiffRecordIds,
      message: 'Kasa sayım farkı kapatılmamış.',
      resolutionRoute: '/',
    });
  }
  if (inputs.posDiffRecordIds.length > 0) {
    blockers.push({
      collection: 'pos_reconciliations',
      blockerCode: 'POS_RECONCILIATION_DIFF',
      blockerCount: inputs.posDiffRecordIds.length,
      blockerEntityIds: inputs.posDiffRecordIds,
      message: 'POS mutabakat farkı çözümlenmemiş.',
      resolutionRoute: '/',
    });
  }
  if (inputs.undocumentedDamageIds.length > 0) {
    blockers.push({
      collection: 'damages',
      blockerCode: 'UNDOCUMENTED_DAMAGE',
      blockerCount: inputs.undocumentedDamageIds.length,
      blockerEntityIds: inputs.undocumentedDamageIds,
      message: 'Belgesiz hasar kaydı mevcut.',
      resolutionRoute: '/vehicles',
    });
  }
  if (inputs.undocumentedFineIds.length > 0) {
    blockers.push({
      collection: 'fines',
      blockerCode: 'UNDOCUMENTED_FINE_HGS',
      blockerCount: inputs.undocumentedFineIds.length,
      blockerEntityIds: inputs.undocumentedFineIds,
      message: 'Belgesiz trafik cezası veya HGS geçiş kaydı mevcut.',
      resolutionRoute: '/vehicles',
    });
  }
  if (inputs.unapprovedExpenseIds.length > 0) {
    blockers.push({
      collection: 'expenses',
      blockerCode: 'UNAPPROVED_EXPENSE',
      blockerCount: inputs.unapprovedExpenseIds.length,
      blockerEntityIds: inputs.unapprovedExpenseIds,
      message: 'Onaysız masraf fişleri mevcut.',
      resolutionRoute: '/',
    });
  }
  if (inputs.openServiceCaseIds.length > 0) {
    blockers.push({
      collection: 'service_cases',
      blockerCode: 'OPEN_SERVICE_CASE',
      blockerCount: inputs.openServiceCaseIds.length,
      blockerEntityIds: inputs.openServiceCaseIds,
      message: 'Açık servis dosyası mevcut.',
      resolutionRoute: '/vehicles',
    });
  }
  if (inputs.unlinkedPartExitIds.length > 0) {
    blockers.push({
      collection: 'inventory_exits',
      blockerCode: 'UNLINKED_PART_EXIT',
      blockerCount: inputs.unlinkedPartExitIds.length,
      blockerEntityIds: inputs.unlinkedPartExitIds,
      message: 'Araca bağlanmamış depo veya parça çıkışı mevcut.',
      resolutionRoute: '/vehicles',
    });
  }
  if (inputs.disputedRecordIds.length > 0) {
    blockers.push({
      collection: 'custodies',
      blockerCode: 'DISPUTED_RECORD',
      blockerCount: inputs.disputedRecordIds.length,
      blockerEntityIds: inputs.disputedRecordIds,
      message: 'İtirazlı zimmet veya operasyon kaydı mevcut.',
      resolutionRoute: '/penalties',
    });
  }
  if (inputs.missingAuditEntityIds.length > 0) {
    blockers.push({
      collection: 'audit_logs',
      blockerCode: 'MISSING_AUDIT_LOG',
      blockerCount: inputs.missingAuditEntityIds.length,
      blockerEntityIds: inputs.missingAuditEntityIds,
      message: 'Audit kaydı eksik olan işlem tespit edildi.',
      resolutionRoute: '/',
    });
  }
  if (inputs.openOwnerSettlementIds.length > 0) {
    blockers.push({
      collection: 'owner_settlements',
      blockerCode: 'OPEN_OWNER_SETTLEMENT_ITEM',
      blockerCount: inputs.openOwnerSettlementIds.length,
      blockerEntityIds: inputs.openOwnerSettlementIds,
      message: 'Araç sahibi hakedişini etkileyen açık kayıt mevcut.',
      resolutionRoute: '/vehicles',
    });
  }

  return blockers;
}

export function hashOtpCode(code: string, salt: string): string {
  return simpleDeterministicHex(`${salt}:${code}`);
}

