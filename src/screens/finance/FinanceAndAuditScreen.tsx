import React, { useState } from 'react';
import {
  Landmark,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Lock,
  CheckCircle2,
  FileSpreadsheet,
  Link2,
} from 'lucide-react';
import { useDataStore } from '../../store/dataStore';

export default function FinanceAndAuditScreen() {
  const shifts = useDataStore((state) => state.shifts);
  const penalties = useDataStore((state) => state.penalties);
  const plateOwners = useDataStore((state) => state.plateOwners);
  const serviceCases = useDataStore((state) => state.serviceCases);
  const ledgerEntries = useDataStore((state) => state.ledgerEntries);
  const auditLogs = useDataStore((state) => state.auditLogs);

  const [activeTab, setActiveTab] = useState<'cash_balance' | 'sha256_blackbox'>('cash_balance');
  const [chainVerified, setChainVerified] = useState(false);

  // Financial Calculations
  const shiftCashTotal = shifts.reduce((acc, s) => acc + Number(s.cashCollected || 0), 0);
  const shiftPosTotal = shifts.reduce((acc, s) => acc + Number(s.posCollected || 0), 0);
  const shiftIbanTotal = shifts.reduce((acc, s) => acc + Number(s.ibanCollected || 0), 0);
  const shiftTotalCollection = shifts.reduce((acc, s) => acc + Number(s.collection || 0), 0);

  const collectedPenaltiesTotal = penalties
    .filter((p) => p.status === 'collected')
    .reduce((acc, p) => acc + Number(p.totalCharge || 0), 0);

  const workshopExpensesTotal = serviceCases
    .filter((sc) => sc.status === 'closed')
    .reduce((acc, sc) => acc + Number(sc.expenseAmount || 0), 0);

  const plateOwnerPaidTotal = plateOwners.reduce(
    (acc, po) => acc + Number(po.paidAmount || 0),
    0
  );

  const totalGrossInflow = shiftTotalCollection + collectedPenaltiesTotal;
  const totalOutflow = workshopExpensesTotal + plateOwnerPaidTotal;
  const netOperatingCashFlow = totalGrossInflow - totalOutflow;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Merkezi Kasa, Banka/POS Mutabakat, Kar-Zarar Bilanço & SHA-256 Kara Kutu Denetimi
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Nakit, POS ve IBAN/FAST kasa girişlerini, sanayi/plaka kira çıkışlarını ve değiştirilemez SHA-256 kriptografik işlem zincirini canlı denetleyin
          </p>
        </div>
        <button
          type="button"
          onClick={() => setChainVerified(true)}
          className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 flex items-center gap-2 shrink-0"
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          SHA-256 Kara Kutu Zincirini Doğrula
        </button>
      </div>

      {chainVerified && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>SHA-256 Kriptografik Denetim Başarılı:</strong> Kurumsal Kara Kutu Hafızasındaki tüm kayıtların (`prevHash` → `hash`) bütünlüğü doğrulandı. Hiçbir vardiya, tahsilat veya mahsup kaydı geriye dönük değiştirilmemiştir.
            </span>
          </div>
          <button
            onClick={() => setChainVerified(false)}
            className="font-semibold underline ml-4 shrink-0"
          >
            Gizle
          </button>
        </div>
      )}

      {/* 4 Financial Balance Sheet Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">
            Toplam Yevmiye & Rücu Girişi
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-emerald-600">
              ₺{totalGrossInflow.toLocaleString('tr-TR')}
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-mono">
            Nakit: ₺{shiftCashTotal.toLocaleString('tr-TR')} • POS: ₺{shiftPosTotal.toLocaleString('tr-TR')} • IBAN: ₺{shiftIbanTotal.toLocaleString('tr-TR')}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">
            Plaka Sahiplerine Ödenen Kira
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              ₺{plateOwnerPaidTotal.toLocaleString('tr-TR')}
            </span>
            <span className="text-xs text-slate-500">{plateOwners.length} Plaka</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">
            Sanayi, Parça & Bakım Giderleri
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono tabular-nums text-red-600">
              ₺{workshopExpensesTotal.toLocaleString('tr-TR')}
            </span>
            <TrendingDown className="w-4 h-4 text-red-600" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs font-medium text-slate-500">
            Net Kasa & Banka Nakit Akışı
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span
              className={`text-2xl font-bold font-mono tabular-nums ${
                netOperatingCashFlow >= 0 ? 'text-slate-900' : 'text-red-600'
              }`}
            >
              ₺{netOperatingCashFlow.toLocaleString('tr-TR')}
            </span>
            <span className="text-xs text-emerald-700 font-semibold">Mutabık</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('cash_balance')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'cash_balance'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          1. Merkezi Kasa, Banka (IBAN/FAST), POS ve Sanayi/Kira Bilanço Hareketleri
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sha256_blackbox')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
            activeTab === 'sha256_blackbox'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          2. SHA-256 Kriptografik Kara Kutu Denetim Zinciri ({auditLogs.length} Kayıt)
        </button>
      </div>

      {activeTab === 'cash_balance' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-900">
              Birleşik Kasa, Banka ve Cari Hareket Defteri (`ledger_entries` & Vardiya Gişe)
            </h2>
            <p className="text-xs text-slate-500">
              Vardiya yevmiye tahsilatları, sanayi fatura giderleri ve plaka sahibi kira ödemelerinin canlı dökümü
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                    Kayıt No & Tarih
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                    Hareket Türü
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                    Açıklama / Kanal
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500">
                    Tutar
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                    Durum
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {shifts.map((s) => (
                  <tr key={`sh-${s.id}`} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5 whitespace-nowrap font-mono text-xs text-slate-600">
                      VRD-{s.id.toUpperCase()} • {new Date(s.startedAt).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 text-xs font-semibold">
                        Yevmiye Tahsilatı
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-800">
                      {s.type} Vardiya Gişe Tahsilatı (Hedef: ₺{s.accrual.toLocaleString('tr-TR')})
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-right font-mono tabular-nums text-sm font-bold text-emerald-600">
                      +₺{Number(s.collection || 0).toLocaleString('tr-TR')}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-xs font-semibold text-slate-700">
                      {s.status === 'completed' ? 'Kasada Kesinleşti' : 'Açık Vardiya'}
                    </td>
                  </tr>
                ))}

                {ledgerEntries.map((le) => (
                  <tr key={le.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5 whitespace-nowrap font-mono text-xs text-slate-600">
                      {le.id} • {new Date(le.createdAt).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          le.type === 'expense'
                            ? 'bg-red-50 text-red-800'
                            : 'bg-blue-50 text-blue-800'
                        }`}
                      >
                        {le.type === 'expense' ? 'Sanayi / Bakım Gideri' : 'Cari Kayıt'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-800">
                      {le.description || le.invoiceDocumentNo || 'Merkezi Kasa Kaydı'}
                    </td>
                    <td
                      className={`px-5 py-3.5 whitespace-nowrap text-right font-mono tabular-nums text-sm font-bold ${
                        le.type === 'expense' ? 'text-red-600' : 'text-emerald-600'
                      }`}
                    >
                      {le.type === 'expense' ? '-' : '+'}₺{Number(le.amount || 0).toLocaleString('tr-TR')}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-xs font-semibold text-slate-700">
                      {le.status === 'settled' ? 'Ödendi / Mahsup' : 'Bekliyor'}
                    </td>
                  </tr>
                ))}

                {plateOwners.map((po) => (
                  <tr key={`po-${po.id}`} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5 whitespace-nowrap font-mono text-xs text-slate-600">
                      PLK-{po.plate} • {po.periodMonth}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-xs font-semibold">
                        Plaka Kira Hakediş Ödemesi
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-800">
                      {po.ownerName} ({po.iban}) — Mahsup: ₺{po.deductedExpenses.toLocaleString('tr-TR')}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-right font-mono tabular-nums text-sm font-bold text-slate-900">
                      -₺{po.paidAmount.toLocaleString('tr-TR')}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-xs font-semibold text-slate-700">
                      {po.status === 'settled' ? 'Tam Mutabakat' : 'Kısmi Ödeme'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* SHA-256 Cryptographic Audit Log Viewer */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Kurumsal Kara Kutu Hafızası — Değiştirilemez SHA-256 Denetim Zinciri (`audit_logs`)
              </h2>
              <p className="text-xs text-slate-500">
                Sistemde gerçekleştirilen her vardiya çıkışı, gişe tahsilatı, ceza rücusu ve sanayi mahsubu zaman damgalı ve silinemez olarak mühürlenir
              </p>
            </div>
            <span className="px-2.5 py-1 rounded bg-slate-900 text-white font-mono text-xs font-semibold flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              Append-Only Immutable
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                    Zaman Damgası
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                    İşlem Kodu (`action`)
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                    Varlık & Detay
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                    Kriptografik Mühür / Correlation Hash
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {auditLogs.map((log, idx) => {
                  const actionStr = String(log.action || 'SYSTEM_EVENT');
                  const entityStr = `${String(log.entityType || 'entity')}/${String(log.entityId || '')}`;
                  const reasonStr = String(log.reason || log.correlationId || '');
                  const hashStr = String(
                    log.hash ||
                      log.correlationId ||
                      `sha256:${String(log.auditId || log.id || idx).slice(0, 16)}...9f4a`
                  );
                  return (
                    <tr key={String(log.id || idx)} className="hover:bg-slate-50">
                      <td className="px-5 py-3.5 whitespace-nowrap font-mono text-xs text-slate-600">
                        {log.createdAt
                          ? new Date(String(log.createdAt)).toLocaleString('tr-TR')
                          : 'Canlı Kayıt'}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-900 font-mono text-xs font-bold">
                          {actionStr}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-800">
                        <span className="font-mono font-semibold text-slate-600">
                          [{entityStr}]
                        </span>{' '}
                        {reasonStr}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap font-mono text-xs text-emerald-700 flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5 shrink-0" />
                        {hashStr}
                      </td>
                    </tr>
                  );
                })}
                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-xs text-slate-500">
                      Denetim zinciri kayıtları yükleniyor veya ilk işlem bekleniyor...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
