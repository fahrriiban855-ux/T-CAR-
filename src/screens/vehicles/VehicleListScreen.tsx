import React, { useState } from 'react';
import {
  Search,
  Plus,
  Car,
  CheckCircle2,
  XCircle,
  Clock,
  Wrench,
  X,
  FileText,
  ShieldAlert,
  Users,
  Gauge,
} from 'lucide-react';
import { Vehicle, ShiftModel, OwnershipType } from '../../types';
import { useDataStore } from '../../store/dataStore';
import { evaluateVehicleCompliance } from '../../services/dbService';

const StatusBadge = ({ status }: { status: Vehicle['status'] }) => {
  switch (status) {
    case 'available':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-amber-50 text-amber-900 border border-amber-300">
          <CheckCircle2 className="w-3.5 h-3.5" /> Müsait (Boşta)
        </span>
      );
    case 'in_custody':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200">
          <Clock className="w-3.5 h-3.5" /> Zimmette
        </span>
      );
    case 'in_shift':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
          <Car className="w-3.5 h-3.5" /> Sahada Vardiyada
        </span>
      );
    case 'maintenance':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-orange-50 text-orange-800 border border-orange-200">
          <Wrench className="w-3.5 h-3.5" /> Serviste
        </span>
      );
    case 'blocked':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-red-50 text-red-800 border border-red-200">
          <XCircle className="w-3.5 h-3.5" /> Uyum / Bakım Blokesi
        </span>
      );
    default:
      return null;
  }
};

export default function VehicleListScreen() {
  const vehicles = useDataStore((state) => state.vehicles);
  const drivers = useDataStore((state) => state.drivers);
  const shifts = useDataStore((state) => state.shifts);
  const custodies = useDataStore((state) => state.custodies);
  const serviceCases = useDataStore((state) => state.serviceCases);
  const penalties = useDataStore((state) => state.penalties);

  const addVehicle = useDataStore((state) => state.addVehicle);
  const updateVehicleStatus = useDataStore((state) => state.updateVehicleStatus);
  const assignVehicleRoster = useDataStore((state) => state.assignVehicleRoster);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(vehicles[0]?.id || null);
  const [detailTab, setDetailTab] = useState<'overview' | 'shifts' | 'service' | 'penalties'>('overview');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [plate, setPlate] = useState('34 TXX ');
  const [brand, setBrand] = useState('Fiat');
  const [model, setModel] = useState('Egea 1.6 Multijet Taksi');
  const [group, setGroup] = useState('Sarı Taksi');
  const [stopName, setStopName] = useState('Şişli Merkez Durak');
  const [shiftModel, setShiftModel] = useState<ShiftModel>('2x12_double');
  const [ownershipType, setOwnershipType] = useState<OwnershipType>('owned');
  const [dailyDayRate, setDailyDayRate] = useState(2400);
  const [dailyNightRate, setDailyNightRate] = useState(2600);
  const [daily24hRate, setDaily24hRate] = useState(4600);
  const [lastOdometer, setLastOdometer] = useState(45000);
  const [nextMaintenanceOdometer, setNextMaintenanceOdometer] = useState(55000);
  const [inspectionExpiry, setInspectionExpiry] = useState('2027-06-15');
  const [insuranceExpiry, setInsuranceExpiry] = useState('2027-06-15');

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const filteredVehicles = vehicles.filter(
    (v) =>
      v.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.stopName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) || filteredVehicles[0] || null;

  const handleAdd = async () => {
    setErrorMsg(null);
    if (!plate || !brand || !model) {
      setErrorMsg('Lütfen plaka, marka ve model alanlarını doldurunuz.');
      return;
    }
    const exists = vehicles.find(
      (v) => v.plate.toLowerCase().replace(/\s/g, '') === plate.toLowerCase().replace(/\s/g, '')
    );
    if (exists) {
      setErrorMsg('Bu plakaya sahip bir taksi zaten mevcut.');
      return;
    }

    setIsSaving(true);
    try {
      await addVehicle({
        plate: plate.toUpperCase(),
        brand,
        model,
        group,
        stopName,
        shiftModel,
        ownershipType,
        dailyDayRate,
        dailyNightRate,
        daily24hRate,
        status: 'available',
        lastOdometer,
        nextMaintenanceOdometer,
        inspectionExpiry,
        insuranceExpiry,
        cascoExpiry: insuranceExpiry,
        taximeterExpiry: inspectionExpiry,
      });
      setIsModalOpen(false);
      setPlate('34 TXX ');
      setFeedback('Yeni ticari taksi plakası başarıyla filoya eklendi.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Araç eklenirken bir hata oluştu.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Ticari Taksi Plakaları (500) & 360° Kara Kutu Plaka Hafızası
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Tüm plakaların yasal/bakım uygunluğu, kadrolu nöbet şoförleri ve geçmiş vardiya/servis/ceza sicili tek ekranda
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          Yeni Taksi Plakası Ekle
        </button>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="font-bold underline ml-4">
            Kapat
          </button>
        </div>
      )}

      {/* Split Layout: Left = Fleet Table | Right = 360° Plate Black-Box Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Plaka, durak veya model ara..."
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <span className="text-xs font-mono font-semibold text-slate-500 shrink-0">
              {filteredVehicles.length} Plaka
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4">Plaka & Durak</th>
                  <th className="py-3 px-3">Durum</th>
                  <th className="py-3 px-3">Kadran / 10K Bakım</th>
                  <th className="py-3 px-3">Tarife & Model</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredVehicles.map((v) => {
                  const isSelected = selectedVehicle?.id === v.id;
                  const maintLeft = (v.nextMaintenanceOdometer || v.lastOdometer + 10000) - v.lastOdometer;
                  return (
                    <tr
                      key={v.id}
                      onClick={() => setSelectedVehicleId(v.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-slate-900/5 font-medium' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-slate-900 block">{v.plate}</span>
                        <span className="text-[11px] text-slate-500">
                          {v.brand} {v.model} · {v.stopName || 'Merkez'}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        <StatusBadge status={v.status} />
                      </td>
                      <td className="py-3.5 px-3 font-mono tabular-nums">
                        <span className="font-bold text-slate-900 block">
                          {v.lastOdometer.toLocaleString('tr-TR')} KM
                        </span>
                        <span
                          className={`text-[11px] ${
                            maintLeft <= 500 ? 'text-red-600 font-bold' : 'text-slate-500'
                          }`}
                        >
                          Bakıma: {maintLeft.toLocaleString('tr-TR')} KM
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="font-semibold text-slate-800 block">
                          {v.shiftModel === '24h_single' ? '24 Saat Tek' : '2x12 Çift'}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                          ₺{v.dailyDayRate || 2400} / ₺{v.dailyNightRate || 2600}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Unified 360° Plate Black-Box Memory Panel */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          {selectedVehicle ? (
            <>
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 block">
                    360° PLAKA KARA KUTU SİCİLİ
                  </span>
                  <h2 className="text-2xl font-bold font-mono text-slate-900 mt-0.5">
                    {selectedVehicle.plate}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {selectedVehicle.brand} {selectedVehicle.model} ·{' '}
                    {selectedVehicle.ownershipType === 'leased_plate'
                      ? `Kiralık Plaka (${selectedVehicle.plateOwnerName || 'Yatırımcı'})`
                      : 'Özmal Plaka'}
                  </p>
                </div>
                <StatusBadge status={selectedVehicle.status} />
              </div>

              {/* Detail Sub-Tabs */}
              <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-lg text-xs">
                {[
                  { id: 'overview' as const, label: 'Özet & Nöbet' },
                  { id: 'shifts' as const, label: 'Vardiyalar' },
                  { id: 'service' as const, label: 'Servis' },
                  { id: 'penalties' as const, label: 'Cezalar' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDetailTab(t.id)}
                    className={`py-1.5 px-2 rounded-md font-semibold transition-colors ${
                      detailTab === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {detailTab === 'overview' && (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                    <div>
                      <span className="text-slate-500 block">Güncel Kilometre</span>
                      <span className="text-sm font-mono font-bold text-slate-900 tabular-nums">
                        {selectedVehicle.lastOdometer.toLocaleString('tr-TR')} KM
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Sonraki 10K Bakım</span>
                      <span className="text-sm font-mono font-bold text-slate-900 tabular-nums">
                        {(selectedVehicle.nextMaintenanceOdometer || selectedVehicle.lastOdometer + 10000).toLocaleString('tr-TR')} KM
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Muayene Bitiş</span>
                      <span className="font-mono font-semibold text-slate-800">
                        {selectedVehicle.inspectionExpiry || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Sigorta / Taksimetre</span>
                      <span className="font-mono font-semibold text-slate-800">
                        {selectedVehicle.insuranceExpiry || '-'}
                      </span>
                    </div>
                  </div>

                  {/* Quick Roster Driver Assignment */}
                  <div className="border border-slate-200 rounded-lg p-3.5 space-y-3">
                    <span className="font-bold text-slate-900 block">
                      Kadrolu Gündüz / Gece Nöbet Şoförleri
                    </span>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          1. Şoför (Gündüz 06-18)
                        </label>
                        <select
                          value={selectedVehicle.assignedDayDriverId || ''}
                          onChange={(e) =>
                            assignVehicleRoster(
                              selectedVehicle.id,
                              e.target.value,
                              selectedVehicle.assignedNightDriverId || '',
                              selectedVehicle.shiftModel || '2x12_double'
                            )
                          }
                          className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                        >
                          <option value="">Atanmadı</option>
                          {drivers.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({d.trustScore ?? 90} Puan)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-1">
                          2. Şoför (Gece 18-06)
                        </label>
                        <select
                          value={selectedVehicle.assignedNightDriverId || ''}
                          onChange={(e) =>
                            assignVehicleRoster(
                              selectedVehicle.id,
                              selectedVehicle.assignedDayDriverId || '',
                              e.target.value,
                              selectedVehicle.shiftModel || '2x12_double'
                            )
                          }
                          className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                        >
                          <option value="">Atanmadı</option>
                          {drivers.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} ({d.trustScore ?? 90} Puan)
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Quick Status Action */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => updateVehicleStatus(selectedVehicle.id, 'available')}
                      className="flex-1 py-2 px-3 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Müsait Yap
                    </button>
                    <button
                      type="button"
                      onClick={() => updateVehicleStatus(selectedVehicle.id, 'blocked')}
                      className="flex-1 py-2 px-3 border border-red-200 bg-red-50 text-red-800 rounded-lg font-semibold hover:bg-red-100"
                    >
                      Blokeye Al
                    </button>
                  </div>
                </div>
              )}

              {detailTab === 'shifts' && (
                <div className="space-y-2 max-h-80 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {shifts
                    .filter((s) => s.vehicleId === selectedVehicle.id)
                    .map((s) => {
                      const d = drivers.find((drv) => drv.id === s.driverId);
                      return (
                        <div key={s.id} className="py-2.5 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-slate-900 block">
                              {d?.name || s.driverId} · {s.type}
                            </span>
                            <span className="text-slate-500">
                              KM: {s.odometerStart || '-'} → {s.odometerEnd || 'Aktif'} · Fiş: {s.taximeterSlipNo || '-'}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-slate-900 tabular-nums">
                            ₺{s.collection.toLocaleString('tr-TR')} / ₺{s.accrual.toLocaleString('tr-TR')}
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}

              {detailTab === 'service' && (
                <div className="space-y-2 max-h-80 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {serviceCases.filter((sc) => sc.vehicleId === selectedVehicle.id).length === 0 ? (
                    <p className="text-slate-500 py-4 text-center">Bu plakaya ait servis kaydı bulunmuyor.</p>
                  ) : (
                    serviceCases
                      .filter((sc) => sc.vehicleId === selectedVehicle.id)
                      .map((sc) => (
                        <div key={sc.id} className="py-2.5">
                          <div className="flex items-center justify-between font-bold text-slate-900">
                            <span>{sc.provider}</span>
                            <span>{sc.status === 'open' ? 'Açık Servis' : `₺${(sc.expenseAmount || 0).toLocaleString('tr-TR')}`}</span>
                          </div>
                          <p className="text-slate-600 mt-0.5">{sc.reason}</p>
                        </div>
                      ))
                  )}
                </div>
              )}

              {detailTab === 'penalties' && (
                <div className="space-y-2 max-h-80 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {penalties.filter((p) => p.vehicleId === selectedVehicle.id).length === 0 ? (
                    <p className="text-slate-500 py-4 text-center">Bu plakaya ait ceza/rücu kaydı bulunmuyor.</p>
                  ) : (
                    penalties
                      .filter((p) => p.vehicleId === selectedVehicle.id)
                      .map((p) => (
                        <div key={p.id} className="py-2.5 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-slate-900 block">
                              {p.driverName} · {p.documentNo}
                            </span>
                            <span className="text-slate-500">{p.description}</span>
                          </div>
                          <span className="font-mono font-bold text-red-600 tabular-nums">
                            ₺{p.totalCharge.toLocaleString('tr-TR')}
                          </span>
                        </div>
                      ))
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-slate-500">Detaylarını görmek için listeden bir plaka seçin.</p>
          )}
        </div>
      </div>

      {/* Add Vehicle Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                Yeni Ticari Taksi Plakası Tanımla
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-md">
                {errorMsg}
              </div>
            )}

            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Plaka</label>
                  <input
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                    type="text"
                    className="block w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Bağlı Durak</label>
                  <input
                    value={stopName}
                    onChange={(e) => setStopName(e.target.value)}
                    type="text"
                    className="block w-full px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Marka</label>
                  <input
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    type="text"
                    className="block w-full px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Model</label>
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    type="text"
                    className="block w-full px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Segment</label>
                  <select
                    value={group}
                    onChange={(e) => setGroup(e.target.value)}
                    className="block w-full px-2.5 py-2 border border-slate-300 rounded-md"
                  >
                    <option>Sarı Taksi</option>
                    <option>Turkuaz Taksi</option>
                    <option>Siyah Lüks Taksi</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Vardiya Modeli</label>
                  <select
                    value={shiftModel}
                    onChange={(e) => setShiftModel(e.target.value as ShiftModel)}
                    className="block w-full px-2.5 py-2 border border-slate-300 rounded-md"
                  >
                    <option value="2x12_double">2x12 Çift Vardiya</option>
                    <option value="24h_single">24 Saat Tek Şoför</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Mülkiyet</label>
                  <select
                    value={ownershipType}
                    onChange={(e) => setOwnershipType(e.target.value as OwnershipType)}
                    className="block w-full px-2.5 py-2 border border-slate-300 rounded-md"
                  >
                    <option value="owned">Özmal</option>
                    <option value="leased_plate">Kiralık Plaka</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Gündüz (₺)</label>
                  <input
                    type="number"
                    value={dailyDayRate}
                    onChange={(e) => setDailyDayRate(Number(e.target.value))}
                    className="block w-full px-2.5 py-2 border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Gece (₺)</label>
                  <input
                    type="number"
                    value={dailyNightRate}
                    onChange={(e) => setDailyNightRate(Number(e.target.value))}
                    className="block w-full px-2.5 py-2 border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">24 Saat (₺)</label>
                  <input
                    type="number"
                    value={daily24hRate}
                    onChange={(e) => setDaily24hRate(Number(e.target.value))}
                    className="block w-full px-2.5 py-2 border border-slate-300 rounded-md font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-white border border-slate-300 rounded-md text-xs font-semibold text-slate-700"
              >
                İptal
              </button>
              <button
                onClick={handleAdd}
                disabled={isSaving}
                className="px-4 py-2 bg-slate-900 text-white rounded-md text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
              >
                {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
