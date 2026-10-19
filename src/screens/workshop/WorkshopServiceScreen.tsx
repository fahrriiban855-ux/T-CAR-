import React, { useState } from 'react';
import {
  Wrench,
  Package,
  ShieldAlert,
  CheckCircle2,
  Plus,
  AlertTriangle,
  Car,
  FileText,
  X,
} from 'lucide-react';
import { useDataStore } from '../../store/dataStore';
import { ServiceCase } from '../../types';

export default function WorkshopServiceScreen() {
  const vehicles = useDataStore((state) => state.vehicles);
  const drivers = useDataStore((state) => state.drivers);
  const serviceCases = useDataStore((state) => state.serviceCases);
  const plateOwners = useDataStore((state) => state.plateOwners);
  const workshopParts = useDataStore((state) => state.workshopParts);

  const enterService = useDataStore((state) => state.enterService);
  const completeWorkshopServiceWithFullIntegration = useDataStore(
    (state) => state.completeWorkshopServiceWithFullIntegration
  );
  const updatePartStock = useDataStore((state) => state.updatePartStock);

  const [activeTab, setActiveTab] = useState<'work_orders' | 'parts_inventory'>('work_orders');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [closingCase, setClosingCase] = useState<ServiceCase | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Work Order State
  const [selectedVehicleId, setSelectedVehicleId] = useState(vehicles[0]?.id || 'v1');
  const [entryOdometer, setEntryOdometer] = useState(145200);
  const [reason, setReason] = useState('10.000 KM Periyodik Bakım & Fren Balata Değişimi');
  const [deliveredBy, setDeliveredBy] = useState(drivers[0]?.name || 'Ahmet Yılmaz');
  const [provider, setProvider] = useState('Maslak Oto Sanayi - Taksi Merkez Atölye');
  const [estimatedExitAt, setEstimatedExitAt] = useState('2026-10-18');
  const [costBearer, setCostBearer] = useState<'company' | 'driver' | 'owner' | 'insurance'>('company');

  // Integrated Close State
  const [exitOdometer, setExitOdometer] = useState(145210);
  const [invoiceDocumentNo, setInvoiceDocumentNo] = useState('SAN-2026-8841');
  const [selectedPartId, setSelectedPartId] = useState(workshopParts[0]?.id || 'prt1');
  const [selectedPartQty, setSelectedPartQty] = useState(1);
  const [laborCostTl, setLaborCostTl] = useState(2500);
  const [closeCostBearer, setCloseCostBearer] = useState<'company' | 'driver' | 'owner' | 'insurance'>('company');
  const [responsibleDriverId, setResponsibleDriverId] = useState(drivers[0]?.id || 'd1');
  const [faultPercentage, setFaultPercentage] = useState(100);
  const [downtimeDays, setDowntimeDays] = useState(2);
  const [dailyYattiRate, setDailyYattiRate] = useState(2400);
  const [insuranceClaimNo, setInsuranceClaimNo] = useState('HAS-2026-99201');
  const [expertName, setExpertName] = useState('Eksper Murat Demir (SBM)');
  const [insurancePayoutTl, setInsurancePayoutTl] = useState(0);
  const [resultSummary, setResultSummary] = useState(
    'Parça değişimi, rot-balans ve 10.000 KM sıvı/filtre bakımı tamamlandı, saha çıkışına uygun.'
  );

  const openCases = serviceCases.filter((sc) => sc.status === 'open');
  const closedCases = serviceCases.filter((sc) => sc.status === 'closed');
  const maintenanceLockedVehicles = vehicles.filter(
    (v) =>
      v.status === 'maintenance' ||
      (v.nextMaintenanceOdometer && v.nextMaintenanceOdometer - v.lastOdometer <= 500)
  );
  const criticalPartsCount = workshopParts.filter((p) => p.stockQty <= p.minAlertQty).length;

  const selectedPartObj = workshopParts.find((p) => p.id === selectedPartId);
  const calculatedPartCost = (selectedPartObj?.unitCostTl || 0) * selectedPartQty;
  const totalInvoiceExpense = calculatedPartCost + Number(laborCostTl || 0);
  const previewYattiTotal = Number(downtimeDays || 0) * Number(dailyYattiRate || 0);
  const previewDriverRucu =
    closeCostBearer === 'driver' || faultPercentage > 0
      ? Math.round(((totalInvoiceExpense + previewYattiTotal) * faultPercentage) / 100)
      : 0;

  const handleOpenNewOrder = async () => {
    setFeedback(null);
    setIsSubmitting(true);
    try {
      await enterService({
        vehicleId: selectedVehicleId,
        entryOdometer,
        reason,
        deliveredBy,
        provider,
        estimatedExitAt,
        costBearer,
      });
      setIsNewModalOpen(false);
      setFeedback({
        type: 'success',
        text: 'Sanayi iş emri açıldı ve araç otomatik olarak ACTIVE_SERVICE_LOCK (Serviste) statüsüne alındı.',
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'İş emri açılamadı.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteIntegratedOrder = async () => {
    if (!closingCase) return;
    setFeedback(null);
    setIsSubmitting(true);
    try {
      const vObj = vehicles.find((v) => v.id === closingCase.vehicleId);
      const linkedOwner = plateOwners.find(
        (po) => po.vehicleId === closingCase.vehicleId || po.plate === vObj?.plate
      );

      if (selectedPartObj && selectedPartQty > 0) {
        updatePartStock(selectedPartObj.id, -selectedPartQty);
      }

      await completeWorkshopServiceWithFullIntegration({
        serviceCaseId: closingCase.id,
        vehicleId: closingCase.vehicleId,
        exitOdometer,
        invoiceDocumentNo,
        expenseAmount: totalInvoiceExpense,
        resultSummary,
        partsUsedSummary: selectedPartObj
          ? `${selectedPartQty}x ${selectedPartObj.name} (₺${calculatedPartCost.toLocaleString('tr-TR')}) + İşçilik ₺${laborCostTl.toLocaleString('tr-TR')}`
          : `İşçilik & Bakım: ₺${totalInvoiceExpense.toLocaleString('tr-TR')}`,
        costBearer: closeCostBearer,
        responsibleDriverId:
          closeCostBearer === 'driver' ? responsibleDriverId : undefined,
        faultPercentage: closeCostBearer === 'driver' ? faultPercentage : 0,
        downtimeDays: closeCostBearer === 'driver' ? downtimeDays : 0,
        dailyYattiRate,
        insuranceClaimNo:
          closeCostBearer === 'insurance' || closeCostBearer === 'driver'
            ? insuranceClaimNo
            : undefined,
        expertName:
          closeCostBearer === 'insurance' || closeCostBearer === 'driver'
            ? expertName
            : undefined,
        insurancePayoutTl,
        ownerSettlementId: closeCostBearer === 'owner' ? linkedOwner?.id : undefined,
      });

      setClosingCase(null);
      setFeedback({
        type: 'success',
        text: 'Sanayi çıkışı tamamlandı: Parça stoktan düşüldü, Merkezi Kasaya gider işlendi, 10.000 KM bakım sayacı sıfırlandı ve ilgili şoför/mal sahibi mahsubu otomatik yapıldı.',
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Sanayi çıkışı tamamlanamadı.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Sanayi, Atölye, Yedek Parça Stok & Sigorta/Eksper Hasar Merkezi
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            10.000 KM periyodik bakım kilidi, parça/lastik stok deposu, kasko eksper dosyası ve şoför yattı parası tam entegre yönetimi
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const v = vehicles.find((item) => item.status === 'available') || vehicles[0];
              if (v) {
                setSelectedVehicleId(v.id);
                setEntryOdometer(v.lastOdometer || 145000);
              }
              setIsNewModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
          >
            <Plus className="w-4 h-4" />
            Yeni Sanayi / Hasar İş Emri Aç
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
          <p className="text-xs font-medium">{feedback.text}</p>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold underline ml-4"
          >
            Kapat
          </button>
        </div>
      )}

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">Sanayideki Açık İş Emirleri</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-amber-600">
              {openCases.length} Araç
            </span>
            <span className="text-xs text-slate-500">ACTIVE_SERVICE_LOCK</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">10.000 KM Bakım Уyarısı / Kilidi</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-red-600">
              {maintenanceLockedVehicles.length} Plaka
            </span>
            <span className="text-xs text-slate-500">≤ 500 KM Kalan</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">Yedek Parça & Lastik Stok Kalemi</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {workshopParts.length} Grup
            </span>
            <span className="text-xs text-red-600 font-semibold">
              {criticalPartsCount} Kritik Stok
            </span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">Tamamlanan Bakım & Onarım</span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-emerald-600">
              {closedCases.length} Dosya
            </span>
            <span className="text-xs text-slate-500">Kasa & Rücu Entegreli</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('work_orders')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'work_orders'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          1. Sanayi İş Emirleri, Sigorta Eksper & Yattı Parası ({serviceCases.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('parts_inventory')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'parts_inventory'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          2. Yedek Parça, Yağ/Filtre & Taksi Lastik Deposu ({workshopParts.length})
        </button>
      </div>

      {activeTab === 'work_orders' ? (
        <div className="space-y-6">
          {/* Open & Closed Service Cases Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Sanayi İş Emirleri & Kasko/Eksper Hasar Dosyaları
                </h2>
                <p className="text-xs text-slate-500">
                  İş emri kapatıldığında parça/işçilik faturası kasaya işlenir, şoför kusuru + yattı parası şoföre rücu edilir ve +10.000 KM bakım sayacı yenilenir
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                      Plaka & Giriş/Çıkış KM
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                      Bakım / Hasar Nedeni & Atölye
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                      Maliyet Sorumlusu & Eksper
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500">
                      Fatura / Yattı / Parça
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                      Durum
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500">
                      İşlem
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {serviceCases.map((sc) => {
                    const v = vehicles.find((item) => item.id === sc.vehicleId);
                    return (
                      <tr key={sc.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="text-sm font-bold font-mono text-slate-900">
                            {v?.plate || sc.vehicleId}
                          </div>
                          <div className="text-xs text-slate-500 font-mono tabular-nums">
                            KM: {sc.entryOdometer.toLocaleString('tr-TR')}{' '}
                            {sc.exitOdometer ? `→ ${sc.exitOdometer.toLocaleString('tr-TR')}` : ''}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-xs font-bold text-slate-900">{sc.reason}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Atölye: {sc.provider} • Teslim: {sc.deliveredBy}
                          </div>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-xs">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-semibold">
                            {sc.costBearer === 'driver'
                              ? 'Şoföre Rücu (Kusurlu Hasar + Yattı)'
                              : sc.costBearer === 'owner'
                              ? 'Plaka Sahibinden Mahsup'
                              : sc.costBearer === 'insurance'
                              ? 'Kasko / Sigorta Eksper Dosyası'
                              : 'Şirket / Özmal Bakım Fonu'}
                          </span>
                          {sc.insuranceClaimNo && (
                            <div className="text-[11px] text-slate-500 font-mono mt-1">
                              Dosya: {sc.insuranceClaimNo} ({sc.expertName})
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-right font-mono tabular-nums">
                          <div className="text-sm font-bold text-slate-900">
                            {sc.expenseAmount !== undefined
                              ? `₺${sc.expenseAmount.toLocaleString('tr-TR')}`
                              : 'Açık Dosya'}
                          </div>
                          {sc.partsUsedSummary && (
                            <div className="text-[11px] text-slate-500">
                              {sc.partsUsedSummary}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          {sc.status === 'open' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              <Wrench className="w-3.5 h-3.5" /> Sanayide Açık
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Tamamlandı & Sahada
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-right">
                          {sc.status === 'open' && (
                            <button
                              type="button"
                              onClick={() => {
                                setClosingCase(sc);
                                setExitOdometer(sc.entryOdometer + 15);
                                setCloseCostBearer(sc.costBearer);
                              }}
                              className="px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
                            >
                              Fatura / Yattı / Parça İle Kapat
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {serviceCases.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-xs text-slate-500">
                        Henüz sanayi iş emri bulunmuyor. Üstteki "Yeni Sanayi / Hasar İş Emri Aç" butonuyla kayıt oluşturabilirsiniz.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Parts Inventory Tab */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Filo Yedek Parça, Periyodik Bakım Seti & Ticari Taksi Lastik Deposu
              </h2>
              <p className="text-xs text-slate-500">
                İş emirlerinde kullanılan parçalar otomatik stoktan düşer; kritik eşik altına inen parçalar kırmızı alarm verir
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                    Parça Kodu & Adı
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                    Kategori & Uyumlu Modeller
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500">
                    Birim Maliyet
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500">
                    Mevcut Stok / Kritik Eşik
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500">
                    Hızlı Stok Giriş/Çıkış
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {workshopParts.map((part) => {
                  const isLow = part.stockQty <= part.minAlertQty;
                  return (
                    <tr key={part.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="text-xs font-mono font-bold text-slate-500">
                          {part.code}
                        </div>
                        <div className="text-sm font-bold text-slate-900">{part.name}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-semibold">
                          {part.category}
                        </span>
                        <div className="text-xs text-slate-500 mt-1">
                          {part.compatibleModels}
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-right font-mono tabular-nums text-sm font-bold text-slate-900">
                        ₺{part.unitCostTl.toLocaleString('tr-TR')}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-right font-mono tabular-nums">
                        <div
                          className={`text-sm font-bold ${
                            isLow ? 'text-red-600' : 'text-emerald-600'
                          }`}
                        >
                          {part.stockQty} Adet
                        </div>
                        <div className="text-xs text-slate-500">
                          Min. Alarm: {part.minAlertQty} Adet
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updatePartStock(part.id, -1)}
                            className="px-2.5 py-1 border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            -1 Kullan
                          </button>
                          <button
                            type="button"
                            onClick={() => updatePartStock(part.id, 10)}
                            className="px-2.5 py-1 bg-slate-900 text-white rounded text-xs font-semibold hover:bg-slate-800"
                          >
                            +10 Depoya Ekle
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal 1: Open New Service Work Order */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                Yeni Sanayi / Bakım / Hasar İş Emri Aç
              </h3>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Taksi Plakası
                  </label>
                  <select
                    value={selectedVehicleId}
                    onChange={(e) => {
                      setSelectedVehicleId(e.target.value);
                      const v = vehicles.find((item) => item.id === e.target.value);
                      if (v) setEntryOdometer(v.lastOdometer);
                    }}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plate} ({v.status})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Sanayi Giriş KM
                  </label>
                  <input
                    type="number"
                    value={entryOdometer}
                    onChange={(e) => setEntryOdometer(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bakım / Arıza / Kaza Nedeni
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Sanayi Atölyesi / Servis
                  </label>
                  <input
                    type="text"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Aracı Teslim Eden
                  </label>
                  <input
                    type="text"
                    value={deliveredBy}
                    onChange={(e) => setDeliveredBy(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tahmini Çıkış Tarihi
                  </label>
                  <input
                    type="date"
                    value={estimatedExitAt}
                    onChange={(e) => setEstimatedExitAt(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    3-Taraf Maliyet Sorumlusu
                  </label>
                  <select
                    value={costBearer}
                    onChange={(e) =>
                      setCostBearer(
                        e.target.value as 'company' | 'driver' | 'owner' | 'insurance'
                      )
                    }
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="company">Şirket / Özmal Bakım Fonu</option>
                    <option value="driver">Şoföre Rücu (Kusurlu Kaza + Yattı)</option>
                    <option value="owner">Plaka Sahibinden Mahsup</option>
                    <option value="insurance">Kasko / Sigorta Eksper Dosyası</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleOpenNewOrder}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                {isSubmitting ? 'Açılıyor...' : 'İş Emrini Aç & Aracı Kilitle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Integrated Service Exit (Parts + Insurance + Driver Yatti + Owner Deduction) */}
      {closingCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                Tam Entegre Sanayi Çıkışı, Parça Düşümü & Yattı Parası Rücusu
              </h3>
              <button
                onClick={() => setClosingCase(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Çıkış KM (+10.000 Sayaç)
                  </label>
                  <input
                    type="number"
                    value={exitOdometer}
                    onChange={(e) => setExitOdometer(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Sanayi Fatura / Belge No
                  </label>
                  <input
                    type="text"
                    value={invoiceDocumentNo}
                    onChange={(e) => setInvoiceDocumentNo(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Maliyet Sorumlusu (3-Taraf)
                  </label>
                  <select
                    value={closeCostBearer}
                    onChange={(e) =>
                      setCloseCostBearer(
                        e.target.value as 'company' | 'driver' | 'owner' | 'insurance'
                      )
                    }
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="company">Şirket / Bakım Fonu</option>
                    <option value="driver">Kusurlu Şoför + Yattı Rücusu</option>
                    <option value="owner">Plaka Sahibi Hakediş Mahsubu</option>
                    <option value="insurance">Kasko / Sigorta Eksper</option>
                  </select>
                </div>
              </div>

              {/* Spare Part Selection & Labor Cost */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <span className="text-xs font-bold text-slate-800 block">
                  1. Depodan Kullanılan Yedek Parça & İşçilik Hesabı
                </span>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs text-slate-600 mb-1">
                      Stoktan Düşülecek Parça / Bakım Seti
                    </label>
                    <select
                      value={selectedPartId}
                      onChange={(e) => setSelectedPartId(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs bg-white"
                    >
                      {workshopParts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} · {p.name} (Stok: {p.stockQty} · ₺{p.unitCostTl})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Adet</label>
                    <input
                      type="number"
                      min={0}
                      value={selectedPartQty}
                      onChange={(e) => setSelectedPartQty(Number(e.target.value))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono bg-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">
                      Atölye İşçilik / Boya / Kalibrasyon Tutarı (₺)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={laborCostTl}
                      onChange={(e) => setLaborCostTl(Number(e.target.value))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono bg-white"
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    <div className="p-2 bg-white border border-slate-200 rounded-lg text-xs font-mono flex items-center justify-between">
                      <span>Toplam Sanayi Faturası:</span>
                      <strong className="text-slate-900">
                        ₺{totalInvoiceExpense.toLocaleString('tr-TR')}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Driver Fault & Yatti Parasi / Insurance Claim Section */}
              {(closeCostBearer === 'driver' || closeCostBearer === 'insurance') && (
                <div className="p-4 bg-red-50/60 border border-red-200 rounded-xl space-y-3">
                  <span className="text-xs font-bold text-red-900 block">
                    2. Sigorta Eksper Dosyası & Kusurlu Şoför Yattı Parası Rücusu
                  </span>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-700 mb-1">
                        Sorumlu Şoför
                      </label>
                      <select
                        value={responsibleDriverId}
                        onChange={(e) => setResponsibleDriverId(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                      >
                        {drivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-700 mb-1">
                        Şoför Kusur Oranı (%)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={faultPercentage}
                        onChange={(e) => setFaultPercentage(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-700 mb-1">
                        Sanayide Yattı Günü
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={downtimeDays}
                        onChange={(e) => setDowntimeDays(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono bg-white"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-slate-700 mb-1">
                        Sigorta / Kasko Dosya No
                      </label>
                      <input
                        type="text"
                        value={insuranceClaimNo}
                        onChange={(e) => setInsuranceClaimNo(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-700 mb-1">
                        Atanan Eksper
                      </label>
                      <input
                        type="text"
                        value={expertName}
                        onChange={(e) => setExpertName(e.target.value)}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-700 mb-1">
                        Günlük Yattı Bedeli (₺)
                      </label>
                      <input
                        type="number"
                        value={dailyYattiRate}
                        onChange={(e) => setDailyYattiRate(Number(e.target.value))}
                        className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono bg-white"
                      />
                    </div>
                  </div>
                  <div className="p-2.5 bg-white border border-red-200 rounded-lg text-xs font-mono flex items-center justify-between text-red-800">
                    <span>
                      Şoför Carisine Otomatik Rücu Edilecek (Fatura + {downtimeDays} Gün Yattı × %{faultPercentage}):
                    </span>
                    <strong className="text-sm">
                      ₺{previewDriverRucu.toLocaleString('tr-TR')}
                    </strong>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Yapılan Bakım / Onarım Sonuç Özeti
                </label>
                <input
                  type="text"
                  value={resultSummary}
                  onChange={(e) => setResultSummary(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setClosingCase(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleCompleteIntegratedOrder}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                {isSubmitting
                  ? 'Entegre Kapanış İşleniyor...'
                  : 'Sanayi Çıkışını Onayla & Kasaya/Cariye İşle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
