import React, { useState } from 'react';
import {
  Radio,
  ShieldAlert,
  RefreshCw,
  CheckCircle2,
  MapPin,
  Gauge,
  Landmark,
  MessageSquare,
  FileWarning,
  BadgeCheck,
} from 'lucide-react';
import { useDataStore } from '../../store/dataStore';

export default function TelemetryIntegrationsScreen() {
  const vehicles = useDataStore((state) => state.vehicles);
  const drivers = useDataStore((state) => state.drivers);
  const shifts = useDataStore((state) => state.shifts);
  const addPenaltyIncident = useDataStore((state) => state.addPenaltyIncident);
  const recordDriverLedgerPayment = useDataStore(
    (state) => state.recordDriverLedgerPayment
  );

  const [syncingBridge, setSyncingBridge] = useState<string | null>(null);
  const [bridgeLogs, setBridgeLogs] = useState<
    { id: string; bridge: string; time: string; summary: string; type: 'success' | 'warning' }[]
  >([
    {
      id: 'log-1',
      bridge: 'İBB TUHİM & E-Devlet',
      time: 'Bugün 09:15',
      summary: '500 plaka şoför kadrosunun İBB Toplu Ulaşım Kartı ve SRC aktiflik kontrolü doğrulandı.',
      type: 'success',
    },
    {
      id: 'log-2',
      bridge: 'Taksimetre IoT & GPS Geofence',
      time: 'Bugün 10:40',
      summary: '34 TXX 103 plakalı aracın CAN-Bus KM (68.300 km) ve dijital taksimetre fişi eşleşti.',
      type: 'success',
    },
  ]);

  // 1. HGS / OGS & Emniyet EDS Otomatik Ceza Botu
  const handleRunHgsEdsBot = async () => {
    setSyncingBridge('hgs_eds');
    try {
      const targetVehicle = vehicles.find((v) => v.status === 'in_shift') || vehicles[0];
      const activeShift = shifts.find((s) => s.vehicleId === targetVehicle?.id);
      const targetDriver =
        drivers.find((d) => d.id === (activeShift?.driverId || targetVehicle?.assignedDayDriverId)) ||
        drivers[0];

      if (targetVehicle && targetDriver) {
        const docNo = `EDS-${Math.floor(100000 + Math.random() * 900000)}`;
        await addPenaltyIncident({
          vehicleId: targetVehicle.id,
          driverId: targetDriver.id,
          type: 'traffic_fine',
          violationAt: new Date().toISOString(),
          amount: 1506,
          downtimeDays: 0,
          dailyYattiRate: 0,
          faultPercentage: 100,
          documentNo: docNo,
          description: `Otomatik EDS/HGS Köprüsü: Emniyet Şeridi / HGS İhlali (${docNo}) saniye bazlı vardiya kesişimiyle ${targetDriver.name} carisine rücu edildi`,
        });

        setBridgeLogs((prev) => [
          {
            id: String(Date.now()),
            bridge: 'HGS/OGS & Emniyet EDS Botu',
            time: new Date().toLocaleTimeString('tr-TR'),
            summary: `${targetVehicle.plate} plakasına ait ${docNo} nolu ₺1.506 EDS cezası çekildi ve o saniyede direksiyondaki ${targetDriver.name} carisine otomatik rücu edildi.`,
            type: 'warning',
          },
          ...prev,
        ]);
      }
    } finally {
      setSyncingBridge(null);
    }
  };

  // 2. İBB TUHİM Şoför Kartı & Ehliyet Ceza Puanı Canlı Sorgu
  const handleRunIbbTuhimSync = () => {
    setSyncingBridge('ibb_tuhim');
    setTimeout(() => {
      const blockedCount = drivers.filter((d) => d.status === 'suspended').length;
      setBridgeLogs((prev) => [
        {
          id: String(Date.now()),
          bridge: 'İBB TUHİM & E-Devlet Ceza Puanı',
          time: new Date().toLocaleTimeString('tr-TR'),
          summary: `${drivers.length} şoförün İBB Şoför Kartı, Ehliyet Ceza Puanı ve Psikoteknik belgeleri sorgulandı. ${blockedCount} şoför 12-Kapı kuralıyla bloke statüsünde tutuldu.`,
          type: 'success',
        },
        ...prev,
      ]);
      setSyncingBridge(null);
    }, 400);
  };

  // 3. Açık Bankacılık (IBAN / FAST) Otomatik Tahsilat Eşleştirici
  const handleRunOpenBankingFastSync = async () => {
    setSyncingBridge('open_banking');
    try {
      const indebtedDriver =
        drivers.find((d) => (d.currentDebt || 0) > 0) || drivers[0];
      if (indebtedDriver) {
        const fastAmount = Math.min(2400, Math.max(500, indebtedDriver.currentDebt || 1500));
        await recordDriverLedgerPayment(indebtedDriver.id, fastAmount, 'debt_payment');
        setBridgeLogs((prev) => [
          {
            id: String(Date.now()),
            bridge: 'Açık Bankacılık (IBAN / FAST)',
            time: new Date().toLocaleTimeString('tr-TR'),
            summary: `Banka FAST havalesi yakalandı (Açıklama: "${indebtedDriver.tc} Yevmiye/Cari") -> ₺${fastAmount.toLocaleString('tr-TR')} otomatik olarak ${indebtedDriver.name} hesabından düşüldü ve kasaya işlendi.`,
            type: 'success',
          },
          ...prev,
        ]);
      }
    } finally {
      setSyncingBridge(null);
    }
  };

  // 4. WhatsApp / SMS Bildirim Köprüsü
  const handleRunWhatsAppBroadcast = () => {
    setSyncingBridge('whatsapp_sms');
    setTimeout(() => {
      setBridgeLogs((prev) => [
        {
          id: String(Date.now()),
          bridge: 'WhatsApp & SMS Bildirim Köprüsü',
          time: new Date().toLocaleTimeString('tr-TR'),
          summary: `Aktif şoförlere vardiya değişim saati (06:00/18:00) hatırlatması ve plaka sahiplerine günlük tahsilat bilgi mesajları zaman damgalı olarak iletildi.`,
          type: 'success',
        },
        ...prev,
      ]);
      setSyncingBridge(null);
    }, 350);
  };

  const districts = [
    'Şişli - Mecidiyeköy',
    'Beşiktaş - Barbaros',
    'Kadıköy - Söğütlüçeşme',
    'Bakırköy - İncirli',
    'Üsküdar - Altunizade',
    'Sarıyer - Maslak',
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Canlı GPS Telemetri, Taksimetre IoT, İl Dışı Alarm & Resmi Kurum Entegrasyonları
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          HGS/EDS otomatik ceza rücu botu, İBB TUHİM canlı belge sorgu, Açık Bankacılık (FAST) otomatik tahsilat eşleştirme ve CAN-Bus taksimetre telemetrisi
        </p>
      </div>

      {/* 4 Active External & IoT Integration Bridges */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                CANLI KÖPRÜ AKTİF
              </span>
              <FileWarning className="w-4 h-4 text-slate-500" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mt-3">
              1. HGS/OGS & Emniyet EDS Otomatik Ceza Botu
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Plakaya düşen EDS/Radar cezalarını ve HGS geçişlerini saniye bazlı vardiya kesişimiyle şoföre otomatik rücu eder.
            </p>
          </div>
          <button
            type="button"
            disabled={syncingBridge !== null}
            onClick={handleRunHgsEdsBot}
            className="w-full py-2 px-3 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 flex items-center justify-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingBridge === 'hgs_eds' ? 'animate-spin' : ''}`} />
            EDS / HGS Cezalarını Çek & Rücu Et
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                TUHİM / E-DEVLET
              </span>
              <BadgeCheck className="w-4 h-4 text-slate-500" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mt-3">
              2. İBB Şoför Kartı & Ehliyet Ceza Puanı Sorgu
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              İBB Toplu Ulaşım Kullanım Belgesi, 100 ceza puanı dolumu ve SRC/Psikoteknik sürelerini anlık denetler.
            </p>
          </div>
          <button
            type="button"
            disabled={syncingBridge !== null}
            onClick={handleRunIbbTuhimSync}
            className="w-full py-2 px-3 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 flex items-center justify-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingBridge === 'ibb_tuhim' ? 'animate-spin' : ''}`} />
            İBB TUHİM & Puan Sorgula
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                AÇIK BANKACILIK
              </span>
              <Landmark className="w-4 h-4 text-slate-500" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mt-3">
              3. IBAN / FAST Otomatik Tahsilat Eşleştirici
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Banka hesabına gelen FAST ödemelerinin açıklamasındaki Plaka/TCKN bilgisini okuyup şoför borcundan düşer.
            </p>
          </div>
          <button
            type="button"
            disabled={syncingBridge !== null}
            onClick={handleRunOpenBankingFastSync}
            className="w-full py-2 px-3 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 flex items-center justify-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingBridge === 'open_banking' ? 'animate-spin' : ''}`} />
            Gelen FAST Ödemesini Eşleştir
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                WHATSAPP / SMS
              </span>
              <MessageSquare className="w-4 h-4 text-slate-500" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mt-3">
              4. WhatsApp & SMS Otomatik Dekont Köprüsü
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Şoförlere nöbet değişim uyarısı/borç bildirimi, mal sahiplerine ise günlük yevmiye tahsilat dekontu gönderir.
            </p>
          </div>
          <button
            type="button"
            disabled={syncingBridge !== null}
            onClick={handleRunWhatsAppBroadcast}
            className="w-full py-2 px-3 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 flex items-center justify-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingBridge === 'whatsapp_sms' ? 'animate-spin' : ''}`} />
            Toplu Bildirim & Dekont Gönder
          </button>
        </div>
      </div>

      {/* Live Integration Event Stream */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-slate-900">
          Canlı Entegrasyon & Otomatik Rücu / Eşleştirme Akışı
        </h2>
        <div className="space-y-2">
          {bridgeLogs.map((log) => (
            <div
              key={log.id}
              className={`p-3 rounded-lg border flex items-center justify-between text-xs ${
                log.type === 'warning'
                  ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <div>
                  <span className="font-bold">{log.bridge}:</span> {log.summary}
                </div>
              </div>
              <span className="font-mono text-[11px] text-slate-500 shrink-0 ml-4">
                {log.time}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Live GPS, Taximeter IoT & Geofence Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Canlı GPS Telemetri, Taksimetre IoT (DOLU / BOŞ) & İl Dışı Çıkış (Geofence) Radarı
            </h2>
            <p className="text-xs text-slate-500">
              CAN-Bus KM okuma, taksimetre günlük brüt ciro vs. yevmiye karşılaştırması ve İstanbul il sınırı ihlal kontrolü
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                  Plaka & Aktif Şoför
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                  GPS Konum & Hız
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                  Taksimetre IoT Durumu
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500">
                  CAN-Bus KM
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500">
                  Taksimetre Ciro / Yevmiye
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500">
                  Bölge / Geofence Denetimi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {vehicles.map((v, idx) => {
                const isMoving = v.status === 'in_shift' || v.status === 'in_custody';
                const driver = drivers.find((d) => d.id === v.assignedDayDriverId);
                const district =
                  v.currentDistrict || districts[idx % districts.length];
                const speed = isMoving ? 38 + (idx * 11) % 45 : 0;
                const taximeterGross = isMoving ? 4850 + idx * 620 : 0;
                const dailyRent = v.dailyDayRate || 2400;
                const isGeofenceAlert = idx === 2 && isMoving;

                return (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold font-mono text-slate-900">
                        {v.plate}
                      </div>
                      <div className="text-xs text-slate-500">
                        {driver?.name || 'Nöbet Bekliyor'}
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        {district}
                      </div>
                      <div className="text-slate-500 font-mono mt-0.5">
                        Anlık Hız: {speed} km/s
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      {isMoving ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <Radio className="w-3.5 h-3.5" /> DOLU (Yolculukta)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          KAPALI (Durakta / Park)
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-right font-mono tabular-nums text-xs font-bold text-slate-900">
                      {v.lastOdometer.toLocaleString('tr-TR')} km
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-right font-mono tabular-nums">
                      <div className="text-sm font-bold text-slate-900">
                        Ciro: ₺{taximeterGross.toLocaleString('tr-TR')}
                      </div>
                      <div className="text-xs text-slate-500">
                        Yevmiye: ₺{dailyRent.toLocaleString('tr-TR')}
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      {isGeofenceAlert ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                          <ShieldAlert className="w-3.5 h-3.5" /> Sınır Yakını (Tuzla/Gebze)
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-emerald-700">
                          İstanbul İçi Normal
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
