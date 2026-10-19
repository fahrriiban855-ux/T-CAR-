import React, { useState } from 'react';
import {
  Search,
  Plus,
  CheckCircle2,
  AlertTriangle,
  ShieldX,
  User,
  CreditCard,
  X,
  ShieldAlert,
} from 'lucide-react';
import { Driver } from '../../types';
import { useDataStore } from '../../store/dataStore';
import { evaluateDriverCompliance } from '../../services/dbService';
import { evaluateDepositErosionStatus } from '../../services/decisionEngine';

const StatusBadge = ({ status }: { status: Driver['status'] }) => {
  switch (status) {
    case 'eligible':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5" /> Uygun (Direksiyona Çıkabilir)
        </span>
      );
    case 'conditional':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5" /> Aktif Zimmette / Şartlı
        </span>
      );
    case 'suspended':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-red-50 text-red-800 border border-red-200">
          <ShieldX className="w-3.5 h-3.5" /> Otomatik Bloke / Askıda
        </span>
      );
    default:
      return null;
  }
};

export default function DriverListScreen() {
  const drivers = useDataStore((state) => state.drivers);
  const addDriver = useDataStore((state) => state.addDriver);
  const recordDriverLedgerPayment = useDataStore(
    (state) => state.recordDriverLedgerPayment
  );
  const offsetDriverDebtFromDeposit = useDataStore(
    (state) => state.offsetDriverDebtFromDeposit
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [ledgerDriver, setLedgerDriver] = useState<Driver | null>(null);
  const [paymentKind, setPaymentKind] = useState<'debt_payment' | 'deposit_payment'>(
    'debt_payment'
  );
  const [paymentAmount, setPaymentAmount] = useState(1000);

  const [name, setName] = useState('');
  const [tc, setTc] = useState('');
  const [phone, setPhone] = useState('');
  const [ibbCardNo, setIbbCardNo] = useState('IBB-34-');
  const [ibbCardExpiry, setIbbCardExpiry] = useState('2027-12-31');
  const [licenseExpiry, setLicenseExpiry] = useState('2029-12-31');
  const [srcExpiry, setSrcExpiry] = useState('2028-12-31');
  const [depositRequired, setDepositRequired] = useState(20000);
  const [depositPaid, setDepositPaid] = useState(20000);
  const [maxDebtLimit, setMaxDebtLimit] = useState(5000);

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);

  const filteredDrivers = drivers.filter(
    (d) =>
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.tc.includes(searchTerm) ||
      (d.ibbCardNo || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAdd = async () => {
    setErrorMsg(null);
    if (!name || !tc || !phone || !ibbCardNo) {
      setErrorMsg(
        'Lütfen ad soyad, 11 haneli TCKN, telefon ve İBB Şoför Kartı numarasını doldurun.'
      );
      return;
    }
    if (tc.length !== 11) {
      setErrorMsg('TCKN 11 haneli olmalıdır.');
      return;
    }
    const exists = drivers.find((d) => d.tc === tc);
    if (exists) {
      setErrorMsg('Bu TCKN ile kayıtlı bir şoför zaten var.');
      return;
    }

    setIsSaving(true);
    try {
      await addDriver({
        name,
        tc,
        phone,
        status: 'eligible',
        ibbCardNo,
        ibbCardExpiry,
        licenseExpiry,
        srcExpiry,
        psychotechnicExpiry: srcExpiry,
        depositRequired,
        depositPaid,
        currentDebt: 0,
        maxDebtLimit,
        unpaidFineCount: 0,
        trustScore: 100,
        consecutiveShortfallCount: 0,
        lifetimeShiftsCompleted: 0,
        lifetimeFaultyAccidents: 0,
        hoursWorkedLast24h: 0,
      });
      setIsModalOpen(false);
      setName('');
      setTc('');
      setPhone('');
      setFeedback({
        type: 'success',
        text: 'Yeni şoför İBB Şoför Kartı, 100 güven puanı ve güvence depozitosu tanımlarıyla kaydedildi.',
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Şoför eklenirken bir hata oluştu.';
      setErrorMsg(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLedgerSubmit = async () => {
    if (!ledgerDriver) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      await recordDriverLedgerPayment(ledgerDriver.id, paymentAmount, paymentKind);
      setLedgerDriver(null);
      setFeedback({
        type: 'success',
        text: 'Şoför cari/depozito tahsilatı işlendi ve 12-Kapılı uygunluk/bloke durumu güncellendi.',
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Tahsilat işlenirken hata oluştu.';
      setFeedback({ type: 'error', text: msg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDepositOffset = async (driverId: string) => {
    setFeedback(null);
    try {
      await offsetDriverDebtFromDeposit(driverId);
      setFeedback({
        type: 'success',
        text: 'Şoför cari borcu depozitosundan otomatik mahsup edildi ve net teminat eridiği için şoför bloke edildi.',
      });
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Depozito mahsubu yapılamadı.',
      });
    }
  };

  const totalDebtSum = drivers.reduce((acc, d) => acc + (d.currentDebt || 0), 0);
  const totalDepositSum = drivers.reduce((acc, d) => acc + (d.depositPaid || 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Şoför Ömür Boyu Kara Kutu Sicili, Güven Puanı & Net Teminat Matrisi
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            İBB Şoför Kartı, 0–100 Güven Puanı, Net Teminat (Depozito - Borç) Erime Radarı ve ardışık eksik yevmiye denetimi
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          Yeni Ticari Taksi Şoförü
        </button>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between border ${
            feedback.type === 'error'
              ? 'bg-red-50 text-red-800 border-red-200'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs font-medium text-slate-500">Kayıtlı Şoför</span>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono tabular-nums">
            {drivers.length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs font-medium text-slate-500">
            Direksiyona Uygun Şoför
          </span>
          <p className="text-2xl font-bold text-emerald-600 mt-1 font-mono tabular-nums">
            {drivers.filter((d) => d.status === 'eligible').length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs font-medium text-slate-500">
            Kasada Tutulan Güvence Depozitosu
          </span>
          <p className="text-2xl font-bold text-slate-900 mt-1 font-mono tabular-nums">
            ₺{totalDepositSum.toLocaleString('tr-TR')}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-xs font-medium text-slate-500">
            Toplam Şoför Cari Borcu
          </span>
          <p className="text-2xl font-bold text-red-600 mt-1 font-mono tabular-nums">
            ₺{totalDebtSum.toLocaleString('tr-TR')}
          </p>
        </div>
      </div>

      {/* Add Driver Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">
                Yeni Ticari Taksi Şoförü & İBB Kart Kaydı
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-md">
                {errorMsg}
              </div>
            )}

            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Ad Soyad
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    type="text"
                    className="block w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    T.C. Kimlik No (11 Hane)
                  </label>
                  <input
                    value={tc}
                    onChange={(e) => setTc(e.target.value)}
                    type="text"
                    maxLength={11}
                    className="block w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-mono tabular-nums"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Telefon
                  </label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    type="tel"
                    className="block w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    İBB Şoför Kartı No (TUHİM)
                  </label>
                  <input
                    value={ibbCardNo}
                    onChange={(e) => setIbbCardNo(e.target.value)}
                    type="text"
                    className="block w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    İBB Kart Bitiş
                  </label>
                  <input
                    type="date"
                    value={ibbCardExpiry}
                    onChange={(e) => setIbbCardExpiry(e.target.value)}
                    className="block w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Ehliyet Bitiş
                  </label>
                  <input
                    type="date"
                    value={licenseExpiry}
                    onChange={(e) => setLicenseExpiry(e.target.value)}
                    className="block w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    SRC / Psikoteknik
                  </label>
                  <input
                    type="date"
                    value={srcExpiry}
                    onChange={(e) => setSrcExpiry(e.target.value)}
                    className="block w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Hedef Depozito (₺)
                  </label>
                  <input
                    type="number"
                    value={depositRequired}
                    onChange={(e) => setDepositRequired(Number(e.target.value))}
                    className="block w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Alınan Depozito (₺)
                  </label>
                  <input
                    type="number"
                    value={depositPaid}
                    onChange={(e) => setDepositPaid(Number(e.target.value))}
                    className="block w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Borç Bloke Limiti (₺)
                  </label>
                  <input
                    type="number"
                    value={maxDebtLimit}
                    onChange={(e) => setMaxDebtLimit(Number(e.target.value))}
                    className="block w-full px-2.5 py-1.5 border border-slate-300 rounded text-sm font-mono tabular-nums"
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                disabled={isSaving}
                className="px-4 py-2 text-xs font-medium text-slate-700"
              >
                İptal
              </button>
              <button
                onClick={handleAdd}
                disabled={isSaving}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50"
              >
                {isSaving ? 'Kaydediliyor...' : 'Şoförü Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Driver Ledger Payment Modal */}
      {ledgerDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                Şoför Cari & Depozito Tahsilatı ({ledgerDriver.name})
              </h3>
              <button
                onClick={() => setLedgerDriver(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono tabular-nums space-y-1">
                <div>
                  Güncel Cari Borç:{' '}
                  <strong className="text-red-600">
                    ₺{(ledgerDriver.currentDebt || 0).toLocaleString('tr-TR')}
                  </strong>
                </div>
                <div>
                  Güvence Depozitosu:{' '}
                  <strong>
                    ₺{(ledgerDriver.depositPaid || 0).toLocaleString('tr-TR')} / ₺
                    {(ledgerDriver.depositRequired || 20000).toLocaleString('tr-TR')}
                  </strong>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tahsilat Türü
                </label>
                <select
                  value={paymentKind}
                  onChange={(e) =>
                    setPaymentKind(e.target.value as 'debt_payment' | 'deposit_payment')
                  }
                  className="block w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                >
                  <option value="debt_payment">Cari Yevmiye/Hasar Borcu Tahsilatı</option>
                  <option value="deposit_payment">Güvence Depozitosu Tahsilatı</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tahsilat Tutarı (₺)
                </label>
                <input
                  type="number"
                  min={1}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  className="block w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-mono tabular-nums"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => setLedgerDriver(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700"
              >
                Vazgeç
              </button>
              <button
                onClick={handleLedgerSubmit}
                disabled={isSaving}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50"
              >
                {isSaving ? 'İşleniyor...' : 'Tahsilatı Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              aria-label="İsim, TCKN veya İBB Şoför Kartı ara"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                  Şoför & TCKN
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                  Güven Puanı & Kara Kutu Sicili
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                  İBB Kartı & Belgeler
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500">
                  Depozito / Net Teminat
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500">
                  Cari Borç / Erime
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                  12-Kapı Uygunluk & Kilit
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500">
                  İşlem
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredDrivers.map((driver) => {
                const issues = evaluateDriverCompliance(driver);
                const erosion = evaluateDepositErosionStatus(driver);
                const trustScore = driver.trustScore ?? 92;
                return (
                  <tr key={driver.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-slate-600" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900">
                            {driver.name}
                          </div>
                          <div className="text-xs text-slate-500 font-mono tabular-nums">
                            TC: {driver.tc} • {driver.phone}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded font-mono font-bold text-xs ${
                            trustScore <= 60
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : trustScore <= 80
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {trustScore} / 100
                        </span>
                        <span className="text-xs text-slate-500 font-mono">
                          {driver.lifetimeShiftsCompleted ?? 120} Vardiya
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Ardışık Eksik: {driver.consecutiveShortfallCount || 0} • Kusurlu Kaza:{' '}
                        {driver.lifetimeFaultyAccidents || 0}
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-xs font-mono tabular-nums">
                      <div className="font-semibold text-slate-900">
                        {driver.ibbCardNo || 'IBB-34-TANIMSIZ'}
                      </div>
                      <div className="text-slate-500">
                        İBB: {driver.ibbCardExpiry || '-'} • Ehliyet:{' '}
                        {driver.licenseExpiry || '-'}
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-right font-mono tabular-nums">
                      <div className="text-sm font-bold text-slate-900">
                        Net: ₺{erosion.netDepositRemainingTl.toLocaleString('tr-TR')}
                      </div>
                      <div className="text-xs text-slate-500">
                        Depozito: ₺{(driver.depositPaid || 0).toLocaleString('tr-TR')}
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-right font-mono tabular-nums">
                      <div
                        className={`text-sm font-bold ${
                          (driver.currentDebt || 0) > 0
                            ? 'text-red-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        ₺{(driver.currentDebt || 0).toLocaleString('tr-TR')}
                      </div>
                      <div className="text-xs text-slate-500">
                        Erime: %{erosion.erosionRatioPercent}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1">
                        <div>
                          <StatusBadge status={driver.status} />
                        </div>
                        {erosion.isCriticalErosion && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700">
                            <ShieldAlert className="w-3 h-3" /> TEMİNAT ERİMESİ KRİTİK
                          </span>
                        )}
                        {issues.length > 0 && (
                          <span className="text-xs text-red-600 font-medium">
                            {issues[0]}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-right text-xs font-medium">
                      <div className="flex items-center justify-end gap-2">
                        {erosion.isCriticalErosion && (driver.currentDebt || 0) > 0 && (
                          <button
                            onClick={() => handleDepositOffset(driver.id)}
                            className="px-2.5 py-1.5 bg-red-600 text-white text-xs font-semibold rounded hover:bg-red-700"
                          >
                            Depozitodan Mahsup
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setLedgerDriver(driver);
                            setPaymentKind(
                              (driver.currentDebt || 0) > 0
                                ? 'debt_payment'
                                : 'deposit_payment'
                            );
                            setPaymentAmount(
                              (driver.currentDebt || 0) > 0
                                ? driver.currentDebt || 1000
                                : 5000
                            );
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded hover:bg-slate-800"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          Cari / Depozito Tahsilat
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredDrivers.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-sm">
              Şoför bulunamadı.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
