# Melodify Live — Kişisel Verilerin Korunması Aydınlatma Metni

**Son güncelleme:** [LAST UPDATED]
**Uygulama sürümü:** 1.1.0
**Veri sorumlusu:** [CONTROLLER NAME]
**Adres:** [ADDRESS]
**E-posta:** [EMAIL]
**Web sitesi:** [WEBSITE]

Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında,
Melodify Live Windows masaüstü uygulamasını kullanan kişileri bilgilendirmek için
hazırlanmıştır.

## 1. Kapsam ve çalışma modeli

Melodify Live, kullanıcının kendi bilgisayarında çalışan bir masaüstü uygulamasıdır.
Uygulama:

- kullanıcı hesabı oluşturmaz,
- geliştiriciye ait bir sunucuya veri göndermez,
- telemetri, analitik veya reklam içermez,
- çevrimiçi bir profile veri yüklemez.

Veriler kullanıcının Windows profilinde yerel olarak saklanır. Geliştirici,
aksi açıkça belirtilmedikçe bu verilere erişemez.

## 2. İşlenen kişisel veriler

| Veri grubu | Örnekler | Kaynak | Amaç |
|---|---|---|---|
| Yapılandırma | dil, tema, pencere düzeni, şablonlar, komutlar, cooldown ayarları | Kullanıcı | Uygulamanın çalışması |
| Platform kimlik bilgileri | Spotify/Kick/Twitch Client ID ve Client Secret, OAuth erişim/yenileme tokenları | Kullanıcı | Platform bağlantısı ve API çağrıları |
| Platform hesap bilgileri | kullanıcı adı, kullanıcı kimliği, sohbet odası kimliği | Platform | Sohbet ve istek işlemleri |
| Sohbet ve istek verileri | komutlar, şarkı adı/sanatçısı, isteyen kullanıcı adı, zaman | Platform sohbeti | Şarkı isteği ve yanıt işlemleri |
| Günlükler | oturum kayıtları, hata mesajları, olay meta verileri | Uygulama | Hata ayıklama ve güvenlik |
| Destek iletişimi | e-posta adresi ve yazışma içeriği | Kullanıcı | Destek talebi |
| Güncelleme kontrolleri | IP adresi ve istemci bilgisi | GitHub | Güncelleme kontrolü |

Uygulama, sohbet mesajlarını komutları yürütmek için geçici olarak işler.
Mesajların tamamı kalıcı bir sohbet arşivi olarak saklanmaz; yalnızca seçili
olaylar (ör. şarkı isteği, hata) yerel günlüklere yazılabilir.

## 3. İşleme amaçları ve hukuki sebepler

Kişisel veriler KVKK m.5 kapsamında şu sebeplerle işlenir:

- **Sözleşmenin ifası (m.5/2-c):** uygulamanın temel işlevleri, platform
  bağlantısı, şarkı isteği ve komut yönetimi.
- **Meşru menfaat (m.5/2-f):** güvenlik, hata ayıklama, kötüye kullanımın
  önlenmesi ve uygulamanın iyileştirilmesi. Bu menfaat, kullanıcının temel
  hak ve özgürlüklerine zarar vermeyecek şekilde dengelenir.
- **Hukuki yükümlülük (m.5/2-a):** yürürlükteki mevzuatın gerektirdiği
  saklama yükümlülükleri.
- **Açık rıza (m.5/1):** yalnızca gelecekte eklenebilecek isteğe bağlı
  özellikler (ör. pazarlama iletişimi) için ayrıca alınır. Uygulamanın mevcut
  sürümünde pazarlama amaçlı işleme yoktur.

Özel nitelikli kişisel veri (sağlık, inanç, biyometri vb.) hedeflenmez.

## 4. Aktarım ve yurt dışına aktarım

Uygulama, işlevini yerine getirmek için doğrudan aşağıdaki üçüncü taraf
hizmetlere istek gönderir:

- Spotify AB — kimlik doğrulama, çalma ve kuyruk işlemleri
- Kick — sohbet, kimlik doğrulama ve ödül işlemleri
- Twitch — sohbet, kimlik doğrulama ve ödül işlemleri
- GitHub — güncelleme kontrolü ve sürüm indirme

Bu sağlayıcılar yurt dışında yerleşik olabilir ve kendi gizlilik politikalarına
tabidir. Aktarım, kullanıcının ilgili platformu bağlaması ve uygulamayı
kullanmasıyla gerçekleşir. Geliştirici, bu verileri ayrıca bir sunucuda
toplamaz, saklamaz veya satmaz.

Destek e-postası üzerinden iletilen bilgiler, yalnızca talebi yanıtlamak için
kullanılır.

## 5. Saklama süreleri

| Veri | Saklama |
|---|---|
| Yapılandırma ve tercihler | Kullanıcı silene veya uygulamayı kaldırana kadar |
| Client Secret ve OAuth tokenları | Değiştirilene veya uygulama kaldırılana kadar |
| Günlükler | 30 gün; uygulama açılışında eski dosyalar silinir |
| Şarkı isteği geçmişi | 30 gün; uygulama açılışında eski dosyalar silinir |
| Destek yazışmaları | Talep çözüldükten sonra makul süre ve yasal saklama süresi |

Süre sonunda veriler silinir, yok edilir veya anonim hale getirilir.

## 6. Güvenlik tedbirleri

- Veriler kullanıcının Windows profilinde, işletim sistemi kullanıcı hesabı
  erişim kontrolleri altında saklanır.
- Client Secret ve OAuth erişim/yenileme tokenları, Windows DPAPI üzerinden
  Electron `safeStorage` ile diskte şifrelenir; şifreli değerler `config.json`
  içinde `enc:v1:` zarfını kullanır. Client ID'ler ve hassas olmayan tercihler
  okunabilir JSON olarak kalır.
- Günlüklerde token, parola ve gizli anahtar benzeri değerler, şifreli zarflar
  dahil, redakte edilir.
- Kimlik bilgileri renderer sürecine verilmez; yalnızca ana süreçte kullanılır.
- Uygulama telemetri, uzaktan izleme veya reklam içermez.
- Sürümler SHA-256 checksum ile yayımlanır; resmi 1.1.0 yapıları imzasızdır.

Windows DPAPI mevcut şifreli veriyi açamazsa (örneğin profil başka bir Windows
kullanıcısına veya makineye taşındığında), uygulama şifreli metni diskte korur,
ilgili kimlik bilgilerini eksik kabul eder ve kullanıcıdan yeniden girmesini
ister. 1.1.0 sonrasında 1.0.7'ye geri dönüş desteklenmez. Kullanıcı, Windows
hesabını, platform parolalarını ve cihazını korumakla yükümlüdür.

## 7. KVKK m.11 kapsamındaki haklar

Kullanıcılar:

- kişisel verilerinin işlenip işlenmediğini öğrenme,
- işlenmişse buna ilişkin bilgi talep etme,
- işleme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme,
- yurt içinde/yurt dışında aktarıldığı üçüncü kişileri bilme,
- eksik veya yanlış işlenmiş verilerin düzeltilmesini isteme,
- silinmesini veya yok edilmesini isteme,
- düzeltme/silme işlemlerinin aktarıldığı üçüncü kişilere bildirilmesini isteme,
- otomatik sistemlerle analiz sonucu aleyhine bir sonucun ortaya çıkmasına
  itiraz etme,
- kanuna aykırı işleme nedeniyle zarara uğraması halinde zararın giderilmesini
  talep etme

haklarına sahiptir.

Başvurular **[EMAIL]** adresine yazılı olarak iletilebilir. Talepler en geç
30 gün içinde yanıtlanır. Kullanıcı, yanıtı yetersiz bulursa KVKK'ya
(www.kvkk.gov.tr) şikâyet edebilir.

Yerel veriler için silme talebi, uygulama profilinin kaldırılmasıyla da
gerçekleştirilebilir: `%APPDATA%\melodify`.

## 8. Çerezler ve web sitesi

Masaüstü uygulaması çerez kullanmaz. Gelecekte bir web sitesi yayımlanırsa,
çerezler ve analitik için ayrı bir aydınlatma metni ve gerekiyorsa açık rıza
sunulacaktır.

## 9. Çocuklar

Uygulama çocuklara yönelik değildir ve bilerek çocuklardan kişisel veri
toplamaz. Kullanıcılar, bağlı oldukları platformların yaş koşullarına uymakla
yükümlüdür.

## 10. Değişiklikler

Bu metin, uygulama veya veri işleme faaliyetleri değiştiğinde güncellenir.
Önemli değişiklikler sürüm notlarında duyurulur. Güncel sürüm bu sayfada
yayımlanır.

## 11. İletişim

[CONTROLLER NAME]
[ADDRESS]
[EMAIL]
[WEBSITE]
