# Sıfır Güven (Zero-Trust) Yetkilendirme, Nakit/İBAN Dekontlu Tahsilat Onayı, Fotoğraflı Ceza İtirazı ve Uçtan Uca Güvenlik Mimarisi

Bu plan; sistemdeki tüm güvenlik zafiyetlerini (giriş ekranında rol seçebilme, üst menüden rol/profil değiştirebilme, şoförün onaysız borç düşebilmesi ve başka şoförlerin verilerini görebilmesi) tamamen kapatan, **10 hazır kullanıcı hesabını sabit kullanıcı adı/şifre ve yetki sınırlarıyla** devreye alan ve **Şoför Mobil → Operasyon / Gişe / Hukuk / Yönetici** arasındaki tüm onay süreçlerini uçtan uca tamamlayan mimariyi tanımlar.

---

### Kullanıcı Onayı & Netleştirilen Kritik Kararlar

> [!IMPORTANT]
> **Onaylanan Temel Güvenlik ve İşleyiş Kuralları:**
> - **Giriş Ekranında Rol Seçimi ve Demo Butonları Kaldırıldı:** Giriş ekranında hiçbir rol seçimi veya tek tıkla demo girişi yer almayacak; yalnızca sistem yöneticisinin tanımladığı **Kullanıcı Adı ve Şifre** ile giriş yapılacaktır. Aşağıdaki tabloda yer alan 10 hazır hesap sistemde tanımlı olacak ve şifreleriyle doğrudan giriş yapılabilecektir.
> - **Tam Veri ve Ekran İzolasyonu:** Giriş yapan kullanıcı kendi rolünü veya görüntülediği şoför/plaka sahibi profilini asla değiştiremez. Şoför yalnızca kendi zimmet/cari/ceza verisini, Plaka Sahibi yalnızca kendi plakalarını görür.
> - **Nakit / İBAN Seçenekli Ödeme ve Dekont Onay Zorunluluğu:** Şoför **Cari & Yevmiye** sekmesinden ödeme bildirirken **Nakit (Gişeye Teslim)** veya **İBAN / FAST (Kameralı Dekont Fotoğrafı Zorunlu)** seçeneğini kullanır. Bildirim gönderildiğinde borç anında düşmez; **Gişe/Finans** ve **Yönetici** ekranındaki **"Bekleyen Ödeme & Dekont Onay Kutusu"**na düşer. Yetkili dekont fotoğrafını veya nakit teslimatı onayladığında borçtan düşülür ve kasaya işlenir.
> - **Vardiya Çıkış ve Saha Devir Onay Süreci:** Şoför 4 yön fotoğraf, KM, yakıt ve taksimetre bilgisiyle çıkış talebi gönderdiğinde vardiya `Onay Bekliyor` (`pending_approval`) olarak **Operasyon 12-Kapı Çıkış Kuyruğuna** düşer; Operasyon/Yönetici onayladığında vardiya aktifleşir. Sahada 2. şoföre QR/PIN ile nöbet devrinde ise karşılıklı PIN ve 4 yön fotoğraf doğrulamasıyla zimmet devredilir ve Operasyon ekranına canlı özet düşer.
> - **Firestore Veritabanı Güvenlik Sıkılaştırması:** Şoför rolünün kendi borç (`currentDebt`), teminat (`depositPaidAmount`) ve güven puanını (`trustScore`) değiştirmesi veritabanı kurallarıyla engellenir; kaza/çekici bildirim izinleri ve gün sonu kasa mühürleme (`day_closes`) kuralları düzeltilir.

---

## 1. Genel Bakış & Hazır Sistem Hesapları (Kullanıcı Adı & Şifre Tablosu)

Sistemde her birim ve rol için önceden tanımlanmış, şifresi ve veri erişim sınırı kilitlenmiş **10 kurumsal hesap** bulunmaktadır. Sistem Yöneticisi (`admin`) ayrıca yönetim panelinden yeni personel, şoför veya plaka sahibi hesabı açabilir, şifre sıfırlayabilir ve modül yetkilerini değiştirebilir.

| # | Birim / Rol Tanımı | Kullanıcı Adı | Şifre | Erişebildiği Ekranlar ve Veri Sınırı |
| :- | :--- | :--- | :--- | :--- |
| **1** | **Sistem Yöneticisi (Root Admin)** | `admin` | `Admin!2026` | Tüm modüller, **Kullanıcı & Yetki Yönetimi (IAM)**, **Canlı Birim İşlem Özetleri**, Dekont/İtiraz/Çıkış Onayları |
| **2** | **Operasyon Komuta Sorumlusu** | `operasyon` | `Operasyon!2026` | Komuta Merkezi, **12-Kapı Vardiya Çıkış Onay Kuyruğu**, Nöbet/Zimmet, Plakalar, Saha Kaza/Çekici Takibi |
| **3** | **Gişe & Finans Kasa Sorumlusu** | `finans` | `Finans!2026` | Merkezi Kasa, **Nakit & İBAN Dekont Görsel Onay Kutusu**, Şoför Cari/Teminat, Plaka Sahibi Hakediş, Gün Sonu Mührü |
| **4** | **Sanayi & Eksper Sorumlusu** | `sanayi` | `Sanayi!2026` | Sanayi & Atölye İş Emirleri, Parça Stok/Marj, Sigorta/Eksper Hasar Dosyaları, Araç Bakım Kilitleri |
| **5** | **Hukuk & İtiraz Masası Sorumlusu** | `hukuk` | `Hukuk!2026` | HGS/EDS Cezaları, **Şoför Fotoğraflı İtiraz İnceleme Masası**, Hasar Rücu ve İcra Dosya Takibi |
| **6** | **Şoför 1 — Ahmet Yılmaz** (`34 TXX 101`) | `ahmet.yilmaz` | `Sofor!101` | Yalnızca **Şoför Mobil Portalı** (`d1` - Ahmet Yılmaz kişisel vardiyası, cari bakiyesi, cezaları ve belgeleri) |
| **7** | **Şoför 2 — Mehmet Demir** (`34 TXX 102`) | `mehmet.demir` | `Sofor!204` | Yalnızca **Şoför Mobil Portalı** (`d2` - Mehmet Demir kişisel vardiyası, cari bakiyesi, cezaları ve belgeleri) |
| **8** | **Şoför 3 — Ali Kaya** (`Yedek Şoför`) | `ali.kaya` | `Sofor!305` | Yalnızca **Şoför Mobil Portalı** (`d3` - Ali Kaya kişisel vardiyası, cari bakiyesi, cezaları ve belgeleri) |
| **9** | **Plaka Sahibi 1 — Hüseyin Karahan** (`34 TXX 102`) | `huseyin.karahan` | `Plaka!102` | Yalnızca **Plaka Sahibi Portalı** (`po1` - Hüseyin Karahan'a ait plakanın canlı KM, nöbet ve net kira hakedişi) |
| **10** | **Plaka Sahibi 2 — Nermin Yalçın** (`34 TXX 103`) | `nermin.yalcin` | `Plaka!103` | Yalnızca **Plaka Sahibi Portalı** (`po2` - Nermin Yalçın'a ait plakanın canlı KM, nöbet ve net kira hakedişi) |

---

## 2. Kullanıcı Deneyimi (UX) Akışları ve Görsel Tasarım

### A. Uçtan Uca Operasyonel ve Finansal İş Akışları

1. **Sıfır Güven Giriş ve Oturum Kilidi (`LoginScreen` & `AppLayout`):**
   - Kullanıcı ekranda yalnızca **Kullanıcı Adı** ve **Şifre** alanlarını görür; rol seçimi açılır menüsü yoktur.
   - Google ile giriş yapıldığında, e-posta adresi yöneticinin yetkilendirdiği hesap listesinde yoksa oturum reddedilir.
   - Üst bardaki rol değiştirme (`Yönetici / Operasyon / Finans`) ve portal değiştirme (`Yönetim / Şoför / Plaka Sahibi`) butonları kaldırılır; yalnızca Sistem Yöneticisi (`admin`) denetim amacıyla portalları inceleyebilir.

2. **Şoför Mobil — 1. Sekme: `Nöbet & Saha` (Vardiya Çıkış Onayı, QR/PIN Devir, Kaza/Çekici):**
   - **Merkezden Vardiya Çıkışı:** Şoför 4 yön araç fotoğrafı, KM, yakıt seviyesi (`1/8 - 8/8`), taksimetre fiş no ve sözleşme PIN onayını tamamlayıp gönderdiğinde talep `Onay Bekliyor` (`pending_approval`) durumuna geçer. Operasyon sorumlusu **Vardiya & Zimmet** ekranında fotoğrafları ve 12-kapı uygunluğunu görüp **"Çıkışı Onayla"** dediğinde vardiya `Aktif` olur.
   - **Sahada QR / PIN ile Nöbet Devri:** Nöbeti biten şoför ile devralan 2. şoför sahada buluştuğunda, QR kod taraması veya 4 haneli devir PIN'i + 4 yön fotoğraf ile devir yapılır; ilk şoförün vardiyası kapanırken ikinci şoförün vardiyası kesintisiz başlar.
   - **Acil Kaza Bildirimi & Çekici Çağrısı:** Tek dokunuşla GPS konumu, olay fotoğrafı ve çalışılan saat (kıstelyevm) hesaplanarak yevmiye dondurulur; eşzamanlı olarak Sanayi ekranında açık iş emri (`service_cases`) ve Cezalar/Hasar ekranında inceleme dosyası (`penalties_incidents`) oluşturulur.

3. **Şoför Mobil — 2. Sekme: `Cari & Yevmiye` (Nakit / İBAN Dekontlu Ödeme Bildirimi ve Onay Akışı):**
   - Şoför güncel yevmiye tahakkukunu, kalan cari borcunu ve net teminat durumunu tek ekranda görür.
   - **Ödeme Bildirimi Formu:**
     - Ödeme Türü: `Yevmiye / Cari Borç Ödemesi` veya `Teminat Tamamlama Ödemesi`.
     - Ödeme Yöntemi Seçimi:
       - **Nakit (Gişeye Teslim):** Teslim edilen tutar ve gişe makbuz/teslim açıklaması girilir.
       - **İBAN / FAST Havale:** Tutar, FAST sorgu/dekont numarası girilir ve **kamera/cihazdan dekont fotoğrafı (`receiptPhotoDataUrl`) yüklenmesi zorunlu tutulur**.
   - **Gişe & Yönetici Onay Kutusu:** Bildirim gönderildiğinde şoför ekranında **"Onay Bekleyen Ödeme Bildirimlerim"** listesinde `Gişe Onayı Bekliyor` olarak görünür. Gişe/Finans (`FinanceOverviewScreen`) veya Yönetici (`CommandCenterScreen`) dekont fotoğrafını büyütüp inceleyerek **"Onayla ve Kasaya İşle"** dediğinde tutar şoförün borcundan otomatik düşer; **"Reddet"** dediğinde red gerekçesi şoföre bildirilir.

4. **Şoför Mobil — 3. Sekme: `İtirazlar` (Fotoğraflı Kanıt Yükleme ve Hukuk Çözüm Masası):**
   - Şoför geçmiş HGS, EDS trafik cezası ve hasar rücu kayıtlarını listeler.
   - `Tahsilat Bekliyor` (`pending_collection`) durumundaki bir cezaya tıklayarak **kamera/galeriden kanıt fotoğrafı (taksimetre fişi, kaza tutanağı, nöbet devir belgesi)** yükler ve itiraz gerekçesini yazar.
   - İtiraz gönderildiğinde ceza `İtirazda` (`disputed`) durumuna geçer ve şoförden tahsilatı durdurulur.
   - **Hukuk / Cezalar Ekranında (`PenaltiesIncidentsScreen`) Görsel İnceleme:** Yetkili personel şoförün yüklediği kanıt fotoğrafını doğrudan inceleme modalında görür; **"İtirazı Kabul Et (İptal)"**, **"İtirazı Reddet (Borcu Kesinleştir)"** veya **"İcraya Sevk Et"** kararlarından birini uygular.

5. **Sistem Yöneticisi — Kullanıcı & Yetki Yönetimi (IAM) ve Canlı Birim İşlem Özeti Merkezi:**
   - Yönetici ekranında (`CommandCenterScreen`) **"Kullanıcı & Yetki Yönetimi (IAM)"** ve **"Birimlerden Gelen Canlı İşlem Özetleri"** sekmeleri yer alır.
   - Yönetici yeni kullanıcı açabilir, kullanıcı adı/şifre belirleyebilir, rolünü (`Operasyon`, `Finans`, `Sanayi`, `Hukuk`, `Şoför`, `Plaka Sahibi`) ve bağlı olduğu şoför/plaka kaydını atayabilir, yetkilerini düzenleyebilir veya hesabı askıya alabilir.
   - Tüm birimlerin yaptığı işlemler (Gişenin onayladığı dekontlar, Operasyonun verdiği çıkış onayları, Sanayinin kapattığı iş emirleri, Şoförlerin saha bildirimleri) gerçek zamanlı özet kartları ve denetim izi (`audit_logs`) olarak yöneticiye sunulur.

### B. Görsel Kimlik ve Tasarım Kuralları

- **Estetik Yönelim:** Kurumsal Operasyonel Komuta & Saha Ergonomisi — yüksek kontrastlı, okunaklı, veri yoğunluğuna uygun düz yüzeyler (`border border-slate-200 bg-white`), mobil ekranda tek elle başparmak kullanımına uygun (`min-h-[44px]` dokunma hedefleri) 4 sekmeli alt navigasyon çubuğu.
- **Renk Paleti:**
  - Arka Plan & Yüzeyler: `slate-50` (`#F8FAFC`) ana tuval, `white` (`#FFFFFF`) kart yüzeyleri, `slate-900` (`#0F172A`) üst komuta ve aktif sekme vurguları.
  - Durum Vurguları: Onay / Aktif Nöbet için `emerald-600` (`#16A34A`), Onay Bekleyen Dekont / Çıkış / İtiraz için `amber-600` (`#D97706`), Kritik Borç / Kaza / Blokaj için `rose-600` (`#DC2626`).
- **Tipografi ve Sayısal Hizalama:** Tüm parasal tutarlar (`₺`), kilometre sayaçları, saat damgaları ve belge/PIN kodları `tabular-nums` (`font-mono`) ile hizalanır.

---

## 3. Temel Ürün Kararları ve Mimari Gerekçeler

- **Karar 1: Ödeme Bildiriminde İki Aşamalı Mutabakat (`pending` → `settled` / `rejected`)**
  - *Seçilen Yaklaşım:* Şoförün gönderdiği nakit veya İBAN dekont bildirimi doğrudan `currentDebt` bakiyesini düşürmez; önce `ledger_entries` koleksiyonunda `status: 'pending'` olarak oluşturulur ve yalnız Gişe/Yönetici onayıyla bakiyeye işlenir.
  - *Gerekçesi:* Sahte veya hatalı tutarlı bildirimlerle şoförün kendi borcunu sıfırlamasını ve12-kapı borç kilidini aşmasını kesin olarak engeller.
- **Karar 2: Sabit Kimlik Eşleştirmesi (`driverId` / `plateOwnerId` Oturum Kilidi)**
  - *Seçilen Yaklaşım:* Her şoför ve plaka sahibi kullanıcı hesabı kendi `driverId` veya `plateOwnerId` kimliğine doğrudan bağlıdır; istemci arayüzünde profil seçici bulunmaz.
  - *Gerekçesi:* Yatay yetki aşımını (IDOR / başka şoförün hesabını görüntüleme veya onun adına işlem yapma) tamamen ortadan kaldırır.

---

## 4. Teknik Mimari ve Veri Akış Diyagramı

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                   SIFIR GÜVEN (ZERO-TRUST) KİMLİK & OTURUM KATMANI                   │
│  • 10 Sabit Kurumsal Hesap + Yönetici IAM Hesap Oluşturma / Yetki Matrisi            │
│  • Sabit Rol ve Veri Kilidi: role + driverId / plateOwnerId + allowedModules         │
└───────────────┬───────────────────────────────────┬──────────────────────────────────┘
                │                                   │
                ▼                                   ▼
┌───────────────────────────────────────┐ ┌────────────────────────────────────────────┐
│     ŞOFÖR MOBİL PORTALI (4 SEKME)     │ │   YÖNETİM, OPERASYON, GİŞE, SANAYİ, HUKUK  │
│  (Yalnızca Kendi driverId Verisi)     │ │     (Yetki Matrisine Göre Modül Erişimi)   │
├───────────────────────────────────────┤ ├────────────────────────────────────────────┤
│ 1. NÖBET & SAHA                       │ │ • OPERASYON (12-Kapı & Vardiya Masası):    │
│  • 4 Yön Foto + KM/Yakıt Çıkış Talebi─┼─┼─► Çıkış Onay Kuyruğu (Onayla / Reddet)     │
│  • QR / PIN ile 2. Şoföre Saha Devri ─┼─┼─► Canlı Zimmet Devir & KM Mutabakatı       │
│  • Kaza Bildirimi & Çekici Çağrısı   ─┼─┼─► Sanayi İş Emri + Kıstelyevm Dondurma     │
│                                       │ │                                            │
│ 2. CARİ & YEVMİYE                     │ │ • GİŞE & FİNANS (Merkezi Kasa):            │
│  • Nakit (Gişeye Teslim) Bildirimi   ─┼─┼─► Bekleyen Nakit & İBAN Dekont Onay Kutusu │
│  • İBAN / FAST + Kamera Dekont Foto  ─┼─┼─► Dekont Görsel İnceleme → Onayla/Reddet   │
│  • Onay Bekleyen / Onaylanan Ekstre   │ │   (Onayda Borç Düşer & Kasaya İşlenir)     │
│                                       │ │                                            │
│ 3. İTİRAZLAR                          │ │ • HUKUK & CEZA MASASI:                     │
│  • Geçmiş HGS/EDS/Hasar Ceza Listesi  │ │ • Fotoğraflı İtiraz İnceleme Modalı        │
│  • Kamera ile Kanıt Fotoğrafı Yükleme─┼─┼─► Kabul (İptal) / Red (Kesin) / İcra Sevk  │
│                                       │ │                                            │
│ 4. CÜZDAN & KARNELER                  │ │ • SİSTEM YÖNETİCİSİ (ROOT ADMIN):          │
│  • TUHİM, Ehliyet, SRC-2, Psikoteknik │ │ • Kullanıcı & Şifre/Yetki Yönetimi (IAM)   │
│  • 30 Günlük Nöbet & Güven Karnesi    │ │ • Birimlerden Gelen Canlı İşlem Özetleri   │
└───────────────────────────────────────┘ └────────────────────────────────────────────┘
```

### Veri Modeli ve Firestore Güvenlik Kuralları Eşleştirmesi

1. **Kullanıcı Hesapları ve Yetki Modeli (`SystemAccount` & `/users/{userId}`):**
   - `username`, `password`, `name`, `role` (`admin` | `operation` | `finance` | `workshop` | `legal` | `driver` | `owner`), `driverId?`, `plateOwnerId?`, `allowedModules: string[]`, `status: 'active' | 'suspended'`.
   - `authStore` içerisinde giriş doğrulaması, yönetici tarafından yeni hesap ekleme (`createUserAccount`), şifre/yetki güncelleme (`updateUserAccount`) ve hesap askıya alma (`toggleUserAccountStatus`) aksiyonları yer alır.

2. **Nakit / İBAN Dekontlu Ödeme Modeli (`LedgerEntryItem` & `/ledger_entries/{entryId}`):**
   - `LedgerEntryItem` alanlarına `driverId`, `driverName`, `paymentMethod: 'cash' | 'iban' | 'pos'`, `paymentKind: 'debt_payment' | 'deposit_payment'`, `receiptPhotoDataUrl?: string`, `referenceNo?: string`, `status: 'pending' | 'settled' | 'rejected'`, `reviewedBy?: string`, `reviewedAt?: string`, `rejectionReason?: string` eklenir.
   - `submitDriverPaymentNotification` aksiyonu şoförün nakit veya fotoğraflı İBAN bildirimini `status: 'pending'` olarak kaydeder.
   - `approveDriverPaymentNotification(entryId)` aksiyonu yalnızca Gişe/Finans veya Yönetici tarafından çağrılabilir; kaydı `settled` yapar ve şoförün `currentDebt` veya `depositPaidAmount` değerini günceller.
   - `rejectDriverPaymentNotification(entryId, reason)` aksiyonu kaydı `rejected` yapar ve nedeni şoföre gösterir.

3. **Fotoğraflı Ceza İtiraz Modeli (`PenaltyIncident` & `/penalties_incidents/{recordId}`):**
   - `PenaltyIncident` modelindeki `disputeProofUrl` alanı, şoförün kameradan/cihazdan yüklediği kanıt fotoğrafını (`data:image/...`) saklar.
   - `PenaltiesIncidentsScreen` ve `CommandCenterScreen` üzerinde itiraz incelenirken bu fotoğraf doğrudan görüntülenir ve yetkili karar butonlarıyla (`Kabul Et`, `Reddet`, `İcraya Sevk Et`) sonuçlandırılır.

4. **Firestore Güvenlik Kuralları (`firestore.rules`) Güncellemeleri:**
   - `/drivers/{driverId}`: Şoför rolü (`driver`) hiçbir koşulda `currentDebt`, `depositPaidAmount`, `depositRequiredAmount`, `trustScore` ve `status` alanlarını değiştiremez (`request.resource.data.diff(resource.data).affectedKeys()` kontrolü).
   - `/ledger_entries/{entryId}`: Şoför rolü yalnızca `status == 'pending'` olan ödeme bildirimi oluşturabilir; `settled` kayıt oluşturamaz veya güncelleyemez.
   - `/service_cases/{caseId}` ve `/penalties_incidents/{recordId}`: Şoförün sahadan acil kaza/çekici bildirimi oluşturabilmesi için kontrollü `create` izni tanımlanır.
   - `/day_closes/{closeId}`: `admin` ve `finance` rollerine gün sonu kasa mühürleme (`create`) izni verilir; mühürlenen kayıtların değiştirilmesi veya silinmesi (`update, delete: if false`) engellenir.
