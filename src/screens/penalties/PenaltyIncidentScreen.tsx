import React, { useState } from 'react';
import {
  Search,
  Plus,
  CheckCircle2,
  ShieldAlert,
  X,
  Scale,
  Gavel,
} from 'lucide-react';
import { useDataStore } from '../../store/dataStore';
import { PenaltyIncidentType } from '../../types';
import {
  findResponsibleDriverByTimestamp,
  calculatePenaltyTotalCharge,
} from '../../services/dbService';

const TypeLabel = ({ type }: { type: PenaltyIncidentType }) => {
  switch (type) {
    case 'traffic_fine':
      return <span className="text-xs font-semibold text-red-700">Trafik Cezası (EDS/Radar)</span>;
    case 'hgs_toll':
      return <span className="text-xs font-semibold text-amber-800">Kaçak HGS / Köprü / Avrasya</span>;
    case 'accident_damage':
      return <span className="text-xs font-semibold text-purple-800">Kaza Hasarı + Yattı Parası</span>;
    case 'downtime_loss':
      return <span className="text-xs font-semibold text-slate-800">Yattı Parası (Kazanç Kaybı)</span>;
  }
};

export default function PenaltyIncidentScreen() {
  const penalties = useDataStore((state) => state.penalties);
  const vehicles = useDataStore((state) => state.vehicles);
  const drivers = useDataStore((state) => state.drivers);
  const shifts = useDataStore((state) => state.shifts);
  const custodies = useDataStore((state) => state.custodies);

  const addPenaltyIncident = useDataStore((state) => state.addPenaltyIncident);
  const collectPenaltyIncident = useDataStore((state) => state.collectPenaltyIncident);
  const resolvePenaltyDispute = useDataStore((state) => state.resolvePenaltyDispute);

  const [activeView, setActiveView] = useState<'all_penalties' | 'dispute_desk' | 'legal_execution'>('all_penalties');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [vehicleId, setVehicleId] = useState('');
  const [violationAt, setViolationAt] = useState('2026-10-16T10:00');
  const [driverId, setDriverId] = useState('');
  const [matchedInfo, setMatchedInfo] = useState<string | null>(null);
  const [matchedRecordId, setMatchedRecordId] = useState('');
  const [type, setType] = useState<PenaltyIncidentType>('traffic_fine');
  const [documentNo, setDocumentNo] = useState('');
  const [amount, setAmount] = useState(3135);
  const [downtimeDays, setDowntimeDays] = useState(0);
  const [dailyYattiRate, setDailyYattiRate] = useState(2500);
  const [faultPercentage, setFaultPercentage] = useState(100);
  const [description, setDescription] = useState('');

  // Legal / Dispute Resolution Inputs
  const [legalCaseNo, setLegalCaseNo] = useState('2026/14820 E.');
  const [lawyerName, setLawyerName] = useState('Av. Kerem Soylu (Filo Hukuk)');

  const [isSaving, setIsSaving] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const handleAutoDetectDriver = (targetVehicleId: string, targetViolationAt: string) => {
    if (!targetVehicleId || !targetViolationAt) return;
    const match = findResponsibleDriverByTimestamp(
      targetVehicleId,
      targetViolationAt,
      shifts,
      custodies
    );
    if (match) {
      setDriverId(match.driverId);
      setMatchedRecordId(match.matchedRecordId);
      const drv = drivers.find((d) => d.id === match.driverId);
      setMatchedInfo(
        `Otomatik Eşleşti: ${drv?.name || match.driverId} (${
          match.source === 'shift' ? 'Vardiya Kaydı' : 'Zimmet Kaydı'
        }: ${match.matchedRecordId})`
      );
    } else {
      const veh = vehicles.find((v) => v.id === targetVehicleId);
      if (veh?.assignedDayDriverId) {
        setDriverId(veh.assignedDayDriverId);
        const drv = drivers.find((d) => d.id === veh.assignedDayDriverId);
        setMatchedInfo(`Araç Kadrolu Şoförü Önerildi: ${drv?.name || veh.assignedDayDriverId}`);
      } else {
        setMatchedInfo('Seçilen tarih-saatte açık vardiya/zimmet bulunamadı; lütfen şoförü manuel seçiniz.');
      }
    }
  };

  const previewTotalCharge = calculatePenaltyTotalCharge({
    amount,
    downtimeDays: type === 'accident_damage' || type === 'downtime_loss' ? downtimeDays : 0,
    dailyYattiRate: type === 'accident_damage' || type === 'downtime_loss' ? dailyYattiRate : 0,
    faultPercentage: type === 'accident_damage' || type === 'downtime_loss' ? faultPercentage : 100,
  });

  const handleCreate = async () => {
    setFeedback(null);
    if (!vehicleId || !driverId || !documentNo) {
      setFeedback({
        type: 'error',
        text: 'Lütfen plaka, sorumlu şoför ve tebligat/tutanak belge numarasını doldurun.',
      });
      return;
    }

    setIsSaving(true);
    try {
      await addPenaltyIncident({
        vehicleId,
        driverId,
        type,
        violationAt: new Date(violationAt).toISOString(),
        amount,
        downtimeDays: type === 'accident_damage' || type === 'downtime_loss' ? downtimeDays : 0,
        dailyYattiRate: type === 'accident_damage' || type === 'downtime_loss' ? dailyYattiRate : 0,
        faultPercentage: type === 'accident_damage' || type === 'downtime_loss' ? faultPercentage : 100,
        documentNo,
        description:
          description ||
          `${type === 'traffic_fine' ? 'Trafik Cezası' : type === 'hgs_toll' ? 'HGS Geçişi' : 'Kaza & Yattı Parası'} rücu kaydı`,
        matchedRecordId,
      });
      setIsModalOpen(false);
      setDocumentNo('');
      setDescription('');
      setFeedback({
        type: 'success',
        text: 'Ceza/hasar rücu kaydı oluşturuldu ve sorumlu şoförün carisine işlendi.',
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Kayıt oluşturulurken hata oluştu.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCollect = async (id: string) => {
    setProcessingId(id);
    setFeedback(null);
    try {
      await collectPenaltyIncident(id);
      setFeedback({
        type: 'success',
        text: 'Rücu tutarı tahsil edildi ve şoförün cari borç/bloke durumu güncellendi.',
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Tahsilat işleminde hata oluştu.',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleResolveDispute = async (
    penaltyId: string,
    resolution: 'accept_cancel' | 'reject_confirm' | 'escalate_legal'
  ) => {
    setProcessingId(penaltyId);
    setFeedback(null);
    try {
      const notes =
        resolution === 'accept_cancel'
          ? 'Şoförün fotoğraflı/taksimetre fişli itirazı haklı bulundu; borç silindi.'
          : resolution === 'reject_confirm'
          ? 'GPS ve vardiya saatleri doğrulandı; itiraz reddedilerek borç kesinleştirildi.'
          : `Ödenmeyen alacak icra takibine sevk edildi (${legalCaseNo} - ${lawyerName}).`;

      await resolvePenaltyDispute(penaltyId, resolution, notes, legalCaseNo, lawyerName);
      setFeedback({
        type: 'success',
        text: notes,
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'İtiraz/Hukuk işlemi tamamlanamadı.',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const disputedPenalties = penalties.filter((p) => p.status === 'disputed');
  const legalPenalties = penalties.filter((p) => p.status === 'legal_collection');
  const pendingRecords = penalties.filter((p) => p.status === 'pending_collection' || p.status === 'disputed');
  const pendingTotalAmount = pendingRecords.reduce((acc, p) => acc + (p.totalCharge || 0), 0);

  const filteredPenalties = penalties.filter((p) => {
    const matchesSearch =
      p.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.driverName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.documentNo.toLowerCase().includes(searchTerm.toLowerCase());
    if (activeView === 'dispute_desk') return matchesSearch && p.status === 'disputed';
    if (activeView === 'legal_execution') return matchesSearch && p.status === 'legal_collection';
    return matchesSearch;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Ceza, HGS/EDS Rücu, Şoför İtiraz Masası & Hukuk/İcra Takibi
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            İhlal saatine göre şoför tespiti, yattı parası rücusu, mobil şoför itirazlarının çözümü ve icra dosya takibi tek merkezde
          </p>
        </div>
        <button
          onClick={() => {
            setFeedback(null);
            setIsModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          Yeni Ceza / Kaza Rücu Ekle
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

      {/* Summary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs font-medium text-slate-500">Bekleyen Rücu Alacağı</span>
          <p className="text-2xl font-bold text-red-600 mt-1 font-mono tabular-nums">
            ₺{pendingTotalAmount.toLocaleString('tr-TR')}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs font-medium text-slate-500">Şoför İtiraz Masası</span>
          <p className="text-2xl font-bold text-amber-600 mt-1 font-mono tabular-nums">
            {disputedPenalties.length} Açık İtiraz
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs font-medium text-slate-500">Hukuk & İcra Takibinde</span>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono tabular-nums">
            {legalPenalties.length} İcra Dosyası
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs font-medium text-slate-500">Tahsil Edilen Rücu</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1 font-mono tabular-nums">
            ₺
            {penalties
              .filter((p) => p.status === 'collected')
              .reduce((acc, p) => acc + (p.totalCharge || 0), 0)
              .toLocaleString('tr-TR')}
          </p>
        </div>
      </div>

      {/* View Switcher & Search */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveView('all_penalties')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeView === 'all_penalties'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tüm Ceza & Rücular ({penalties.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveView('dispute_desk')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeView === 'dispute_desk'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Şoför İtiraz Çözüm Masası ({disputedPenalties.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveView('legal_execution')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeView === 'legal_execution'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Hukuk & İcra Dosyaları ({legalPenalties.length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Plaka, şoför veya belge no..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs"
          />
        </div>
      </div>

      {/* Unified Penalty, Dispute Resolution & Legal Execution Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                <th className="py-3.5 px-4">Plaka & Belge No</th>
                <th className="py-3.5 px-4">Sorumlu Şoför</th>
                <th className="py-3.5 px-4">Tür & Açıklama</th>
                <th className="py-3.5 px-4">Rücu Tutarı</th>
                <th className="py-3.5 px-4">Durum / İtiraz Kanıtı</th>
                <th className="py-3.5 px-4 text-right">Karar & Tahsilat İşlemi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredPenalties.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="py-4 px-4">
                    <span className="font-mono font-bold text-slate-900 block">{p.plate}</span>
                    <span className="text-[11px] font-mono text-slate-500">{p.documentNo}</span>
                  </td>
                  <td className="py-4 px-4">
                    <span className="font-bold text-slate-900 block">{p.driverName}</span>
                    <span className="text-[11px] text-slate-500">{p.violationAt}</span>
                  </td>
                  <td className="py-4 px-4 max-w-xs">
                    <TypeLabel type={p.type} />
                    <p className="text-slate-600 mt-0.5">{p.description}</p>
                  </td>
                  <td className="py-4 px-4 font-mono font-bold text-slate-900 tabular-nums">
                    ₺{p.totalCharge.toLocaleString('tr-TR')}
                  </td>
                  <td className="py-4 px-4 max-w-xs">
                    <span className="font-semibold text-slate-800 block">
                      {p.status === 'disputed'
                        ? 'Şoför İtiraz Etti'
                        : p.status === 'legal_collection'
                        ? `İcrada (${p.legalCaseNo || '2026/İcra'})`
                        : p.status === 'collected'
                        ? 'Tahsil Edildi'
                        : p.status === 'cancelled'
                        ? 'İtiraz Kabul (İptal)'
                        : 'Tahsilat Bekliyor'}
                    </span>
                    {p.disputeReason && (
                      <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-1.5 mt-1">
                        {p.disputeReason}
                      </p>
                    )}
                  </td>
                  <td className="py-4 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      {p.status === 'disputed' && (
                        <>
                          <button
                            type="button"
                            disabled={processingId === p.id}
                            onClick={() => handleResolveDispute(p.id, 'accept_cancel')}
                            className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-md font-semibold hover:bg-emerald-700"
                          >
                            İtirazı Kabul Et (Borcu Sil)
                          </button>
                          <button
                            type="button"
                            disabled={processingId === p.id}
                            onClick={() => handleResolveDispute(p.id, 'reject_confirm')}
                            className="px-2.5 py-1.5 bg-slate-900 text-white rounded-md font-semibold hover:bg-slate-800"
                          >
                            Reddet & Kesinleştir
                          </button>
                        </>
                      )}

                      {p.status === 'pending_collection' && (
                        <>
                          <button
                            type="button"
                            disabled={processingId === p.id}
                            onClick={() => handleCollect(p.id)}
                            className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-md font-semibold hover:bg-emerald-700"
                          >
                            Tahsil Et
                          </button>
                          <button
                            type="button"
                            disabled={processingId === p.id}
                            onClick={() => handleResolveDispute(p.id, 'escalate_legal')}
                            className="px-2.5 py-1.5 border border-red-300 bg-red-50 text-red-800 rounded-md font-semibold hover:bg-red-100"
                          >
                            İcraya Sevk Et
                          </button>
                        </>
                      )}

                      {p.status === 'legal_collection' && (
                        <button
                          type="button"
                          disabled={processingId === p.id}
                          onClick={() => handleCollect(p.id)}
                          className="px-2.5 py-1.5 bg-slate-900 text-white rounded-md font-semibold hover:bg-slate-800"
                        >
                          İcra Tahsilatı Kapat
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Penalty Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                Yeni Ceza, HGS veya Kaza/Yattı Rücu Kaydı
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Taksi Plakası</label>
                  <select
                    value={vehicleId}
                    onChange={(e) => {
                      setVehicleId(e.target.value);
                      handleAutoDetectDriver(e.target.value, violationAt);
                    }}
                    className="w-full border border-slate-300 rounded-md px-3 py-2"
                  >
                    <option value="">Seçiniz</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plate}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">İhlal Tarih & Saati</label>
                  <input
                    type="datetime-local"
                    value={violationAt}
                    onChange={(e) => {
                      setViolationAt(e.target.value);
                      handleAutoDetectDriver(vehicleId, e.target.value);
                    }}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 font-mono"
                  />
                </div>
              </div>

              {matchedInfo && (
                <div className="p-2.5 rounded-lg bg-slate-100 text-slate-800 font-medium">
                  {matchedInfo}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Sorumlu Şoför</label>
                  <select
                    value={driverId}
                    onChange={(e) => setDriverId(e.target.value)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2"
                  >
                    <option value="">Seçiniz</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Kayıt Türü</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as PenaltyIncidentType)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2"
                  >
                    <option value="traffic_fine">Trafik Cezası (EDS/Radar)</option>
                    <option value="hgs_toll">HGS / Köprü Geçişi</option>
                    <option value="accident_damage">Kaza Hasarı + Yattı</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tebligat / Fiş No</label>
                  <input
                    type="text"
                    value={documentNo}
                    onChange={(e) => setDocumentNo(e.target.value)}
                    placeholder="Örn: EDS-2026-994"
                    className="w-full border border-slate-300 rounded-md px-3 py-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Ceza / Hasar Tutarı (₺)</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-900 text-white rounded-lg flex items-center justify-between">
                <span>Şoföre Rücu Edilecek Toplam Tutar:</span>
                <span className="text-base font-mono font-bold text-amber-400">
                  ₺{previewTotalCharge.toLocaleString('tr-TR')}
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-md text-xs font-semibold"
              >
                İptal
              </button>
              <button
                onClick={handleCreate}
                disabled={isSaving}
                className="px-4 py-2 bg-slate-900 text-white rounded-md text-xs font-semibold"
              >
                {isSaving ? 'Kaydediliyor...' : 'Rücu Kaydını Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
