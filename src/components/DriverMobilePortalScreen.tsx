import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Camera,
  Car,
  FileCheck2,
  QrCode,
  Wrench,
  ShieldAlert,
  Wallet,
  ArrowRightLeft,
  Send,
  Award,
  Upload,
  AlertTriangle,
  Clock,
  KeyRound,
} from 'lucide-react';
import { useDataStore } from '../store/dataStore';
import { evaluate12DepartureGates, evaluateDepositErosionStatus } from '../services/decisionEngine';

type MobileTab = 'shift' | 'wallet' | 'penalties' | 'documents';

export default function DriverMobilePortalScreen() {
  const vehicles = useDataStore((state) => state.vehicles);
  const drivers = useDataStore((state) => state.drivers);
  const shifts = useDataStore((state) => state.shifts);
  const custodies = useDataStore((state) => state.custodies);
  const serviceCases = useDataStore((state) => state.serviceCases);
  const penalties = useDataStore((state) => state.penalties);
  const ledgerEntries = useDataStore((state) => state.ledgerEntries);

  const submitPreShiftDepartureRequest = useDataStore((state) => state.submitPreShiftDepartureRequest);
  const approveShiftDeparture = useDataStore((state) => state.approveShiftDeparture);
  const closeShift = useDataStore((state) => state.closeShift);
  const enterService = useDataStore((state) => state.enterService);
  const recordDriverLedgerPayment = useDataStore((state) => state.recordDriverLedgerPayment);
  const disputePenaltyIncident = useDataStore((state) => state.disputePenaltyIncident);

  const [selectedDriverId, setSelectedDriverId] = useState<string>(drivers[0]?.id || 'd1');
  const currentDriver = drivers.find((d) => d.id === selectedDriverId) || drivers[0];

  const [activeTab, setActiveTab] = useState<MobileTab>('shift');

  const rosterAssignedVehicles = useMemo(() => {
    if (!currentDriver) return [];
    return vehicles.filter(
      (v) =>
        v.assignedDayDriverId === currentDriver.id ||
        v.assignedNightDriverId === currentDriver.id
    );
  }, [vehicles, currentDriver]);

  const [takeoverMode, setTakeoverMode] = useState<'assigned' | 'qr_pin'>('assigned');
  const [qrHandoverCode, setQrHandoverCode] = useState<string>('VRD-4829');
  const [qrVerifiedPlateId, setQrVerifiedPlateId] = useState<string | null>(null);

  const activeVehicleForStart = useMemo(() => {
    if (takeoverMode === 'qr_pin' && qrVerifiedPlateId) {
      return vehicles.find((v) => v.id === qrVerifiedPlateId) || rosterAssignedVehicles[0] || vehicles[0];
    }
    return rosterAssignedVehicles[0] || vehicles.find((v) => v.status === 'available') || vehicles[0];
  }, [takeoverMode, qrVerifiedPlateId, rosterAssignedVehicles, vehicles]);

  const [slot, setSlot] = useState<'day_12h' | 'night_12h' | 'full_24h'>('day_12h');
  const [odometerOut, setOdometerOut] = useState<number>(activeVehicleForStart?.lastOdometer || 145200);
  const [fuelLevelEighths, setFuelLevelEighths] = useState<number>(8);
  const [verifiedPhotos, setVerifiedPhotos] = useState<Record<string, boolean>>({
    front: true,
    rear: true,
    left: true,
    right: true,
  });
  const [newDriverReportedDamage, setNewDriverReportedDamage] = useState<boolean>(false);
  const [newDriverDamageNotes, setNewDriverDamageNotes] = useState<string>('');
  const [taximeterSlipNo, setTaximeterSlipNo] = useState<string>('TKS-90841');
  const [posDeviceDelivered, setPosDeviceDelivered] = useState<boolean>(true);
  const [contractApproved, setContractApproved] = useState<boolean>(true);
  const [contractPinCode, setContractPinCode] = useState<string>('4829');

  const [activeFieldSheet, setActiveFieldSheet] = useState<
    'none' | 'pay_daily_rent' | 'report_breakdown' | 'handover_shift'
  >('none');

  const [dailyPaymentMethod, setDailyPaymentMethod] = useState<'iban_fast' | 'pos_settlement' | 'cash_desk'>('iban_fast');
  const [dailyPaymentAmount, setDailyPaymentAmount] = useState<number>(2400);
  const [fastReceiptNo, setFastReceiptNo] = useState<string>('FAST-884920');

  const [incidentCategory, setIncidentCategory] = useState<'breakdown' | 'accident'>('breakdown');
  const [incidentLocation, setIncidentLocation] = useState<string>('Şişli Büyükdere Cad. No:42 (GPS Doğrulandı)');
  const [incidentDescription, setIncidentDescription] = useState<string>(
    'Araç hararet uyarısı verdi, sağa çekildi. Çekici talep ediliyor.'
  );
  const [needsTowTruck, setNeedsTowTruck] = useState<boolean>(true);
  const [workedHoursBeforeFreeze, setWorkedHoursBeforeFreeze] = useState<number>(5);
  const [incidentPhotoAttached, setIncidentPhotoAttached] = useState<boolean>(true);

  const [handoverTarget, setHandoverTarget] = useState<'second_driver_field' | 'station_garage'>('second_driver_field');
  const [nextShiftDriverId, setNextShiftDriverId] = useState<string>('d2');
  const [mutualHandoverPin, setMutualHandoverPin] = useState<string>('5912');
  const [returnOdometer, setReturnOdometer] = useState<number>(0);
  const [returnFuelEighths, setReturnFuelEighths] = useState<number>(8);
  const [returnPhotosVerified, setReturnPhotosVerified] = useState<boolean>(true);
  const [cashPaidOnClose, setCashPaidOnClose] = useState<number>(0);
  const [posPaidOnClose, setPosPaidOnClose] = useState<number>(900);
  const [ibanPaidOnClose, setIbanPaidOnClose] = useState<number>(2000);

  const [walletPayAmount, setWalletPayAmount] = useState<number>(1000);
  const [walletFastRef, setWalletFastRef] = useState<string>('FAST-339104');
  const [walletPayChannel, setWalletPayChannel] = useState<'iban_fast' | 'pos_card'>('iban_fast');

  const [disputingPenaltyId, setDisputingPenaltyId] = useState<string | null>(null);
  const [disputeCategory, setDisputeCategory] = useState<string>('Nöbet Değişim Saati — Araç Bende Değildi');
  const [disputeEvidenceNote, setDisputeEvidenceNote] = useState<string>(
    'Belirtilen saatte vardiya devri yapılmıştı, taksimetre açılış fişi ve GPS kaydı ektedir.'
  );
  const [disputePhotoName, setDisputePhotoName] = useState<string>('taksimetre_fisi_ve_tutanak.jpg');
  const [disputeImagePreviewUrl, setDisputeImagePreviewUrl] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const photosCount = Object.values(verifiedPhotos).filter(Boolean).length;

  const brainResult = useMemo(() => {
    if (!currentDriver || !activeVehicleForStart) return null;
    return evaluate12DepartureGates({
      vehicle: activeVehicleForStart,
      driver: currentDriver,
      odometerOut,
      fuelLevelEighths,
      photosVerifiedCount: photosCount,
      newDriverReportedDamage,
      newDriverDamageNotes,
      taximeterSlipNo,
      posDeviceDelivered,
      contractApproved,
      contractPinCode,
      activeCustodies: custodies,
      openServiceCases: serviceCases,
    });
  }, [
    currentDriver,
    activeVehicleForStart,
    odometerOut,
    fuelLevelEighths,
    photosCount,
    newDriverReportedDamage,
    newDriverDamageNotes,
    taximeterSlipNo,
    posDeviceDelivered,
    contractApproved,
    contractPinCode,
    custodies,
    serviceCases,
  ]);

  if (!currentDriver) {
    return <div className="p-6 text-slate-600">Şoför profili yükleniyor...</div>;
  }

  const driverActiveOrPendingShift = shifts.find(
    (s) => s.driverId === currentDriver.id && (s.status === 'active' || s.status === 'pending_approval')
  );
  const activeShiftVehicle = driverActiveOrPendingShift
    ? vehicles.find((v) => v.id === driverActiveOrPendingShift.vehicleId)
    : null;

  const driverShiftsHistory = shifts.filter((s) => s.driverId === currentDriver.id);
  const driverPenalties = penalties.filter((p) => p.driverId === currentDriver.id);
  const driverLedgers = ledgerEntries.filter((l) => l.relatedDriverId === currentDriver.id);
  const erosionInfo = evaluateDepositErosionStatus(currentDriver);

  const totalAccruedTl = driverShiftsHistory.reduce((acc, s) => acc + (s.accrual || 0), 0);
  const totalCollectedTl = driverShiftsHistory.reduce((acc, s) => acc + (s.collection || 0), 0);

  const targetAccrual =
    slot === 'full_24h'
      ? Number(activeVehicleForStart?.daily24hRate || 4800)
      : slot === 'night_12h'
      ? Number(activeVehicleForStart?.dailyNightRate || 2600)
      : Number(activeVehicleForStart?.dailyDayRate || 2400);

  const blockingReasonsHumanReadable = useMemo(() => {
    if (!brainResult) return [];
    return brainResult.gates
      .filter((g) => g.severity === 'HARD_BLOCK')
      .map((g) => ({
        title: g.title,
        detail: g.message,
      }));
  }, [brainResult]);

  const handleVerifyQrHandoverCode = () => {
    if (qrHandoverCode.trim().length < 4) {
      setFeedback({ type: 'error', text: 'Lütfen geçerli bir 4 haneli nöbet devir kodu veya QR referansı girin.' });
      return;
    }
    const targetVeh =
      rosterAssignedVehicles[0] ||
      vehicles.find((v) => v.status === 'available' || v.status === 'in_custody') ||
      vehicles[0];
    if (targetVeh) {
      setQrVerifiedPlateId(targetVeh.id);
      setOdometerOut(targetVeh.lastOdometer);
      setFuelLevelEighths(targetVeh.lastReturnFuelEighths ?? 8);
      setFeedback({
        type: 'success',
        text: `${targetVeh.plate} plakalı araç için saha nöbet devir kodu (${qrHandoverCode}) doğrulandı. Son KM: ${targetVeh.lastOdometer.toLocaleString('tr-TR')}`,
      });
    }
  };

  const handleStartPreShift = async () => {
    if (!activeVehicleForStart || !brainResult) return;
    if (!brainResult.canDepart) {
      setFeedback({
        type: 'error',
        text: `Vardiya başlatılamadı: ${blockingReasonsHumanReadable.map((b) => b.detail).join(' · ')}`,
      });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      await submitPreShiftDepartureRequest({
        vehicleId: activeVehicleForStart.id,
        driverId: currentDriver.id,
        slot,
        type: slot === 'full_24h' ? '24 Saat Tek Şoför' : slot === 'night_12h' ? 'Gece (18:00-06:00)' : 'Gündüz (06:00-18:00)',
        accrual: targetAccrual,
        odometerOut,
        fuelLevelEighths,
        photosVerifiedCount: photosCount,
        taximeterSlipNo,
        posDeviceDelivered,
        contractPinCode,
        newDriverReportedDamage,
        newDriverDamageNotes,
        fuelDeficitAdjustmentTl: brainResult.fuelDeficitAdjustmentTl,
        unaccountedKm: brainResult.unaccountedKm,
      });
      setFeedback({
        type: 'success',
        text: `${activeVehicleForStart.plate} için 4 yön fotoğraf, KM ve sözleşme doğrulandı. Çıkış onayınız iletildi!`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Vardiya başlatılamadı.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendDailyRentPayment = async () => {
    if (!driverActiveOrPendingShift) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await recordDriverLedgerPayment(currentDriver.id, dailyPaymentAmount, 'debt_payment');
      if (dailyPaymentMethod === 'iban_fast') {
        setIbanPaidOnClose((prev) => prev + dailyPaymentAmount);
      } else if (dailyPaymentMethod === 'pos_settlement') {
        setPosPaidOnClose((prev) => prev + dailyPaymentAmount);
      } else {
        setCashPaidOnClose((prev) => prev + dailyPaymentAmount);
      }
      setActiveFieldSheet('none');
      setFeedback({
        type: 'success',
        text: `₺${dailyPaymentAmount.toLocaleString('tr-TR')} günlük yevmiye ödemeniz (${
          dailyPaymentMethod === 'iban_fast'
            ? `FAST Dekont: ${fastReceiptNo}`
            : dailyPaymentMethod === 'pos_settlement'
            ? 'POS Mahsup'
            : 'Gişe Nakit'
        }) Plaka Sahibi ve Merkezi Kasa ekranına anında işlendi.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ödeme bildirimi gönderilemedi.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const [emergencyLiveStatus, setEmergencyLiveStatus] = useState<{
    active: boolean;
    type: 'accident' | 'tow_truck';
    plate: string;
    step: 1 | 2 | 3 | 4;
    timestamp: string;
    location: string;
    frozenHours: number;
  } | null>(null);
  const [qrScannerOpen, setQrScannerOpen] = useState<boolean>(false);

  const activeDriverServiceCase = useMemo(() => {
    const vehId = activeShiftVehicle?.id || activeVehicleForStart?.id;
    if (!vehId) return null;
    return serviceCases.find((sc) => sc.vehicleId === vehId && sc.status === 'open') || null;
  }, [serviceCases, activeShiftVehicle, activeVehicleForStart]);

  const handleReportFieldBreakdownOrAccident = async () => {
    const targetVeh = activeShiftVehicle || activeVehicleForStart;
    if (!targetVeh) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const startKm = Number(
        driverActiveOrPendingShift?.odometerStart || targetVeh.lastOdometer || 100000
      );
      const currentKm = returnOdometer > startKm ? returnOdometer : startKm + workedHoursBeforeFreeze * 22;

      await enterService({
        vehicleId: targetVeh.id,
        entryOdometer: currentKm,
        reason: `[SAHA ${incidentCategory === 'accident' ? 'KAZA BİLDİRİMİ' : 'ÇEKİCİ & ARIZA'} - ${currentDriver.name}] Konum: ${incidentLocation} | ${
          needsTowTruck ? 'ACİL ÇEKİCİ TALEBİ' : 'Çekicisiz'
        } | ${incidentDescription}`,
        deliveredBy: currentDriver.name,
        provider: needsTowTruck ? 'Acil Saha Çekici & Merkez Sanayi Atölyesi' : 'Merkez Sanayi Atölyesi',
        estimatedExitAt: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
        costBearer: incidentCategory === 'accident' ? 'insurance' : 'company',
      });

      if (driverActiveOrPendingShift) {
        await closeShift(driverActiveOrPendingShift.id, {
          cashCollected: cashPaidOnClose,
          posCollected: posPaidOnClose,
          ibanCollected: ibanPaidOnClose,
          odometerEnd: currentKm,
          returnFuelEighths,
          lateHandoverMinutes: 0,
          earlyBreakdown: true,
          workedHours: workedHoursBeforeFreeze,
        });
      }

      setEmergencyLiveStatus({
        active: true,
        type: incidentCategory === 'accident' ? 'accident' : 'tow_truck',
        plate: targetVeh.plate,
        step: needsTowTruck ? 3 : 2,
        timestamp: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        location: incidentLocation,
        frozenHours: workedHoursBeforeFreeze,
      });

      setActiveFieldSheet('none');
      setFeedback({
        type: 'success',
        text: `Geçmiş olsun! ${targetVeh.plate} için ${
          incidentCategory === 'accident' ? 'Kaza Bildirimi' : 'Acil Çekici Çağrısı'
        } iletildi ve vardiyanız ${workedHoursBeforeFreeze} saatlik kıstelyevm ile donduruldu.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Arıza/kaza bildirimi işlenemedi.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFieldShiftHandoverOrClose = async () => {
    if (!driverActiveOrPendingShift || !activeShiftVehicle) return;
    if (handoverTarget === 'second_driver_field' && mutualHandoverPin.trim().length < 4) {
      setFeedback({
        type: 'error',
        text: 'Sahada ikinci şoföre devir için lütfen nöbet ortağınızın 4 haneli devir PIN kodunu girin.',
      });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const startKm = Number(driverActiveOrPendingShift.odometerStart || activeShiftVehicle.lastOdometer || 100000);
      const finalKm = returnOdometer >= startKm ? returnOdometer : startKm + 230;

      await closeShift(driverActiveOrPendingShift.id, {
        cashCollected: cashPaidOnClose,
        posCollected: posPaidOnClose,
        ibanCollected: ibanPaidOnClose,
        odometerEnd: finalKm,
        returnFuelEighths,
        lateHandoverMinutes: 0,
        earlyBreakdown: false,
        workedHours: 12,
      });

      if (handoverTarget === 'second_driver_field' && nextShiftDriverId) {
        const partnerDriver = drivers.find((d) => d.id === nextShiftDriverId);
        const nextSlot = driverActiveOrPendingShift.slot === 'day_12h' ? 'night_12h' : 'day_12h';
        const nextRate =
          nextSlot === 'night_12h'
            ? Number(activeShiftVehicle.dailyNightRate || 2600)
            : Number(activeShiftVehicle.dailyDayRate || 2400);
        const fuelDiscount = returnFuelEighths < 8 ? (8 - returnFuelEighths) * 250 : 0;

        await submitPreShiftDepartureRequest({
          vehicleId: activeShiftVehicle.id,
          driverId: nextShiftDriverId,
          slot: nextSlot,
          type: nextSlot === 'night_12h' ? 'Gece (18:00-06:00)' : 'Gündüz (06:00-18:00)',
          accrual: nextRate,
          odometerOut: finalKm,
          fuelLevelEighths: returnFuelEighths,
          photosVerifiedCount: 4,
          taximeterSlipNo: `DEVIR-${mutualHandoverPin}`,
          posDeviceDelivered: true,
          contractPinCode: mutualHandoverPin,
          newDriverReportedDamage: false,
          newDriverDamageNotes: '',
          fuelDeficitAdjustmentTl: fuelDiscount,
          unaccountedKm: 0,
        });

        setActiveFieldSheet('none');
        setFeedback({
          type: 'success',
          text: `Vardiyanız kapatıldı ve ${activeShiftVehicle.plate} plakalı araç sahada ${
            partnerDriver?.name || '2. Şoför'
          } adına (${finalKm.toLocaleString('tr-TR')} KM) karşılıklı PIN ile devredildi!`,
        });
      } else {
        setActiveFieldSheet('none');
        setFeedback({
          type: 'success',
          text: `Vardiyanız ve araç zimmetiniz (${finalKm.toLocaleString('tr-TR')} KM) başarıyla kapatıldı, araç durağa teslim edildi.`,
        });
      }
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Nöbet devri tamamlanamadı.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePayWalletDebt = async (kind: 'debt_payment' | 'deposit_payment') => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await recordDriverLedgerPayment(currentDriver.id, walletPayAmount, kind);
      setFeedback({
        type: 'success',
        text: `₺${walletPayAmount.toLocaleString('tr-TR')} tutarındaki ${
          kind === 'debt_payment' ? 'yevmiye / cari borç' : 'teminat tamamlama'
        } ödemeniz (${walletPayChannel === 'iban_fast' ? `IBAN FAST: ${walletFastRef}` : `POS: ${walletFastRef}`}) hesabınıza anında işlendi.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ödeme işlenemedi.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisputeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setDisputePhotoName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setDisputeImagePreviewUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitPhotoDispute = async (penaltyId: string) => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const fullReason = `[${disputeCategory}] ${disputeEvidenceNote} (Yüklenen Kanıt Görseli: ${disputePhotoName})`;
      await disputePenaltyIncident(penaltyId, fullReason);
      setDisputingPenaltyId(null);
      setDisputeImagePreviewUrl(null);
      setFeedback({
        type: 'success',
        text: 'Fotoğraflı ve kanıtlı itirazınız Operasyon İtiraz & Hukuk Masasına iletildi. İnceleme sonuçlanana kadar tahsilat durduruldu.',
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'İtiraz gönderilemedi.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 py-5 px-3 sm:px-4 flex flex-col items-center">
      {/* Compact Top Account Selector for Switching Driver Profiles */}
      <div className="w-full max-w-[440px] mb-3 bg-white border border-slate-200 rounded-2xl px-4 py-2.5 flex items-center justify-between gap-2 shadow-2xs">
        <span className="text-xs font-semibold text-slate-600 shrink-0">Aktif Şoför:</span>
        <select
          value={currentDriver.id}
          onChange={(e) => {
            setSelectedDriverId(e.target.value);
            setFeedback(null);
            setActiveFieldSheet('none');
          }}
          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900"
        >
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} · Puan: {d.trustScore ?? 92} · Borç: ₺{(d.currentDebt || 0).toLocaleString('tr-TR')}
            </option>
          ))}
        </select>
      </div>

      {/* Mobile-First Viewport Frame */}
      <div className="w-full max-w-[440px] bg-white rounded-[32px] border-[6px] border-slate-900 shadow-xl overflow-hidden flex flex-col min-h-[780px]">
        {/* Mobile App Header */}
        <div className="bg-slate-900 text-white px-5 pt-4 pb-4">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-2">
            <span>İSTANBUL TAKSİ SAHA</span>
            <span className="text-emerald-400">GPS · CANLI BAĞLANTI</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-base font-bold tracking-tight text-white">
                {currentDriver.name}
              </h1>
              <div className="flex items-center gap-2 text-xs text-slate-300 mt-0.5">
                <span>İBB: {currentDriver.ibbCardNo || 'IBB-34'}</span>
                <span>·</span>
                <span>Güven: {currentDriver.trustScore ?? 92}/100</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block">Güncel Cari Borç</span>
              <span
                className={`text-sm font-bold font-mono tabular-nums ${
                  (currentDriver.currentDebt || 0) > 0 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                ₺{(currentDriver.currentDebt || 0).toLocaleString('tr-TR')}
              </span>
            </div>
          </div>
        </div>

        {feedback && (
          <div
            className={`mx-4 mt-3 p-3.5 rounded-2xl border text-xs font-medium flex items-start justify-between gap-2 ${
              feedback.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}
          >
            <span>{feedback.text}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="font-bold underline shrink-0"
            >
              Kapat
            </button>
          </div>
        )}

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* TAB 1: 1. NÖBET & SAHA (QR/PIN module, Emergency/Tow Truck button) */}
          {activeTab === 'shift' && (
            <div className="space-y-4">
              {/* Dedicated Emergency Action Buttons: 'Kaza Bildirimi' and 'Çekici Çağrısı' */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    Acil Durum & Yevmiye Dondurma Merkezi
                  </span>
                  <span className="text-[10px] font-mono font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                    7/24 CANLI DESTEK
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIncidentCategory('accident');
                      setNeedsTowTruck(true);
                      setIncidentDescription('Maddi hasarlı trafik kazası meydana geldi, tutanak tutuluyor.');
                      setActiveFieldSheet(
                        activeFieldSheet === 'report_breakdown' && incidentCategory === 'accident'
                          ? 'none'
                          : 'report_breakdown'
                      );
                    }}
                    className="min-h-[50px] p-2.5 rounded-xl bg-red-600 text-white hover:bg-red-700 flex items-center gap-2.5 text-left transition-colors"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <div>
                      <span className="text-xs font-bold block leading-tight">Kaza Bildirimi</span>
                      <span className="text-[10px] text-red-100 block">Tutanak & Yevmiye Dondur</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIncidentCategory('breakdown');
                      setNeedsTowTruck(true);
                      setIncidentDescription('Araç arıza nedeniyle hareketsiz kaldı, acil çekici talep ediliyor.');
                      setActiveFieldSheet(
                        activeFieldSheet === 'report_breakdown' && incidentCategory === 'breakdown'
                          ? 'none'
                          : 'report_breakdown'
                      );
                    }}
                    className="min-h-[50px] p-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 flex items-center gap-2.5 text-left transition-colors"
                  >
                    <Wrench className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <span className="text-xs font-bold block leading-tight">Çekici Çağrısı</span>
                      <span className="text-[10px] text-slate-300 block">Canlı Konuma Kurtarıcı</span>
                    </div>
                  </button>
                </div>

                {/* Real-Time Emergency & Tow Truck Status Tracker */}
                {(emergencyLiveStatus?.active || activeDriverServiceCase) && (
                  <div className="bg-white border border-amber-300 rounded-xl p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-mono font-bold text-amber-700 uppercase block">
                          CANLI ACİL DURUM & ÇEKİCİ DURUMU
                        </span>
                        <span className="text-xs font-bold text-slate-900">
                          {emergencyLiveStatus?.plate || activeShiftVehicle?.plate || activeVehicleForStart?.plate} ·{' '}
                          {emergencyLiveStatus?.type === 'accident' ? 'Kaza & Eksper Süreci' : 'Acil Çekici & Sanayi Sevk'}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                        {emergencyLiveStatus?.timestamp || 'AKTİF'}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-[11px]">
                      {[
                        { step: 1 as const, label: '1. Kaza/Arıza Bildirimi & Canlı GPS Konumu Alındı' },
                        {
                          step: 2 as const,
                          label: `2. Vardiya Yevmiyesi Kıstelyevm (${emergencyLiveStatus?.frozenHours ?? workedHoursBeforeFreeze}s) Donduruldu`,
                        },
                        { step: 3 as const, label: '3. Kurtarıcı / Çekici Yola Çıktı (Tahmini Varış: 12 dk)' },
                        { step: 4 as const, label: '4. Merkez Sanayi İş Emri & Sigorta Dosyası Açıldı' },
                      ].map((st) => {
                        const currentStep = emergencyLiveStatus?.step ?? 3;
                        const isDone = st.step <= currentStep;
                        return (
                          <div key={st.step} className="flex items-center justify-between gap-2">
                            <span className={isDone ? 'font-semibold text-slate-900' : 'text-slate-400'}>
                              {st.label}
                            </span>
                            <span
                              className={`font-mono text-[10px] font-bold ${
                                isDone ? 'text-emerald-600' : 'text-slate-400'
                              }`}
                            >
                              {isDone ? 'TAMAM' : 'SIRADA'}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <span className="text-[11px] text-slate-500 truncate">
                        {emergencyLiveStatus?.location || incidentLocation}
                      </span>
                      {emergencyLiveStatus && emergencyLiveStatus.step < 4 && (
                        <button
                          type="button"
                          onClick={() =>
                            setEmergencyLiveStatus((prev) =>
                              prev ? { ...prev, step: 4 } : null
                            )
                          }
                          className="text-[11px] font-bold text-amber-700 hover:underline shrink-0 ml-2"
                        >
                          Teslimatı Onayla
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Emergency / Tow Truck Sheet */}
              {activeFieldSheet === 'report_breakdown' && (
                <div className="bg-red-50/90 border border-red-300 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-red-950 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      {incidentCategory === 'accident'
                        ? 'Kaza Bildirimi & Yevmiye Dondurma'
                        : 'Acil Çekici Çağrısı & Arıza Kaydı'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveFieldSheet('none')}
                      className="text-xs font-semibold text-red-700"
                    >
                      Vazgeç
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setIncidentCategory('accident')}
                      className={`min-h-[42px] rounded-xl text-xs font-bold border ${
                        incidentCategory === 'accident'
                          ? 'bg-red-700 text-white border-red-700'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      Kaza Bildirimi
                    </button>
                    <button
                      type="button"
                      onClick={() => setIncidentCategory('breakdown')}
                      className={`min-h-[42px] rounded-xl text-xs font-bold border ${
                        incidentCategory === 'breakdown'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      Çekici / Mekanik Arıza
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Canlı GPS Konumu
                    </label>
                    <input
                      type="text"
                      value={incidentLocation}
                      onChange={(e) => setIncidentLocation(e.target.value)}
                      className="w-full min-h-[42px] border border-slate-300 rounded-xl px-3 text-xs bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Olay / Arıza Açıklaması
                    </label>
                    <input
                      type="text"
                      value={incidentDescription}
                      onChange={(e) => setIncidentDescription(e.target.value)}
                      className="w-full min-h-[42px] border border-slate-300 rounded-xl px-3 text-xs bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 items-center bg-white p-3 rounded-xl border border-red-200">
                    <div>
                      <span className="text-xs font-semibold text-slate-800 block">
                        Çalışılan Süre (Saat)
                      </span>
                      <span className="text-[11px] text-emerald-700 font-medium">
                        Kıstelyevm: ₺
                        {Math.round(
                          ((driverActiveOrPendingShift?.accrual || targetAccrual) / 12) *
                            workedHoursBeforeFreeze
                        ).toLocaleString('tr-TR')}
                      </span>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={workedHoursBeforeFreeze}
                      onChange={(e) => setWorkedHoursBeforeFreeze(Number(e.target.value))}
                      className="w-full min-h-[42px] border border-slate-300 rounded-xl px-3 text-sm font-mono font-bold text-center"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs">
                    <label className="flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={needsTowTruck}
                        onChange={(e) => setNeedsTowTruck(e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                      Acil Çekici Gönderilsin
                    </label>
                    <label className="flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={incidentPhotoAttached}
                        onChange={(e) => setIncidentPhotoAttached(e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                      Tutanak Fotoğrafı Eklendi
                    </label>
                  </div>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleReportFieldBreakdownOrAccident}
                    className="w-full min-h-[46px] bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition-colors"
                  >
                    {isSubmitting
                      ? 'Sanayi ve Operasyona Bildiriliyor...'
                      : incidentCategory === 'accident'
                      ? 'Kaza Bildirimini Gönder & Yevmiyeyi Dondur'
                      : 'Çekici Çağır & Yevmiyeyi Dondur'}
                  </button>
                </div>
              )}

              {driverActiveOrPendingShift && activeShiftVehicle ? (
                <div className="space-y-4">
                  <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-medium text-amber-400 block">
                          {driverActiveOrPendingShift.status === 'pending_approval'
                            ? 'OPERASYON ÇIKIŞ ONAYI BEKLENİYOR'
                            : 'AKTİF VARDİYADASINIZ · İYİ YOLCULUKLAR'}
                        </span>
                        <h2 className="text-2xl font-bold font-mono tracking-tight mt-0.5">
                          {activeShiftVehicle.plate}
                        </h2>
                        <p className="text-xs text-slate-300">
                          {activeShiftVehicle.brand} {activeShiftVehicle.model} · {driverActiveOrPendingShift.type}
                        </p>
                      </div>
                      <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
                        <Car className="w-6 h-6" />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-800 text-xs">
                      <div>
                        <span className="text-slate-400 block">Çıkış KM</span>
                        <span className="font-mono font-bold tabular-nums">
                          {(driverActiveOrPendingShift.odometerStart || activeShiftVehicle.lastOdometer).toLocaleString('tr-TR')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Günlük Yevmiye</span>
                        <span className="font-mono font-bold text-amber-400 tabular-nums">
                          ₺{driverActiveOrPendingShift.accrual.toLocaleString('tr-TR')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Nöbet Değişimi</span>
                        <span className="font-mono font-bold">
                          {driverActiveOrPendingShift.slot === 'night_12h' ? '06:00 Sabah' : '18:00 Akşam'}
                        </span>
                      </div>
                    </div>

                    {driverActiveOrPendingShift.status === 'pending_approval' && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => approveShiftDeparture(driverActiveOrPendingShift.id)}
                          className="w-full min-h-[46px] bg-amber-500 text-slate-950 font-bold text-xs rounded-xl hover:bg-amber-400 transition-colors"
                        >
                          Operasyon Çıkış Onayını Tamamla ve Trafiğe Çık
                        </button>
                      </div>
                    )}
                  </div>

                  {driverActiveOrPendingShift.status === 'active' && (
                    <div className="space-y-2.5">
                      <span className="text-xs font-bold text-slate-700 block px-1">
                        Sahada Nöbet Devri & Yevmiye İşlemleri
                      </span>

                      <button
                        type="button"
                        onClick={() => {
                          setReturnOdometer(
                            (driverActiveOrPendingShift.odometerStart || activeShiftVehicle.lastOdometer) + 220
                          );
                          setActiveFieldSheet(
                            activeFieldSheet === 'handover_shift' ? 'none' : 'handover_shift'
                          );
                        }}
                        className="w-full min-h-[54px] p-3.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-between text-left transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                            <ArrowRightLeft className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="text-sm font-bold text-slate-900 block">
                              QR / PIN ile 2. Şoföre Nöbet Devri & Kapanış
                            </span>
                            <span className="text-xs text-slate-600">
                              Karşılıklı PIN koduyla nöbet ortağına veya durağa teslim et
                            </span>
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setDailyPaymentAmount(driverActiveOrPendingShift.accrual);
                          setActiveFieldSheet(
                            activeFieldSheet === 'pay_daily_rent' ? 'none' : 'pay_daily_rent'
                          );
                        }}
                        className="w-full min-h-[54px] p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-50 flex items-center justify-between text-left transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                            <Send className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="text-sm font-bold text-slate-900 block">
                              Günlük Yevmiye Gönder (IBAN FAST / POS)
                            </span>
                            <span className="text-xs text-slate-600">
                              Dekont numarası veya POS mahsubu ile anında bildir
                            </span>
                          </div>
                        </div>
                      </button>
                    </div>
                  )}

                  {activeFieldSheet === 'pay_daily_rent' && (
                    <div className="bg-slate-50 border border-emerald-300 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900">
                          Günlük Yevmiye Ödeme Bildirimi
                        </h3>
                        <button
                          type="button"
                          onClick={() => setActiveFieldSheet('none')}
                          className="text-xs font-semibold text-slate-500"
                        >
                          Kapat
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 bg-white p-1 rounded-xl border border-slate-200">
                        {[
                          { id: 'iban_fast' as const, label: 'IBAN FAST' },
                          { id: 'pos_settlement' as const, label: 'POS Mahsup' },
                          { id: 'cash_desk' as const, label: 'Gişe Nakit' },
                        ].map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setDailyPaymentMethod(m.id)}
                            className={`min-h-[40px] rounded-lg text-xs font-semibold transition-colors ${
                              dailyPaymentMethod === m.id
                                ? 'bg-slate-900 text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Gönderilen Tutar (₺)
                          </label>
                          <input
                            type="number"
                            value={dailyPaymentAmount}
                            onChange={(e) => setDailyPaymentAmount(Number(e.target.value))}
                            className="w-full min-h-[44px] border border-slate-300 rounded-xl px-3 text-sm font-mono font-bold bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            {dailyPaymentMethod === 'iban_fast' ? 'FAST Dekont No' : 'POS Yığın / Fiş No'}
                          </label>
                          <input
                            type="text"
                            value={fastReceiptNo}
                            onChange={(e) => setFastReceiptNo(e.target.value)}
                            className="w-full min-h-[44px] border border-slate-300 rounded-xl px-3 text-xs font-mono bg-white"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={handleSendDailyRentPayment}
                        className="w-full min-h-[48px] bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors"
                      >
                        {isSubmitting ? 'İşleniyor...' : 'Yevmiye Ödemesini Gönder ve Onayla'}
                      </button>
                    </div>
                  )}

                  {activeFieldSheet === 'handover_shift' && (
                    <div className="bg-slate-50 border border-slate-300 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900">
                          QR / PIN ile Nöbet Devir Teslim & Kapanış
                        </h3>
                        <button
                          type="button"
                          onClick={() => setActiveFieldSheet('none')}
                          className="text-xs font-semibold text-slate-500"
                        >
                          Kapat
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setHandoverTarget('second_driver_field')}
                          className={`min-h-[44px] rounded-xl text-xs font-bold border ${
                            handoverTarget === 'second_driver_field'
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          2. Şoföre Sahada Devret
                        </button>
                        <button
                          type="button"
                          onClick={() => setHandoverTarget('station_garage')}
                          className={`min-h-[44px] rounded-xl text-xs font-bold border ${
                            handoverTarget === 'station_garage'
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          Durağa / Garaja Bırak
                        </button>
                      </div>

                      {handoverTarget === 'second_driver_field' && (
                        <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              Aracı Devralan Nöbet Ortağı (2. Şoför)
                            </label>
                            <select
                              value={nextShiftDriverId}
                              onChange={(e) => setNextShiftDriverId(e.target.value)}
                              className="w-full min-h-[44px] border border-slate-300 rounded-xl px-3 text-xs font-semibold"
                            >
                              {drivers
                                .filter((d) => d.id !== currentDriver.id && d.status !== 'suspended')
                                .map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.name} (Güven Puanı: {d.trustScore ?? 90}/100)
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              2. Şoförün Karşılıklı Devir Onay PIN / QR Kodu
                            </label>
                            <input
                              type="text"
                              maxLength={6}
                              value={mutualHandoverPin}
                              onChange={(e) => setMutualHandoverPin(e.target.value)}
                              className="w-full min-h-[44px] border border-slate-300 rounded-xl px-3 text-sm font-mono font-bold tracking-widest text-center"
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Teslim Kilometresi
                          </label>
                          <input
                            type="number"
                            value={returnOdometer}
                            onChange={(e) => setReturnOdometer(Number(e.target.value))}
                            className="w-full min-h-[44px] border border-slate-300 rounded-xl px-3 text-sm font-mono font-bold bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">
                            Bırakılan Yakıt Seviyesi
                          </label>
                          <select
                            value={returnFuelEighths}
                            onChange={(e) => setReturnFuelEighths(Number(e.target.value))}
                            className="w-full min-h-[44px] border border-slate-300 rounded-xl px-3 text-xs font-semibold bg-white"
                          >
                            <option value={8}>8/8 Tam Dolu</option>
                            <option value={7}>7/8 (-₺250 Fark)</option>
                            <option value={6}>6/8 (-₺500 Fark)</option>
                            <option value={4}>4/8 Yarım (-₺1.000 Fark)</option>
                          </select>
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-xs font-medium text-slate-800 bg-white p-3 rounded-xl border border-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={returnPhotosVerified}
                          onChange={(e) => setReturnPhotosVerified(e.target.checked)}
                          className="w-4 h-4 rounded"
                        />
                        4 Yön Dönüş Fotoğrafı & İç Temizlik Doğrulandı
                      </label>

                      <button
                        type="button"
                        disabled={isSubmitting || !returnPhotosVerified}
                        onClick={handleFieldShiftHandoverOrClose}
                        className="w-full min-h-[48px] bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 disabled:opacity-40 transition-colors"
                      >
                        {isSubmitting
                          ? 'Devir Kaydediliyor...'
                          : handoverTarget === 'second_driver_field'
                          ? 'Karşılıklı PIN ile 2. Şoföre Sahada Devret'
                          : 'Vardiyayı Bitir ve Durağa Teslim Et'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* QR / PIN Handover Mode Selector */}
                  <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-2xl">
                    <button
                      type="button"
                      onClick={() => setTakeoverMode('assigned')}
                      className={`min-h-[44px] rounded-xl text-xs font-bold transition-colors ${
                        takeoverMode === 'assigned'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Atanmış Plakam
                    </button>
                    <button
                      type="button"
                      onClick={() => setTakeoverMode('qr_pin')}
                      className={`min-h-[44px] rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                        takeoverMode === 'qr_pin'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      QR / PIN ile Devral
                    </button>
                  </div>

                  {takeoverMode === 'qr_pin' && (
                    <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <KeyRound className="w-4 h-4 text-amber-700" />
                          <span className="text-xs font-bold text-slate-900">
                            QR / PIN ile Saha Nöbet Devri
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setQrScannerOpen((prev) => !prev);
                            if (!qrScannerOpen) {
                              setQrHandoverCode('VRD-4829');
                              handleVerifyQrHandoverCode();
                            }
                          }}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-900 text-white hover:bg-slate-800 flex items-center gap-1"
                        >
                          <QrCode className="w-3 h-3 text-amber-400" />
                          {qrScannerOpen ? 'Kamerayı Kapat' : 'QR Okut'}
                        </button>
                      </div>

                      {qrScannerOpen && (
                        <div className="bg-slate-900 text-white rounded-xl p-3 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400 flex items-center justify-center">
                              <QrCode className="w-4 h-4 text-amber-400" />
                            </div>
                            <div>
                              <span className="font-bold block">Kamera QR Tarayıcı Aktif</span>
                              <span className="text-[11px] text-slate-300">
                                Önceki şoförün ekranındaki QR kodu okutuldu: {qrHandoverCode}
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono font-bold text-emerald-400">
                            EŞLEŞTİ
                          </span>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={qrHandoverCode}
                          onChange={(e) => setQrHandoverCode(e.target.value)}
                          placeholder="PIN veya QR Kodu (Örn: VRD-4829)"
                          className="flex-1 min-h-[44px] border border-amber-300 rounded-xl px-3 text-sm font-mono font-bold bg-white"
                        />
                        <button
                          type="button"
                          onClick={handleVerifyQrHandoverCode}
                          className="min-h-[44px] px-4 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 shrink-0"
                        >
                          PIN Doğrula
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-1">
                        <span className="text-slate-600">Canlı Devir Durumu:</span>
                        <span
                          className={`font-mono font-bold ${
                            qrVerifiedPlateId ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {qrVerifiedPlateId
                            ? `DOĞRULANDI (${activeVehicleForStart?.plate})`
                            : 'QR / PIN ONAYI BEKLENİYOR'}
                        </span>
                      </div>
                    </div>
                  )}

                  {activeVehicleForStart && (
                    <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[11px] text-amber-400 font-semibold block">
                            {takeoverMode === 'qr_pin'
                              ? 'SAHA DEVİR KODUYLA EŞLEŞEN PLAKA'
                              : 'SİZE ATANMIŞ NÖBET PLAKASI'}
                          </span>
                          <h2 className="text-2xl font-bold font-mono tracking-tight">
                            {activeVehicleForStart.plate}
                          </h2>
                          <p className="text-xs text-slate-300">
                            {activeVehicleForStart.brand} {activeVehicleForStart.model} ·{' '}
                            {activeVehicleForStart.stopName || 'Merkez Durak'}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 block">Son Teslim KM</span>
                          <span className="text-sm font-mono font-bold tabular-nums">
                            {activeVehicleForStart.lastOdometer.toLocaleString('tr-TR')} KM
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-800">
                        {[
                          {
                            id: 'day_12h' as const,
                            label: 'Gündüz (06-18)',
                            rate: activeVehicleForStart.dailyDayRate || 2400,
                          },
                          {
                            id: 'night_12h' as const,
                            label: 'Gece (18-06)',
                            rate: activeVehicleForStart.dailyNightRate || 2600,
                          },
                          {
                            id: 'full_24h' as const,
                            label: '24 Saat Tam',
                            rate: activeVehicleForStart.daily24hRate || 4800,
                          },
                        ].map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSlot(s.id)}
                            className={`py-2 px-2 rounded-xl text-left transition-colors ${
                              slot === s.id
                                ? 'bg-amber-500 text-slate-950 font-bold'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            <span className="text-[11px] block truncate">{s.label}</span>
                            <span className="text-xs font-mono font-bold tabular-nums">
                              ₺{s.rate.toLocaleString('tr-TR')}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
                    <h3 className="text-sm font-bold text-slate-900">
                      1. 4 Yön Kamera, KM & Yakıt Doğrulaması
                    </h3>

                    <div className="grid grid-cols-2 gap-2.5">
                      {[
                        { key: 'front', label: 'Ön Görünüm' },
                        { key: 'rear', label: 'Arka Görünüm' },
                        { key: 'left', label: 'Sol Yan' },
                        { key: 'right', label: 'Sağ Yan' },
                      ].map((side) => {
                        const isOk = verifiedPhotos[side.key];
                        return (
                          <button
                            key={side.key}
                            type="button"
                            onClick={() =>
                              setVerifiedPhotos((prev) => ({ ...prev, [side.key]: !prev[side.key] }))
                            }
                            className={`min-h-[52px] p-3 rounded-xl border text-left flex items-center justify-between transition-colors ${
                              isOk
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                                : 'bg-white border-slate-300 text-slate-600'
                            }`}
                          >
                            <div>
                              <span className="text-xs font-bold block">{side.label}</span>
                              <span className="text-[10px] font-medium">
                                {isOk ? 'Kamera Çekildi' : 'Fotoğraf Çek'}
                              </span>
                            </div>
                            <Camera className="w-4 h-4 shrink-0" />
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Çıkış Kilometresi
                        </label>
                        <input
                          type="number"
                          value={odometerOut}
                          onChange={(e) => setOdometerOut(Number(e.target.value))}
                          className="w-full min-h-[44px] border border-slate-300 rounded-xl px-3 text-sm font-mono font-bold bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Teslim Alınan Yakıt
                        </label>
                        <select
                          value={fuelLevelEighths}
                          onChange={(e) => setFuelLevelEighths(Number(e.target.value))}
                          className="w-full min-h-[44px] border border-slate-300 rounded-xl px-2.5 text-xs font-semibold bg-white"
                        >
                          <option value={8}>8/8 Tam Dolu</option>
                          <option value={7}>7/8 (-₺250 İndirim)</option>
                          <option value={6}>6/8 (-₺500 İndirim)</option>
                          <option value={4}>4/8 Yarım (-₺1.000 İndirim)</option>
                        </select>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newDriverReportedDamage}
                          onChange={(e) => setNewDriverReportedDamage(e.target.checked)}
                          className="w-4 h-4 rounded"
                        />
                        Önceki şoförden kalan vuruk/çizik var (Bana yazılmasın)
                      </label>
                      {newDriverReportedDamage && (
                        <input
                          type="text"
                          placeholder="Hasar yeri ve fotoğraf notu (Örn: Sağ arka çamurluk sürtme)"
                          value={newDriverDamageNotes}
                          onChange={(e) => setNewDriverDamageNotes(e.target.value)}
                          className="w-full min-h-[40px] border border-slate-300 rounded-lg px-3 text-xs"
                        />
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                    <h3 className="text-sm font-bold text-slate-900">
                      2. Taksimetre Fişi, POS & Dijital Sözleşme Onayı
                    </h3>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Taksimetre Açılış Fiş No
                        </label>
                        <input
                          type="text"
                          value={taximeterSlipNo}
                          onChange={(e) => setTaximeterSlipNo(e.target.value)}
                          className="w-full min-h-[44px] border border-slate-300 rounded-xl px-3 text-xs font-mono font-bold bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          4 Haneli Şoför PIN Kodu
                        </label>
                        <input
                          type="text"
                          maxLength={4}
                          value={contractPinCode}
                          onChange={(e) => setContractPinCode(e.target.value)}
                          className="w-full min-h-[44px] border border-slate-300 rounded-xl px-3 text-sm font-mono font-bold text-center tracking-widest bg-white"
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2.5 text-xs font-medium text-slate-800 bg-white p-3 rounded-xl border border-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={posDeviceDelivered}
                        onChange={(e) => setPosDeviceDelivered(e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                      Araç İçi POS Cihazı, Ruhsat ve Taksimetre Mührü Sağlam Teslim Alındı
                    </label>

                    <label className="flex items-center gap-2.5 text-xs font-medium text-slate-800 bg-white p-3 rounded-xl border border-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={contractApproved}
                        onChange={(e) => setContractApproved(e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                      Dijital Zimmet ve Vardiya Sorumluluk Sözleşmesini Onaylıyorum
                    </label>
                  </div>

                  {blockingReasonsHumanReadable.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
                      <span className="text-xs font-bold text-red-900 block">
                        Çıkış İçin Tamamlanması Gereken Eksikler:
                      </span>
                      {blockingReasonsHumanReadable.map((item, idx) => (
                        <div key={idx} className="text-xs text-red-800">
                          <span className="font-bold">{item.title}:</span> {item.detail}
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={!brainResult?.canDepart || isSubmitting}
                    onClick={handleStartPreShift}
                    className="w-full min-h-[52px] bg-slate-900 text-white rounded-2xl text-sm font-bold hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 transition-colors"
                  >
                    {isSubmitting
                      ? 'Çıkış Onayına Gönderiliyor...'
                      : brainResult?.canDepart
                      ? `Vardiyayı Başlat (${activeVehicleForStart?.plate} · ₺${(
                          targetAccrual - (brainResult?.fuelDeficitAdjustmentTl || 0)
                        ).toLocaleString('tr-TR')})`
                      : 'Eksikleri Tamamlayarak Vardiyayı Başlatın'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: 2. CARİ & YEVMİYE (Payment status display & payment notification) */}
          {activeTab === 'wallet' && (
            <div className="space-y-4">
              {/* Payment Status Summary Card */}
              <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400 block">Güncel Cari Borç Durumu</span>
                    <span className="text-2xl font-bold font-mono tabular-nums text-amber-400">
                      ₺{(currentDriver.currentDebt || 0).toLocaleString('tr-TR')}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Net Kalan Teminat</span>
                    <span className="text-lg font-bold font-mono tabular-nums text-emerald-400">
                      ₺{erosionInfo.netDepositRemainingTl.toLocaleString('tr-TR')}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-400 block">Toplam Yevmiye Tahakkuku</span>
                    <span className="font-mono font-bold text-white">
                      ₺{totalAccruedTl.toLocaleString('tr-TR')}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 block">Ödenen Yevmiye Toplamı</span>
                    <span className="font-mono font-bold text-emerald-400">
                      ₺{totalCollectedTl.toLocaleString('tr-TR')}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-300">
                  <span>Yatırılan Depozito: ₺{(currentDriver.depositPaid || 0).toLocaleString('tr-TR')}</span>
                  <span
                    className={`font-bold ${
                      (currentDriver.currentDebt || 0) === 0 ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {(currentDriver.currentDebt || 0) === 0 ? 'ÖDEMELER TAM' : 'ÖDEME BEKLİYOR'}
                  </span>
                </div>
              </div>

              {/* Payment Notification Form */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-slate-900">
                  Yevmiye, Cari Borç & Teminat Ödeme Bildirimi
                </h3>
                <div className="grid grid-cols-2 gap-1.5 bg-white p-1 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setWalletPayChannel('iban_fast')}
                    className={`min-h-[38px] rounded-lg text-xs font-bold transition-colors ${
                      walletPayChannel === 'iban_fast'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    IBAN FAST Dekontu
                  </button>
                  <button
                    type="button"
                    onClick={() => setWalletPayChannel('pos_card')}
                    className={`min-h-[38px] rounded-lg text-xs font-bold transition-colors ${
                      walletPayChannel === 'pos_card'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    POS / Kart Mahsubu
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Ödeme Tutarı (₺)
                    </label>
                    <input
                      type="number"
                      min={100}
                      step={100}
                      value={walletPayAmount}
                      onChange={(e) => setWalletPayAmount(Number(e.target.value))}
                      className="w-full min-h-[44px] border border-slate-300 rounded-xl px-3 text-sm font-mono font-bold bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      {walletPayChannel === 'iban_fast' ? 'FAST Dekont No' : 'POS Fiş Referansı'}
                    </label>
                    <input
                      type="text"
                      value={walletFastRef}
                      onChange={(e) => setWalletFastRef(e.target.value)}
                      className="w-full min-h-[44px] border border-slate-300 rounded-xl px-3 text-xs font-mono bg-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handlePayWalletDebt('debt_payment')}
                    className="min-h-[46px] bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 disabled:opacity-40"
                  >
                    Yevmiye / Cari Borç Öde
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handlePayWalletDebt('deposit_payment')}
                    className="min-h-[46px] bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700"
                  >
                    Teminat Ekle
                  </button>
                </div>
              </div>

              {/* Statement of Shifts & Payments */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-slate-900">
                  Günlük Yevmiye, Borç & Depozito Hareketleri Ekstresi
                </h3>

                <div className="divide-y divide-slate-100">
                  {driverShiftsHistory.map((sh) => {
                    const v = vehicles.find((veh) => veh.id === sh.vehicleId);
                    const shortfall = Math.max(0, sh.accrual - sh.collection);
                    return (
                      <div key={sh.id} className="py-3 flex items-center justify-between gap-2 text-xs">
                        <div>
                          <span className="font-bold text-slate-900 block">
                            {v?.plate || '34 TXX'} · {sh.type}
                          </span>
                          <span className="text-slate-500">
                            Tahakkuk: ₺{sh.accrual.toLocaleString('tr-TR')} · Ödenen: ₺
                            {sh.collection.toLocaleString('tr-TR')}
                          </span>
                        </div>
                        <div className="text-right font-mono font-bold tabular-nums">
                          {shortfall > 0 ? (
                            <span className="text-red-600">-₺{shortfall.toLocaleString('tr-TR')} Eksik</span>
                          ) : (
                            <span className="text-emerald-600">Tam Ödendi</span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {driverLedgers.map((item) => (
                    <div key={item.id} className="py-3 flex items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-bold text-slate-900 block">
                          {item.type === 'collection' ? 'Yevmiye / Cari Tahsilat' : 'Tahakkuk / Masraf'}
                        </span>
                        <span className="text-slate-500">{item.description || item.paymentMethod}</span>
                      </div>
                      <span
                        className={`font-mono font-bold tabular-nums ${
                          item.type === 'collection' ? 'text-emerald-600' : 'text-red-600'
                        }`}
                      >
                        ₺{item.amount.toLocaleString('tr-TR')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: 3. İTİRAZLAR (Image upload for fine disputes) */}
          {activeTab === 'penalties' && (
            <div className="space-y-4">
              <div className="bg-slate-900 text-white rounded-2xl p-4">
                <h2 className="text-sm font-bold">HGS, EDS Trafik Cezası & Hasar Rücu İtirazları</h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Vardiya saatiniz dışında kesilen cezalara taksimetre fişi veya kaza tutanağı fotoğrafı yükleyerek itiraz edebilirsiniz
                </p>
              </div>

              {driverPenalties.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <span className="text-sm font-bold text-slate-900 block">
                    Adınıza Kayıtlı Ceza veya Hasar Yok
                  </span>
                  <span className="text-xs text-slate-500 block">
                    Tüm vardiya geçişleriniz ve HGS bakiyeleriniz temiz.
                  </span>
                </div>
              ) : (
                <div className="space-y-3">
                  {driverPenalties.map((pen) => (
                    <div
                      key={pen.id}
                      className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-xs font-mono font-bold text-slate-900">
                            {pen.plate} · {pen.documentNo}
                          </span>
                          <p className="text-xs text-slate-600 mt-0.5">{pen.description}</p>
                          <span className="text-[11px] text-slate-400 block mt-1">
                            İhlal Zamanı: {pen.violationAt}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-bold font-mono text-red-600 tabular-nums block">
                            ₺{pen.totalCharge.toLocaleString('tr-TR')}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-600">
                            {pen.status === 'disputed'
                              ? 'İtiraz İncelemede'
                              : pen.status === 'collected'
                              ? 'Ödendi'
                              : pen.status === 'cancelled'
                              ? 'İptal Edildi'
                              : 'Ödeme Bekliyor'}
                          </span>
                        </div>
                      </div>

                      {pen.disputeReason && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-900">
                          <span className="font-bold">Fotoğraflı İtirazınız:</span> {pen.disputeReason}
                        </div>
                      )}

                      {pen.status === 'pending_collection' && (
                        <>
                          {disputingPenaltyId === pen.id ? (
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                              <label className="block text-xs font-bold text-slate-800">
                                İtiraz Gerekçesi Seçin
                              </label>
                              <select
                                value={disputeCategory}
                                onChange={(e) => setDisputeCategory(e.target.value)}
                                className="w-full min-h-[42px] border border-slate-300 rounded-lg px-2.5 text-xs bg-white"
                              >
                                <option value="Nöbet Değişim Saati — Araç Bende Değildi">
                                  Nöbet Değişim Saati — Araç Bende Değildi
                                </option>
                                <option value="Taksimetre Fişi & GPS Farklı Güzergahta">
                                  Taksimetre Fişi & GPS Farklı Güzergahta
                                </option>
                                <option value="Kaza Tutanağında %0 Kusurluyum">
                                  Kaza Tutanağında %0 Kusurluyum
                                </option>
                                <option value="HGS / Gişe Okuma Hatası">
                                  HGS / Gişe Okuma Hatası
                                </option>
                              </select>

                              <input
                                type="text"
                                value={disputeEvidenceNote}
                                onChange={(e) => setDisputeEvidenceNote(e.target.value)}
                                placeholder="Kanıt açıklaması girin..."
                                className="w-full min-h-[42px] border border-slate-300 rounded-lg px-2.5 text-xs bg-white"
                              />

                              <div className="bg-white border border-dashed border-slate-300 rounded-lg p-3 space-y-2">
                                <label className="flex items-center justify-between gap-2 text-xs cursor-pointer">
                                  <div className="flex items-center gap-2">
                                    <Upload className="w-4 h-4 text-emerald-600 shrink-0" />
                                    <span className="font-mono text-[11px] text-slate-700 truncate">
                                      {disputePhotoName}
                                    </span>
                                  </div>
                                  <span className="text-[11px] font-bold text-amber-700 shrink-0">
                                    Görsel Seç / Çek
                                  </span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleDisputeFileChange}
                                    className="hidden"
                                  />
                                </label>
                                {disputeImagePreviewUrl && (
                                  <img
                                    src={disputeImagePreviewUrl}
                                    alt="İtiraz Kanıt Görseli"
                                    className="w-full h-24 object-cover rounded-lg border border-slate-200"
                                  />
                                )}
                              </div>

                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleSubmitPhotoDispute(pen.id)}
                                  className="flex-1 min-h-[42px] bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700"
                                >
                                  Fotoğraflı İtirazı Gönder
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDisputingPenaltyId(null)}
                                  className="min-h-[42px] px-3 border border-slate-300 text-xs font-semibold rounded-lg bg-white"
                                >
                                  İptal
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDisputingPenaltyId(pen.id)}
                              className="w-full min-h-[44px] border border-amber-300 bg-amber-50 text-amber-900 text-xs font-bold rounded-xl hover:bg-amber-100 transition-colors"
                            >
                              Fotoğraflı & Kanıtlı İtiraz Et
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: 4. CÜZDAN & KARNELER (Credential and work history view) */}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400 block">Ömür Boyu Şoför Güven Karnesi</span>
                    <span className="text-2xl font-bold font-mono text-emerald-400">
                      {currentDriver.trustScore ?? 92} / 100 Puan
                    </span>
                  </div>
                  <Award className="w-8 h-8 text-amber-400" />
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-400 block">Tamamlanan</span>
                    <span className="font-mono font-bold">
                      {currentDriver.lifetimeShiftsCompleted ?? 142} Nöbet
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Son 24s Çalışma</span>
                    <span className="font-mono font-bold">
                      {currentDriver.hoursWorkedLast24h ?? 0} / 10 Saat
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Kusurlu Kaza</span>
                    <span className="font-mono font-bold">
                      {currentDriver.lifetimeFaultyAccidents ?? 0} Kayıt
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-slate-900">
                  Resmi Belgelerim & Dijital Sözleşme Cüzdanı
                </h3>
                <div className="divide-y divide-slate-100 text-xs">
                  {[
                    {
                      title: 'İBB TUHİM Şoför Kartı',
                      no: currentDriver.ibbCardNo || 'IBB-34-88412',
                      expiry: currentDriver.ibbCardExpiry || '2027-11-30',
                    },
                    {
                      title: 'Sürücü Belgesi (Ehliyet)',
                      no: `TC: ${currentDriver.tc}`,
                      expiry: currentDriver.licenseExpiry || '2029-05-14',
                    },
                    {
                      title: 'SRC-2 Ticari Yolcu Taşıma',
                      no: 'SRC2-IST-904',
                      expiry: currentDriver.srcExpiry || '2028-04-20',
                    },
                    {
                      title: 'Psikoteknik Değerlendirme',
                      no: 'PSK-2026-88',
                      expiry: currentDriver.psychotechnicExpiry || '2028-04-20',
                    },
                  ].map((docItem, idx) => (
                    <div key={idx} className="py-2.5 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900 block">{docItem.title}</span>
                        <span className="text-slate-500 font-mono">{docItem.no}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-semibold text-slate-800 block">
                          Bitiş: {docItem.expiry}
                        </span>
                        <span className="text-[11px] text-emerald-600 font-semibold">
                          Doğrulandı
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Work History & Monthly Shift Calendar */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-slate-600" />
                    Aylık Çalışma Geçmişi & Nöbet Takvimi
                  </h3>
                  <span className="text-xs font-mono font-semibold text-emerald-700">
                    26 Nöbet Tamamlandı
                  </span>
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {Array.from({ length: 30 }, (_, i) => {
                    const dayNum = i + 1;
                    const status =
                      dayNum % 7 === 0 ? 'rest' : dayNum === 16 ? 'active' : 'completed';
                    return (
                      <div
                        key={dayNum}
                        className={`py-2 rounded-lg text-center border text-[11px] font-mono font-bold ${
                          status === 'active'
                            ? 'bg-amber-500 text-slate-950 border-amber-600'
                            : status === 'rest'
                            ? 'bg-slate-50 text-slate-400 border-slate-200'
                            : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                        }`}
                      >
                        <span className="block">{dayNum} Eki</span>
                        <span className="text-[9px] font-sans font-medium">
                          {status === 'active' ? 'Bugün' : status === 'rest' ? 'İzin' : '12s Tam'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Fixed 4-Tab Bottom Navigation Bar */}
        <div className="bg-white border-t border-slate-200 grid grid-cols-4 h-16 px-2 shrink-0">
          {[
            { id: 'shift' as const, label: '1. Nöbet & Saha', icon: Car },
            { id: 'wallet' as const, label: '2. Cari & Yevmiye', icon: Wallet },
            {
              id: 'penalties' as const,
              label: `3. İtirazlar (${driverPenalties.length})`,
              icon: ShieldAlert,
            },
            { id: 'documents' as const, label: '4. Cüzdan & Karneler', icon: FileCheck2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors ${
                  isActive ? 'text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-amber-600' : 'text-slate-400'}`} />
                <span className="text-[10px] mt-1 tracking-tight whitespace-nowrap truncate">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
