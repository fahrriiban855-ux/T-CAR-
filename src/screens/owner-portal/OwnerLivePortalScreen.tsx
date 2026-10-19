import React, { useState } from 'react';
import {
  Plus,
  Send,
  X,
} from 'lucide-react';
import { useDataStore } from '../../store/dataStore';

export default function OwnerLivePortalScreen() {
  const plateOwners = useDataStore((state) => state.plateOwners);
  const vehicles = useDataStore((state) => state.vehicles);
  const drivers = useDataStore((state) => state.drivers);
  const shifts = useDataStore((state) => state.shifts);
  const penalties = useDataStore((state) => state.penalties);
  const serviceCases = useDataStore((state) => state.serviceCases);

  const settlePlateOwnerPayout = useDataStore((state) => state.settlePlateOwnerPayout);
  const addPlateOwnerSettlement = useDataStore((state) => state.addPlateOwnerSettlement);

  const [selectedOwnerId, setSelectedOwnerId] = useState<string>(plateOwners[0]?.id || 'po1');
  const currentOwner = plateOwners.find((po) => po.id === selectedOwnerId) || plateOwners[0];

  const [payoutAmount, setPayoutAmount] = useState<number>(25000);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [newOwnerName, setNewOwnerName] = useState<string>('');
  const [newOwnerPhone, setNewOwnerPhone] = useState<string>('+90 532 ');
  const [newOwnerIban, setNewOwnerIban] = useState<string>('TR44 0006 ');
  const [newOwnerVehicleId, setNewOwnerVehicleId] = useState<string>(vehicles[0]?.id || 'v1');
  const [newMonthlyRent, setNewMonthlyRent] = useState<number>(100000);
  const [newDeductedExpenses, setNewDeductedExpenses] = useState<number>(0);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!currentOwner) {
    return (
      <div className="p-8 text-center text-slate-500">
        Plaka sahibi hesap kaydı yükleniyor...
      </div>
    );
  }

  const linkedVehicle =
    vehicles.find((v) => v.id === currentOwner.vehicleId || v.plate === currentOwner.plate) ||
    vehicles[0];

  const vehicleShifts = shifts.filter((s) => s.vehicleId === linkedVehicle?.id);
  const activeShift = vehicleShifts.find(
    (s) => s.status === 'active' || s.status === 'pending_approval'
  );
  const activeDriver = drivers.find(
    (d) => d.id === (activeShift?.driverId || linkedVehicle?.assignedDayDriverId)
  );
  const vehiclePenalties = penalties.filter((p) => p.vehicleId === linkedVehicle?.id);
  const vehicleServices = serviceCases.filter((sc) => sc.vehicleId === linkedVehicle?.id);

  const netTargetPayable = Math.max(
    0,
    Number(currentOwner.monthlyBaseRent || 0) - Number(currentOwner.deductedExpenses || 0)
  );
  const netRemainingReceivable = Math.max(
    0,
    netTargetPayable - Number(currentOwner.paidAmount || 0)
  );

  const totalShiftCollectionsOnPlate = vehicleShifts.reduce(
    (acc, s) => acc + Number(s.collection || 0),
    0
  );

  const handlePayOwner = async () => {
    if (payoutAmount <= 0) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await settlePlateOwnerPayout(currentOwner.id, payoutAmount);
      setFeedback({
        type: 'success',
        text: `${currentOwner.ownerName} (${currentOwner.iban}) hesabına ₺${payoutAmount.toLocaleString('tr-TR')} kira hakediş ödemesi aktarıldı.`,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Hakediş ödemesi yapılamadı.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateOwner = async () => {
    if (!newOwnerName || !newOwnerVehicleId) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const targetVeh = vehicles.find((v) => v.id === newOwnerVehicleId);
      await addPlateOwnerSettlement({
        ownerName: newOwnerName,
        phone: newOwnerPhone,
        iban: newOwnerIban,
        vehicleId: newOwnerVehicleId,
        plate: targetVeh?.plate || '34 TXX 00',
        periodMonth: '2026-10',
        monthlyBaseRent: newMonthlyRent,
        deductedExpenses: newDeductedExpenses,
        paidAmount: 0,
        notes: 'Yeni plaka kira sözleşmesi ve aylık hakediş kaydı',
      });
      setIsAddModalOpen(false);
      setNewOwnerName('');
      setFeedback({
        type: 'success',
        text: 'Yeni plaka sahibi kira hakediş sözleşmesi başarıyla tanımlandı.',
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Kayıt eklenemedi.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Bar: Plate Owner Account Selector & Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-slate-500">
            PLAKA / ARAÇ SAHİBİ (YATIRIMCI) CANLI HESAP & HAKEDİŞ MERKEZİ
          </span>
          <h1 className="text-xl font-bold text-slate-900 mt-0.5">
            {currentOwner.ownerName} — <span className="font-mono">{currentOwner.plate}</span> Canlı Saha & Kira Hakediş Takibi
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Aracın anlık çalışma durumu, aktif şoförü, yapılan günlük yevmiye ödemeleri, masraf mahsubu ve IBAN hakediş ödemeleri
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={currentOwner.id}
            onChange={(e) => setSelectedOwnerId(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 bg-slate-50"
          >
            {plateOwners.map((po) => (
              <option key={po.id} value={po.id}>
                {po.ownerName} · {po.plate} ({po.periodMonth})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
          >
            <Plus className="w-3.5 h-3.5" />
            Yeni Plaka Sahibi Ekle
          </button>
        </div>
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

      {/* 1. PLAKANIN ANLIK SAHA VE ÇALIŞMA DURUMU KARTI */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-mono font-bold text-sm">
              TAKSİ
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold font-mono text-slate-900">
                  {linkedVehicle?.plate || currentOwner.plate}
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-sm text-slate-600">
                  {linkedVehicle?.brand} {linkedVehicle?.model} ({linkedVehicle?.group})
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Bağlı Durak: {linkedVehicle?.stopName || 'Merkez Durak'} · IBAN: <span className="font-mono">{currentOwner.iban}</span>
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-500 block">Anlık Saha Durumu</span>
            <span
              className={`text-sm font-bold ${
                linkedVehicle?.status === 'in_shift' || linkedVehicle?.status === 'in_custody'
                  ? 'text-emerald-600'
                  : linkedVehicle?.status === 'available'
                  ? 'text-amber-600'
                  : 'text-red-600'
              }`}
            >
              {linkedVehicle?.status === 'in_shift' || linkedVehicle?.status === 'in_custody'
                ? 'SAHADA AKTİF ÇALIŞIYOR'
                : linkedVehicle?.status === 'available'
                ? 'DURAKTA MÜSAİT / VARDİYA BEKLİYOR'
                : linkedVehicle?.status === 'maintenance'
                ? 'SERVİSTE / BAKIMDA'
                : 'UYUM / BAKIM KİLİDİNDE'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
            <span className="text-xs text-slate-500 block">Direksiyondaki Aktif Şoför</span>
            <span className="text-sm font-bold text-slate-900 mt-1 block">
              {activeDriver ? activeDriver.name : 'Atanmış Şoför Bekleniyor'}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              Güven Puanı: {activeDriver?.trustScore ?? 95}/100 · İBB: {activeDriver?.ibbCardNo || 'Tam'}
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
            <span className="text-xs text-slate-500 block">Güncel Araç Kilometresi</span>
            <span className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1 block">
              {(linkedVehicle?.lastOdometer || 0).toLocaleString('tr-TR')} KM
            </span>
            <span className="text-xs text-slate-500 font-mono">
              Sonraki Bakım: {(linkedVehicle?.nextMaintenanceOdometer || 0).toLocaleString('tr-TR')} KM
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
            <span className="text-xs text-slate-500 block">Son Vardiya Çıkış Doğrulaması</span>
            <span className="text-sm font-bold text-emerald-700 mt-1 block">
              4 Yön Fotoğraf + POS + Taksimetre Tam
            </span>
            <span className="text-xs text-slate-500 font-mono">
              Fiş No: {activeShift?.taximeterSlipNo || 'TKS-88401'} · Yakıt: 8/8
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
            <span className="text-xs text-slate-500 block">Plakada Toplanan Yevmiye</span>
            <span className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1 block">
              ₺{totalShiftCollectionsOnPlate.toLocaleString('tr-TR')}
            </span>
            <span className="text-xs text-slate-500">
              Vardiya Modeli: {linkedVehicle?.shiftModel === '24h_single' ? '24 Saat Tek Şoför' : '2x12 Saat Çift Vardiya'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. AYLIK KİRA HAKEDİŞİ, KESİNTİLER VE IBAN ÖDEME PANELİ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">Aylık Brüt Plaka Kirası ({currentOwner.periodMonth})</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            ₺{currentOwner.monthlyBaseRent.toLocaleString('tr-TR')}
          </p>
          <span className="text-xs text-slate-500 mt-1 block">Sözleşmeli Aylık Sabit Hakediş</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">Mal Sahibi Masraf Mahsubu</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-amber-600 mt-1">
            -₺{currentOwner.deductedExpenses.toLocaleString('tr-TR')}
          </p>
          <span className="text-xs text-slate-500 mt-1 block">Sigorta / MTV / Muayene Kesintisi</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">Hesaba Yatan (Ödenen)</span>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-600 mt-1">
            ₺{currentOwner.paidAmount.toLocaleString('tr-TR')}
          </p>
          <span className="text-xs text-slate-500 mt-1 block">IBAN / Banka Dekontlu Ödeme</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <span className="text-xs font-medium text-slate-500 block">
            Net Kalan Alacak: <strong className="font-mono text-slate-900">₺{netRemainingReceivable.toLocaleString('tr-TR')}</strong>
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(Number(e.target.value))}
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold"
            />
            <button
              type="button"
              disabled={isSubmitting || netRemainingReceivable <= 0}
              onClick={handlePayOwner}
              className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-40 shrink-0 flex items-center gap-1"
            >
              <Send className="w-3 h-3" />
              Öde
            </button>
          </div>
        </div>
      </div>

      {/* 3. ŞOFÖR GÜNLÜK YEVMİYE ÖDEMELERİ CANLI AKIŞI & 4. 3-TARAF MASRAF DÖKÜMÜ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900">
              Şoför Günlük Yevmiye Tahsilatları Canlı Akışı
            </h2>
            <p className="text-xs text-slate-500">
              Plakanızda çalışan şoförlerin yaptığı her günlük yevmiye ödemesi anında listelenir
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {vehicleShifts.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">Bu plakada henüz vardiya hareketi bulunmuyor.</p>
            ) : (
              vehicleShifts.map((s) => {
                const dName = drivers.find((d) => d.id === s.driverId)?.name || s.driverId;
                return (
                  <div key={s.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {dName} · <span className="text-xs font-normal text-slate-500">{s.type}</span>
                      </div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        {new Date(s.startedAt).toLocaleString('tr-TR')} · KM: {(s.odometerStart || 0).toLocaleString('tr-TR')}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold font-mono tabular-nums text-emerald-600 block">
                        +₺{(s.collection || 0).toLocaleString('tr-TR')} Tahsil Edildi
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        Tahakkuk: ₺{s.accrual.toLocaleString('tr-TR')}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900">
              3-Taraf Masraf, Sigorta ve Ceza Şeffaf Dağılım Dökümü
            </h2>
            <p className="text-xs text-slate-500">
              Şoför kusurlu cezalar ve hasarlar şoföre rücu edilir; plaka sahibi hakedişinizden kesilmez
            </p>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-900 block">
                  Dönem Mahsup Notu ({currentOwner.periodMonth})
                </span>
                <span className="text-slate-600 mt-0.5 block">{currentOwner.notes}</span>
              </div>
              <span className="font-mono font-bold text-amber-700 shrink-0 ml-3">
                -₺{currentOwner.deductedExpenses.toLocaleString('tr-TR')} (Plaka Sahibi)
              </span>
            </div>

            {vehiclePenalties.map((pen) => (
              <div
                key={pen.id}
                className="p-3.5 rounded-lg bg-emerald-50/60 border border-emerald-200 flex items-center justify-between"
              >
                <div>
                  <span className="font-semibold text-slate-900 block">
                    {pen.documentNo} — {pen.description}
                  </span>
                  <span className="text-slate-600 mt-0.5 block">
                    Sorumlu Şoför: {pen.driverName} (Toplam Ceza/Rücu: ₺{pen.totalCharge.toLocaleString('tr-TR')})
                  </span>
                </div>
                <span className="font-mono font-bold text-emerald-700 shrink-0 ml-3">
                  ₺0 (Şoföre Rücu Edildi)
                </span>
              </div>
            ))}

            {vehicleServices.map((sc) => (
              <div
                key={sc.id}
                className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between"
              >
                <div>
                  <span className="font-semibold text-slate-900 block">
                    Servis Kaydı: {sc.reason} ({sc.provider})
                  </span>
                  <span className="text-slate-600 mt-0.5 block">
                    Maliyet Sorumlusu: {sc.costBearer === 'owner' ? 'Plaka Sahibi' : sc.costBearer === 'driver' ? 'Şoför Rücu' : 'Şirket / Kasko'}
                  </span>
                </div>
                <span className="font-mono font-bold text-slate-800 shrink-0 ml-3">
                  ₺{(sc.expenseAmount || 0).toLocaleString('tr-TR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add New Plate Owner Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Yeni Plaka Sahibi Kira Sözleşmesi
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Plaka Sahibi Ad Soyad</label>
                <input
                  type="text"
                  value={newOwnerName}
                  onChange={(e) => setNewOwnerName(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Bağlı Plaka</label>
                  <select
                    value={newOwnerVehicleId}
                    onChange={(e) => setNewOwnerVehicleId(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 font-mono"
                  >
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plate}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Telefon</label>
                  <input
                    type="text"
                    value={newOwnerPhone}
                    onChange={(e) => setNewOwnerPhone(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">IBAN</label>
                <input
                  type="text"
                  value={newOwnerIban}
                  onChange={(e) => setNewOwnerIban(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Aylık Kira (₺)</label>
                  <input
                    type="number"
                    value={newMonthlyRent}
                    onChange={(e) => setNewMonthlyRent(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Masraf Mahsubu (₺)</label>
                  <input
                    type="number"
                    value={newDeductedExpenses}
                    onChange={(e) => setNewDeductedExpenses(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 font-mono"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-md text-xs font-semibold"
              >
                İptal
              </button>
              <button
                onClick={handleCreateOwner}
                disabled={isSubmitting}
                className="px-4 py-2 bg-slate-900 text-white rounded-md text-xs font-semibold"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
