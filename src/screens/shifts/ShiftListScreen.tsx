import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  CalendarClock,
  Users,
  X,
} from 'lucide-react';
import { useDataStore, Shift } from '../../store/dataStore';
import { matchBestSpareDrivers } from '../../services/decisionEngine';

const StatusBadge = ({ status }: { status: Shift['status'] }) => {
  switch (status) {
    case 'pending_approval':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300">
          <Clock className="w-3.5 h-3.5" /> 12-Kapı Çıkış Onayı Bekliyor
        </span>
      );
    case 'active':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
          <Clock className="w-3.5 h-3.5" /> Sahada Aktif
        </span>
      );
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
          <CheckCircle2 className="w-3.5 h-3.5" /> Kapandı
        </span>
      );
    case 'delayed':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-red-50 text-red-800 border border-red-200">
          <AlertTriangle className="w-3.5 h-3.5" /> Gecikmiş
        </span>
      );
    default:
      return null;
  }
};

export default function ShiftListScreen() {
  const shifts = useDataStore((state) => state.shifts);
  const vehicles = useDataStore((state) => state.vehicles);
  const drivers = useDataStore((state) => state.drivers);
  const custodies = useDataStore((state) => state.custodies);

  const addShift = useDataStore((state) => state.addShift);
  const closeShift = useDataStore((state) => state.closeShift);
  const approveShiftDeparture = useDataStore((state) => state.approveShiftDeparture);
  const returnCustody = useDataStore((state) => state.returnCustody);
  const assignVehicleRoster = useDataStore((state) => state.assignVehicleRoster);

  const [activeTab, setActiveTab] = useState<'shifts_desk' | 'roster_matrix' | 'custodies_log'>('shifts_desk');
  const [searchTerm, setSearchTerm] = useState('');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [closingShift, setClosingShift] = useState<Shift | null>(null);

  // New Shift Form
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [slot, setSlot] = useState<'day_12h' | 'night_12h' | 'full_24h'>('day_12h');
  const [accrual, setAccrual] = useState(2400);

  // Close Shift Form
  const [cashInput, setCashInput] = useState(0);
  const [posInput, setPosInput] = useState(0);
  const [ibanInput, setIbanInput] = useState(0);
  const [odometerEndInput, setOdometerEndInput] = useState(0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const spareDriversPool = useMemo(
    () => matchBestSpareDrivers(drivers, custodies),
    [drivers, custodies]
  );

  const enrichedShifts = shifts.map((s) => {
    const v = vehicles.find((veh) => veh.id === s.vehicleId);
    const d = drivers.find((drv) => drv.id === s.driverId);
    return {
      ...s,
      plate: v ? v.plate : s.vehicleId,
      driverName: d ? d.name : s.driverId,
    };
  });

  const filteredShifts = enrichedShifts.filter(
    (s) =>
      s.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.driverName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenCloseModal = (shift: Shift) => {
    setClosingShift(shift);
    setCashInput(shift.cashCollected ?? shift.accrual);
    setPosInput(shift.posCollected ?? 0);
    setIbanInput(shift.ibanCollected ?? 0);
    setOdometerEndInput((shift.odometerStart || 100000) + 210);
  };

  const handleConfirmCloseShift = async () => {
    if (!closingShift) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await closeShift(closingShift.id, {
        cashCollected: cashInput,
        posCollected: posInput,
        ibanCollected: ibanInput,
        odometerEnd: odometerEndInput,
      });
      setClosingShift(null);
      setFeedback({
        type: 'success',
        text: 'Vardiya ve zimmet başarıyla kapatıldı, kasa ve şoför carisi güncellendi.',
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Vardiya kapatılırken hata oluştu.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateShift = async () => {
    if (!vehicleId || !driverId) {
      setFeedback({ type: 'error', text: 'Lütfen plaka ve şoför seçiniz.' });
      return;
    }
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const veh = vehicles.find((v) => v.id === vehicleId);
      await addShift({
        vehicleId,
        driverId,
        status: 'active',
        startedAt: new Date().toISOString(),
        slot,
        type:
          slot === 'full_24h'
            ? '24 Saat Tek Şoför'
            : slot === 'night_12h'
            ? 'Gece (18:00-06:00)'
            : 'Gündüz (06:00-18:00)',
        accrual,
        collection: 0,
        odometerStart: veh?.lastOdometer || 100000,
      });
      setIsNewModalOpen(false);
      setFeedback({ type: 'success', text: 'Yeni vardiya ve araç zimmeti başarıyla başlatıldı.' });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Vardiya başlatılamadı.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Vardiya & Gişe Tahsilat, 500 Araç Nöbet Planlama ve Zimmet Sicili
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            12-Kapı çıkış onayları, yevmiye tahsilatı, 06:00/18:00 nöbet matrisi, yedek şoför havuzu ve zimmet kayıtları tek ekranda
          </p>
        </div>
        <button
          onClick={() => setIsNewModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          Yeni Vardiya & Zimmet Başlat
        </button>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium ${
            feedback.type === 'error'
              ? 'bg-red-50 text-red-900 border-red-200'
              : 'bg-emerald-50 text-emerald-900 border-emerald-200'
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="font-bold underline ml-4">
            Kapat
          </button>
        </div>
      )}

      {/* Unified Tab Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('shifts_desk')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === 'shifts_desk'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            1. Vardiya & Gişe Tahsilat ({shifts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('roster_matrix')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === 'roster_matrix'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2. 500 Araç Nöbet & Yedek Şoför Havuzu ({spareDriversPool.length} Yedek)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custodies_log')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === 'custodies_log'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            3. Dijital Zimmet Sicili ({custodies.length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Plaka veya şoför ara..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs"
          />
        </div>
      </div>

      {/* TAB 1: VARDİYA & GİŞE TAHSİLAT */}
      {activeTab === 'shifts_desk' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                  <th className="py-3.5 px-4">Plaka & Vardiya</th>
                  <th className="py-3.5 px-4">Şoför</th>
                  <th className="py-3.5 px-4">Çıkış / Dönüş KM</th>
                  <th className="py-3.5 px-4">Yevmiye Tahakkuk / Tahsilat</th>
                  <th className="py-3.5 px-4">Durum</th>
                  <th className="py-3.5 px-4 text-right">Gişe İşlemi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredShifts.map((s) => {
                  const shortfall = Math.max(0, s.accrual - s.collection);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="py-4 px-4">
                        <span className="font-mono font-bold text-slate-900 block">{s.plate}</span>
                        <span className="text-[11px] text-slate-500">{s.type}</span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="font-bold text-slate-900 block">{s.driverName}</span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          Fiş: {s.taximeterSlipNo || 'TKS-88401'}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-mono tabular-nums">
                        <span className="text-slate-900 font-semibold">
                          {(s.odometerStart || 0).toLocaleString('tr-TR')}
                        </span>
                        {' → '}
                        <span className="text-slate-600">
                          {s.odometerEnd ? s.odometerEnd.toLocaleString('tr-TR') : 'Sahada'}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-mono tabular-nums">
                        <span className="font-bold text-slate-900 block">
                          Tahakkuk: ₺{s.accrual.toLocaleString('tr-TR')}
                        </span>
                        <span className={shortfall > 0 ? 'text-amber-700 font-semibold' : 'text-emerald-700 font-semibold'}>
                          Tahsilat: ₺{s.collection.toLocaleString('tr-TR')}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="py-4 px-4 text-right">
                        {s.status === 'pending_approval' ? (
                          <button
                            onClick={() => approveShiftDeparture(s.id)}
                            className="px-3 py-1.5 bg-amber-600 text-white rounded-md font-semibold hover:bg-amber-700"
                          >
                            Tek Tık Çıkış Onayı Ver
                          </button>
                        ) : s.status === 'active' || s.status === 'delayed' ? (
                          <button
                            onClick={() => handleOpenCloseModal(s)}
                            className="px-3 py-1.5 bg-slate-900 text-white rounded-md font-semibold hover:bg-slate-800"
                          >
                            Tahsil Et & Kapat
                          </button>
                        ) : (
                          <span className="text-slate-400">Tamamlandı</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: 500 ARAÇ NÖBET PLANLAMA MATRİSİ & YEDEK ŞOFÖR HAVUZU */}
      {activeTab === 'roster_matrix' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                06:00 / 18:00 Çift Vardiya & 24 Saat Nöbet Planlama Matrisi
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-4">Plaka & Durak</th>
                    <th className="py-3 px-3">Çalışma Modeli</th>
                    <th className="py-3 px-3">1. Şoför (Gündüz 06-18)</th>
                    <th className="py-3 px-3">2. Şoför (Gece 18-06)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {vehicles.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-slate-900 block">{v.plate}</span>
                        <span className="text-[11px] text-slate-500">{v.stopName || 'Merkez'}</span>
                      </td>
                      <td className="py-3.5 px-3">
                        <select
                          value={v.shiftModel || '2x12_double'}
                          onChange={(e) =>
                            assignVehicleRoster(
                              v.id,
                              v.assignedDayDriverId || '',
                              v.assignedNightDriverId || '',
                              e.target.value as '2x12_double' | '24h_single'
                            )
                          }
                          className="border border-slate-300 rounded px-2 py-1 text-xs"
                        >
                          <option value="2x12_double">2x12 Çift Vardiya</option>
                          <option value="24h_single">24 Saat Tek Şoför</option>
                        </select>
                      </td>
                      <td className="py-3.5 px-3">
                        <select
                          value={v.assignedDayDriverId || ''}
                          onChange={(e) =>
                            assignVehicleRoster(
                              v.id,
                              e.target.value,
                              v.assignedNightDriverId || '',
                              v.shiftModel || '2x12_double'
                            )
                          }
                          className="border border-slate-300 rounded px-2 py-1 text-xs w-full"
                        >
                          <option value="">Atanmadı (Boş)</option>
                          {drivers.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({d.trustScore ?? 90} Puan)
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3.5 px-3">
                        <select
                          value={v.assignedNightDriverId || ''}
                          disabled={v.shiftModel === '24h_single'}
                          onChange={(e) =>
                            assignVehicleRoster(
                              v.id,
                              v.assignedDayDriverId || '',
                              e.target.value,
                              v.shiftModel || '2x12_double'
                            )
                          }
                          className="border border-slate-300 rounded px-2 py-1 text-xs w-full disabled:bg-slate-100"
                        >
                          <option value="">Atanmadı (Boş)</option>
                          {drivers.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({d.trustScore ?? 90} Puan)
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                7/24 Hazır Yedek Şoför Havuzu (matchBestSpareDrivers)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Belgesi tam, borçsuz ve aktif zimmeti olmayan en yüksek puanlı şoförler
              </p>
            </div>
            <div className="space-y-2.5">
              {spareDriversPool.map((d) => (
                <div
                  key={d.id}
                  className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-900 block">{d.name}</span>
                    <span className="text-slate-500">{d.phone} · İBB: {d.ibbCardNo}</span>
                  </div>
                  <span className="font-mono font-bold text-emerald-700">
                    {d.trustScore ?? 92}/100
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DİJİTAL ZİMMET SİCİLİ */}
      {activeTab === 'custodies_log' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                  <th className="py-3.5 px-4">Plaka</th>
                  <th className="py-3.5 px-4">Şoför</th>
                  <th className="py-3.5 px-4">Teslim / İade Zamanı</th>
                  <th className="py-3.5 px-4">Çıkış / Dönüş KM & Yakıt</th>
                  <th className="py-3.5 px-4">Sözleşme PIN & Fiş</th>
                  <th className="py-3.5 px-4 text-right">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {custodies.map((c) => {
                  const v = vehicles.find((veh) => veh.id === c.vehicleId);
                  const d = drivers.find((drv) => drv.id === c.driverId);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {v?.plate || c.vehicleId}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {d?.name || c.driverId}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {c.handedOverAt} {c.returnedAt ? `→ ${c.returnedAt}` : ''}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums">
                        {c.odometerOut.toLocaleString('tr-TR')} KM ({c.fuelLevelEighths ?? 8}/8 Yakıt)
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        PIN: {c.contractPinCode || '4829'} · Fiş: {c.taximeterSlipNo || 'TKS'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {c.status === 'active' ? (
                          <button
                            onClick={() =>
                              returnCustody(c.id, {
                                odometerIn: c.odometerOut + 200,
                                returnFuelEighths: 8,
                              })
                            }
                            className="px-2.5 py-1 bg-slate-900 text-white rounded font-semibold"
                          >
                            Zimmeti İade Al
                          </button>
                        ) : (
                          <span className="text-emerald-700 font-semibold">İade Alındı</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Close Shift Modal */}
      {closingShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Vardiya Tahsilatı & Kapanış
              </h3>
              <button onClick={() => setClosingShift(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Dönüş Kilometresi</label>
                <input
                  type="number"
                  value={odometerEndInput}
                  onChange={(e) => setOdometerEndInput(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 font-mono font-bold"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nakit (₺)</label>
                  <input
                    type="number"
                    value={cashInput}
                    onChange={(e) => setCashInput(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-md px-2.5 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">POS (₺)</label>
                  <input
                    type="number"
                    value={posInput}
                    onChange={(e) => setPosInput(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-md px-2.5 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">IBAN (₺)</label>
                  <input
                    type="number"
                    value={ibanInput}
                    onChange={(e) => setIbanInput(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-md px-2.5 py-2 font-mono"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setClosingShift(null)}
                className="px-4 py-2 border border-slate-300 rounded-md text-xs font-semibold"
              >
                İptal
              </button>
              <button
                onClick={handleConfirmCloseShift}
                disabled={isSubmitting}
                className="px-4 py-2 bg-slate-900 text-white rounded-md text-xs font-semibold"
              >
                {isSubmitting ? 'Kapatılıyor...' : 'Tahsilatı Kaydet & Vardiyayı Kapat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Shift Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Yeni Vardiya & Zimmet Başlat
              </h3>
              <button onClick={() => setIsNewModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Taksi Plakası</label>
                <select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2"
                >
                  <option value="">Seçiniz</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} ({v.status})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Şoför</label>
                <select
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2"
                >
                  <option value="">Seçiniz</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} (Puan: {d.trustScore ?? 92})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Vardiya Dilimi</label>
                  <select
                    value={slot}
                    onChange={(e) => setSlot(e.target.value as 'day_12h' | 'night_12h' | 'full_24h')}
                    className="w-full border border-slate-300 rounded-md px-3 py-2"
                  >
                    <option value="day_12h">Gündüz (12s)</option>
                    <option value="night_12h">Gece (12s)</option>
                    <option value="full_24h">24 Saat</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Yevmiye (₺)</label>
                  <input
                    type="number"
                    value={accrual}
                    onChange={(e) => setAccrual(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 font-mono font-bold"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-md text-xs font-semibold"
              >
                İptal
              </button>
              <button
                onClick={handleCreateShift}
                disabled={isSubmitting}
                className="px-4 py-2 bg-slate-900 text-white rounded-md text-xs font-semibold"
              >
                {isSubmitting ? 'Başlatılıyor...' : 'Vardiya & Zimmeti Başlat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
