import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Car,
  Lock,
  UserCheck,
  CreditCard,
  Play,
  X,
} from 'lucide-react';
import { useDataStore } from '../../store/dataStore';
import {
  calculateFleetIdleLossRadar,
  matchBestSpareDrivers,
  evaluateDepositErosionStatus,
} from '../../services/decisionEngine';
import DriverMobilePortalScreen from '../../components/DriverMobilePortalScreen';
import OwnerLivePortalScreen from '../owner-portal/OwnerLivePortalScreen';

export default function CommandCenterScreen() {
  const navigate = useNavigate();
  const activePortal = useDataStore((state) => state.activePortal);
  const setActivePortal = useDataStore((state) => state.setActivePortal);

  const vehicles = useDataStore((state) => state.vehicles);
  const drivers = useDataStore((state) => state.drivers);
  const shifts = useDataStore((state) => state.shifts);
  const custodies = useDataStore((state) => state.custodies);
  const penalties = useDataStore((state) => state.penalties);

  const approveShiftDeparture = useDataStore((state) => state.approveShiftDeparture);
  const addShift = useDataStore((state) => state.addShift);
  const offsetDriverDebtFromDeposit = useDataStore((state) => state.offsetDriverDebtFromDeposit);

  const [isDayCloseOpen, setIsDayCloseOpen] = useState(false);
  const [isClosingDay, setIsClosingDay] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [spareAssignVehicleId, setSpareAssignVehicleId] = useState<string | null>(null);

  const idleLossRadar = useMemo(() => calculateFleetIdleLossRadar(vehicles), [vehicles]);
  const bestSpareDrivers = useMemo(
    () => matchBestSpareDrivers(drivers, custodies),
    [drivers, custodies]
  );

  // Render Role 2 or Role 3 directly if selected in Top Bar
  if (activePortal === 'driver_mobile') {
    return <DriverMobilePortalScreen />;
  }
  if (activePortal === 'plate_owner') {
    return <OwnerLivePortalScreen />;
  }

  const pendingApprovalShifts = shifts.filter((s) => s.status === 'pending_approval');
  const activeShifts = shifts.filter((s) => s.status === 'active');
  const activeVehiclesCount = vehicles.filter(
    (v) => v.status === 'in_shift' || v.status === 'in_custody'
  ).length;

  const totalIdleLossTl = idleLossRadar.reduce((acc, item) => acc + item.idleLossTl, 0);
  const totalCollectedTodayTl = shifts.reduce((acc, s) => acc + Number(s.collection || 0), 0);
  const totalAccrualTodayTl = shifts.reduce((acc, s) => acc + Number(s.accrual || 0), 0);

  const criticalErosionDrivers = drivers.filter(
    (d) => evaluateDepositErosionStatus(d).isCriticalErosion
  );
  const disputedPenalties = penalties.filter((p) => p.status === 'disputed');

  const handleOneClickApprove = async (shiftId: string) => {
    setFeedback(null);
    try {
      await approveShiftDeparture(shiftId);
      setFeedback({
        type: 'success',
        text: '12-Kapılı çıkış onayı verildi: Vardiya ve Zimmet atomik olarak başlatıldı.',
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Çıkış onayı verilemedi.',
      });
    }
  };

  const handleAssignSpareDriver = async (vehicleId: string, driverId: string) => {
    const v = vehicles.find((item) => item.id === vehicleId);
    const d = drivers.find((item) => item.id === driverId);
    if (!v || !d) return;
    setFeedback(null);
    try {
      await addShift({
        vehicleId: v.id,
        driverId: d.id,
        type: 'Gündüz (12 Saat)',
        slot: 'day_12h',
        accrual: Number(v.dailyDayRate || 2400),
        collection: 0,
        startedAt: new Date().toISOString(),
        status: 'active',
      });
      setSpareAssignVehicleId(null);
      setFeedback({
        type: 'success',
        text: `${v.plate} plakasına en yüksek güven puanlı yedek şoför (${d.name} · Güven: ${d.trustScore ?? 95}) atandı ve yatak zararı durduruldu.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Yedek şoför ataması başarısız.',
      });
    }
  };

  const handleExecuteDayClose = async () => {
    setIsClosingDay(true);
    setFeedback(null);
    try {
      const { dbService } = await import('../../services/dbService');
      await dbService.handleDayClose();
      setIsDayCloseOpen(false);
      setFeedback({
        type: 'success',
        text: 'Gün sonu kapanışı SHA-256 kriptografik zincir ile mühürlendi.',
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gün kapanışı engellendi.',
      });
    } finally {
      setIsClosingDay(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Operasyon Komuta Merkezi & Merkezi Karar Beyni
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            12-Kapılı çıkış onay kuyruğu, 500 plaka canlı matris, yatak zarar radarı ve akıllı yedek şoför eşleştirici
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActivePortal('driver_mobile')}
            className="px-3.5 py-2 border border-slate-300 bg-white text-slate-800 text-xs font-semibold rounded-lg hover:bg-slate-50 whitespace-nowrap"
          >
            + Şoför Mobil Çıkış Doğrulaması Aç
          </button>
          <button
            type="button"
            onClick={() => setIsDayCloseOpen(true)}
            className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 whitespace-nowrap"
          >
            SHA-256 Gün Sonu Kapanışı
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between ${
            feedback.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <p className="text-xs font-medium whitespace-pre-line">{feedback.text}</p>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold underline ml-4 shrink-0"
          >
            Kapat
          </button>
        </div>
      )}

      {/* 4 Clean KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">Çıkış Onayı Bekleyen Kuyruk</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-amber-600">
              {pendingApprovalShifts.length} Araç
            </span>
            <span className="text-xs text-slate-500">12-Kapı Doğrulamalı</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">Sahadaki Aktif Taksiler</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-emerald-600">
              {activeVehiclesCount} / {vehicles.length}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              Aktif Vardiya: {activeShifts.length}
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">Canlı Yatak Zarar Radarı</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-red-600">
              -₺{totalIdleLossTl.toLocaleString('tr-TR')}
            </span>
            <span className="text-xs text-slate-500">
              {idleLossRadar.length} Boş/Kilitli Plaka
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">Günlük Yevmiye Kasa Tahsilatı</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              ₺{totalCollectedTodayTl.toLocaleString('tr-TR')}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              Hedef: ₺{totalAccrualTodayTl.toLocaleString('tr-TR')}
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 1: 12-GATE PRE-DEPARTURE APPROVAL QUEUE */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              1. Çıkış Onay Kuyruğu (12-Kapılı Doğrulama Paketi & Tek Tık Onay)
            </h2>
            <p className="text-xs text-slate-500">
              Şoför mobil uygulamasından 4 aşamalı doğrulamayı tamamlayan araçlar burada tek tıkla trafiğe çıkarılır
            </p>
          </div>
          <span className="text-xs font-mono font-semibold text-amber-700">
            Bekleyen: {pendingApprovalShifts.length}
          </span>
        </div>

        {pendingApprovalShifts.length === 0 ? (
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
            <span className="text-xs text-slate-600">
              Şu an çıkış onayı bekleyen vardiya talebi bulunmuyor. Şoför Mobil ekranından yeni doğrulama gönderebilirsiniz.
            </span>
            <button
              type="button"
              onClick={() => setActivePortal('driver_mobile')}
              className="px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-md hover:bg-slate-800 whitespace-nowrap"
            >
              Şoför Mobil Ekranını Aç
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingApprovalShifts.map((shift) => {
              const v = vehicles.find((item) => item.id === shift.vehicleId);
              const d = drivers.find((item) => item.id === shift.driverId);
              return (
                <div
                  key={shift.id}
                  className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900">
                      <span className="font-mono">{v?.plate || shift.vehicleId}</span>
                      <span>·</span>
                      <span>{d?.name || shift.driverId}</span>
                      <span>·</span>
                      <span className="text-xs font-mono text-emerald-700">
                        Güven Puanı: {d?.trustScore ?? 92}/100
                      </span>
                      <span>·</span>
                      <span className="text-xs text-slate-500">{shift.type}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 font-mono">
                      <span>Çıkış KM: {(shift.odometerStart || 0).toLocaleString('tr-TR')}</span>
                      <span>·</span>
                      <span>Yakıt: {shift.fuelLevelEighths ?? 8}/8</span>
                      <span>·</span>
                      <span>Fotoğraf: {shift.photosVerifiedCount ?? 4}/4 Onaylı</span>
                      <span>·</span>
                      <span>Taksimetre Fiş: {shift.taximeterSlipNo || 'TKS-OK'}</span>
                      <span>·</span>
                      <span>POS: Teslim Alındı</span>
                      <span>·</span>
                      <span>PIN: {shift.contractPinCode || 'Onaylı'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-mono font-bold text-slate-900">
                      Yevmiye: ₺{shift.accrual.toLocaleString('tr-TR')}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOneClickApprove(shift.id)}
                      className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap"
                    >
                      Çıkışa Onay Ver & Vardiyayı Başlat
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: LIVE PLATE MATRIX & IDLE LOSS RADAR + SMART SPARE DRIVER MATCHER */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                2. Yatak Zarar Radarı & Akıllı Yedek Şoför Eşleştirici
              </h2>
              <p className="text-xs text-slate-500">
                YatakZararı = OrtalamaGünlükNetKazanç × (BoşBeklemeSaatleri / 24)
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/vehicles')}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline"
            >
              Tüm Plakalar ({vehicles.length})
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {idleLossRadar.map((entry) => (
              <div key={entry.vehicle.id} className="py-3.5 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <span
                        onClick={() => navigate(`/vehicles/${entry.vehicle.id}`)}
                        className="font-mono cursor-pointer hover:underline"
                      >
                        {entry.vehicle.plate}
                      </span>
                      <span>·</span>
                      <span className="text-xs font-normal text-slate-600">
                        {entry.vehicle.brand} {entry.vehicle.model}
                      </span>
                      {entry.lockReason && (
                        <>
                          <span>·</span>
                          <span className="text-xs font-mono font-bold text-red-600">
                            {entry.lockReason}
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      Boş Bekleme: {entry.idleHours} Saat · Günlük Tarife: ₺{entry.avgDailyRateTl.toLocaleString('tr-TR')} · KM: {entry.vehicle.lastOdometer.toLocaleString('tr-TR')}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-mono font-bold tabular-nums text-red-600">
                      -₺{entry.idleLossTl.toLocaleString('tr-TR')} Zarar
                    </span>
                    {entry.vehicle.status === 'available' && !entry.lockReason ? (
                      <button
                        type="button"
                        onClick={() =>
                          setSpareAssignVehicleId(
                            spareAssignVehicleId === entry.vehicle.id ? null : entry.vehicle.id
                          )
                        }
                        className="px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 whitespace-nowrap"
                      >
                        Yedek Şoför Eşleştir
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => navigate(`/vehicles/${entry.vehicle.id}`)}
                        className="px-3 py-1.5 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 whitespace-nowrap"
                      >
                        Kilidi İncele
                      </button>
                    )}
                  </div>
                </div>

                {spareAssignVehicleId === entry.vehicle.id && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                    <span className="text-xs font-semibold text-slate-800 block">
                      Önerilen Yedek Şoförler (trustScore Büyükten Küçüğe Sıralı):
                    </span>
                    {bestSpareDrivers.length === 0 ? (
                      <p className="text-xs text-slate-500">Uygun yedek şoför bulunamadı.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {bestSpareDrivers.map((sd) => (
                          <button
                            key={sd.id}
                            type="button"
                            onClick={() => handleAssignSpareDriver(entry.vehicle.id, sd.id)}
                            className="px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-900 hover:bg-emerald-50 hover:border-emerald-400 transition-colors"
                          >
                            {sd.name} · <span className="font-mono font-bold text-emerald-700">Güven: {sd.trustScore ?? 95}</span> · Ata
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Deposit Erosion Critical Lock & Disputed Penalties */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  3. Teminat Erimesi & Otomatik Depozito Mahsubu
                </h2>
                <p className="text-xs text-slate-500">
                  ToplamBorç &gt;= %80 × Teminat olan şoförler
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/drivers')}
                className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline"
              >
                Cari & Gişe
              </button>
            </div>

            {criticalErosionDrivers.length === 0 ? (
              <p className="text-xs text-slate-500">
                Teminat erimesi kritik eşikte (%80+) olan şoför bulunmuyor.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {criticalErosionDrivers.map((d) => {
                  const er = evaluateDepositErosionStatus(d);
                  return (
                    <div key={d.id} className="py-3 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-sm font-bold text-slate-900 block">
                          {d.name} · <span className="text-xs font-mono text-red-600">TEMİNAT ERİMESİ %{er.erosionRatioPercent}</span>
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          Borç: ₺{(d.currentDebt || 0).toLocaleString('tr-TR')} / Depozito: ₺{(d.depositPaid || 0).toLocaleString('tr-TR')}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => offsetDriverDebtFromDeposit(d.id)}
                        className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 whitespace-nowrap"
                      >
                        Depozitodan Mahsup Et
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  4. Hızlı Erişim & Saha Modülleri
                </h2>
                <p className="text-xs text-slate-500">
                  Gişe tahsilatı, saniye bazlı rücu ve mal sahibi hakedişleri
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-semibold">
              <button
                type="button"
                onClick={() => navigate('/shifts')}
                className="p-3.5 border border-slate-200 rounded-lg text-left hover:bg-slate-50"
              >
                <span className="text-slate-900 block">Hızlı Tahsilat Gişesi</span>
                <span className="text-slate-500 font-normal mt-0.5 block">Nakit / POS / IBAN Kasa</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/penalties')}
                className="p-3.5 border border-slate-200 rounded-lg text-left hover:bg-slate-50"
              >
                <span className="text-slate-900 block">Ceza & Kaza Rücu ({penalties.length})</span>
                <span className="text-slate-500 font-normal mt-0.5 block">
                  İtirazlı: {disputedPenalties.length} Kayıt
                </span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/plate-owners')}
                className="p-3.5 border border-slate-200 rounded-lg text-left hover:bg-slate-50"
              >
                <span className="text-slate-900 block">Plaka Sahipleri Hakediş</span>
                <span className="text-slate-500 font-normal mt-0.5 block">Kira & 3-Taraf Mahsup</span>
              </button>
              <button
                type="button"
                onClick={() => setActivePortal('plate_owner')}
                className="p-3.5 border border-slate-200 rounded-lg text-left hover:bg-slate-50"
              >
                <span className="text-slate-900 block">Mal Sahibi Canlı Portalı</span>
                <span className="text-slate-500 font-normal mt-0.5 block">Yatırımcı Ekranını Gör</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Day Close Modal */}
      {isDayCloseOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                SHA-256 Kriptografik Gün Sonu Kapanışı
              </h3>
              <button onClick={() => setIsDayCloseOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Gün sonu kapanışı çalıştırıldığında açık vardiya, açık zimmet, tahsil edilmemiş ceza ve açık servis dosyaları denetlenir. Engel yoksa kasa SHA-256 zinciri ile mühürlenir.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsDayCloseOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={isClosingDay}
                onClick={handleExecuteDayClose}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                {isClosingDay ? 'Denetleniyor...' : 'Günü Mühürle ve Kapat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
