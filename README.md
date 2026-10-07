# 📊 ZA_ISLAMIC — Real Vaqt Risk Kalkulyatori

Forex, Kripto va Indekslar uchun **real vaqt rejimida** ishlaydigan trading platformasi:
jonli narxlar, texnik tahlil asosida avtomatik signallar, real iqtisodiy kalendar va
real vaqtda TP/SL kuzatuvchi risk kalkulyator.

---

## 🔴 Muammo nimada edi?

Eski versiyada ma'lumotlar **real vaqtda yangilanmasdi**:

| Qism | Eski holat |
|---|---|
| Narxlar | `setInterval(..., 43200000)` — **12 soatda** bir marta |
| Signallar | `const signals = [ ... ]` — **5 ta hardkod**, umuman o'zgarmaydi |
| Iqtisodiy kalendar | `const newsData = [ ... ]` — **15 ta hardkod** voqea |
| Login | `localStorage` — server yo'q, parollar **ochiq** saqlanardi |

## 🟢 Endi qanday ishlaydi?

| Qism | Yangi holat | Tezlik |
|---|---|---|
| **Narx + indikatorlar** | TradingView Scanner — bitta so'rovda **26 ta aktiv** | **5 soniya** |
| **Kripto jonli oqimi** | Binance WebSocket (sub-sekund "push") | **real-time** |
| **Avtomatik signallar** | 4 ta timeframe + 7 ta indikator tahlili | har **30 soniya** |
| **Signal holati (TP/SL)** | Joriy narx bo'yicha qayta hisoblanadi | **5 soniya** |
| **Iqtisodiy kalendar** | ForexFactory haftalik ma'lumot | **10 daqiqa** |
| **Login / bazа** | Flask + SQLite, parollar PBKDF2 xesh bilan | — |
| **📚 Darslar** | Markdown + YouTube/MP4, tarifga qarab ochiladi | — |
| **🛡️ Admin panel** | Rol, tarif, bloklash, audit jurnali | — |

> ⚠️ **Backend kerak emas** narx, signal, grafik, risk kalkulyator va kalendar uchun —
> ular GitHub Pages da to'liq ishlaydi.
>
> **Darslar, ro'yxat va admin panel** uchun backend kerak. Buni bir marta
> `backend\install_autostart.bat` bilan o'rnatib qo'ying — keyin o'zi ishlaydi.

---

## 📁 Fayl tuzilmasi

```
├── index.html                  ← butun interfeys
├── assets/
│   ├── config.js               ← sozlamalar, aktivlar ro'yxati
│   ├── indicators.js           ← RSI, MACD, EMA, ATR, Stochastic, Bollinger
│   ├── market.js               ← real vaqt narx dvigyori
│   ├── signals.js              ← avtomatik + qo'lda signal tizimi
│   ├── calendar.js             ← iqtisodiy kalendar
│   ├── lessons.js              ← darslar (markdown + video)
│   ├── admin.js                ← admin panel, rol/tarif/bloklash
│   ├── api.js                  ← backend bilan bog'lanish + zaxira rejim
│   ├── app.js                  ← UI logikasi
│   └── style.css               ← uslublar
├── data/
│   ├── signals.json            ← qo'lda kiritiladigan signallar
│   └── calendar.json           ← avtomatik yangilanadigan kalendar
├── backend/
│   ├── app.py                  ← Flask + SQLite server
│   ├── requirements.txt
│   ├── install_autostart.bat   ← Windows da bir marta o'rnatish
│   ├── start_backend.bat       ← qo'lda ishga tushirish
│   ├── stop_server.bat         ← qo'lda to'xtatish
│   ├── za_config.json          ← sozlamalar (maxfiy, .gitignore da)
│   ├── python_path.txt         ← topilgan Python yo'li
│   └── backend.log             ← oxirgi xatolar
├── render.yaml                 ← bulut deploy (Render.com) sozlamasi
├── .github/workflows/
│   └── calendar.yml            ← har 10 daqiqada kalendarni yangilaydi
└── README.md
```

---

## 🚀 Ishga tushirish

### 1. Faqat sayt (backend'siz) — 5 soniya

```bash
python -m http.server 8080
```
Brauzerda `http://127.0.0.1:8080/` ni oching.

### 2. To'liq rejim (backend bilan)

```bash
cd backend
pip install -r requirements.txt
python app.py
```
Keyin `http://127.0.0.1:8000/` ni oching — backend ham saytni o'zi beradi.

### 3. GitHub'ga joylash (desktop dastur uchun)

```bash
git add -A
git commit -m "feat: real vaqt rejimi — narx, signal, kalendar"
git push origin main
```

1–2 daqiqadan keyin `https://islom6461.github.io/Risk-kalkulyatoriFOND/` yangilanadi.

> 🔑 **Nega desktop dastur ham yangilanadi?**
> `RiskKalkulyatori_FOND.exe` — bu Tauri qobig'i bo'lib, u shu GitHub Pages manzilini
> WebView2 oynasida ochadi. Saytni yangilsangiz, desktop dastur ham yangilanadi.
> Qayta build qilish shart emas.

---

## 🔐 Boshqalarga tarqatish uchun server

Frontend **server'siz ham to'liq ishlaydi** — narx, signal va kalendar to'g'ridan-to'g'ri keladi.
Server faqat **ro'yxatdan o'tish va umumiy bazа** uchun kerak: boshqa odamlar ro'yxatdan o'tsin,
bir bazada saqlansin.

### 3.1 Majburiy qadam — admin token

`ADMIN_TOKEN` **o'zgartirilmasa**, admin so'rovlari avtomatik ravishda bloklanadi (403).
Standart qiymat `za_islamic_admin` bo'lib, GitHub'da ochiq ko'rinadi.

Sozlamalar **ikki manbadan** o'qiladi (birinchisi ustun):

1. Atrof-muhit o'zgaruvchisi — `ZA_ADMIN_TOKEN`, `ZA_PORT`, `ZA_DB`
2. `backend/za_config.json` fayli

> 💡 Nega fayl ham kerak? Windows **Startup** da atrof-muhit o'zgaruvchilari
> qo'lda belgilanmaganda token yuklanmay qoladi. `za_config.json` esa har doim
> qo'lda bo'ladi. Shu sabab `install_autostart.bat` tokeni avtomatik shu faylga yozadi.

Token qo'lda yaratmoqchi bo'lsangiz (PowerShell):

```powershell
-join ((48..122) | Get-Random -Count 48 | ForEach-Object { [char]$_ })
```

### 3.2 Variant A — bulutda (bepul, tavsiya etiladi)

Boshqalar faqat **internet orqali** ulanadi. Sizning kompyuteringiz yopiq qoladi.

**Render.com** (eng oson — `render.yaml` tayyor):

1. `render.com` → **New → Blueprint** → repoyzingizni tanlang
2. Render `render.yaml` ni o'zi o'qiydi — hech narsa sozlamasdan
3. `ZA_ADMIN_TOKEN` ni Render avtomatik random qiymat bilan to'ldiradi
4. Deploy tugagandan keyin manzil: `https://za-islamic-api.onrender.com`
5. Ilovada: **Profil → Ma'lumot → Server manzili** → shu manzilni yozing

**Railway.app** alternative:
```
railway init && railway up
```
Environment ga `ZA_ADMIN_TOKEN` qo'ying, keyin `PORT` ni Render/Flask beradi.

> ⚠️ Render bepul rejada SQLite fayli **vaqtinchalik** (`/tmp`) — server o'chsa bazа
> to'planadi. Doimiy saqlash uchun Render'ga disk qo'shing yoki Railway/Postgres ishlating.

### 3.3 Variant B — o'z kompyuteringizda

**Bir marta** shu skriptni ishga tushiring:

```
backend\install_autostart.bat
```

Skript qiladigan ish:

| Qadam | Vazifasi |
|---|---|
| 1/4 | Python 3.9+ ni izlaydi, Flask'ni o'rnatadi |
| 2/4 | Yo'q bo'lsa `za_config.json` ga **xavfsiz token** yaratadi |
| 3/4 | Windows **Startup** papkasiga qisqa echim qo'yadi |
| 4/4 | Server ishga tushiradi va **haqiqatda tekshiradi** |

Tayyor bo'lgach "TAYYOR" yozuvi chiqadi. Endi har gal kompyuterni yoqsangiz
server o'zi avtomatik ishga tushadi — konsol oynasi chiqmaydi (`pythonw.exe`).

**Qo'lda boshqarish:**

| Skript | Vazifasi |
|---|---|
| `backend\start_backend.bat` | Serverni ishga tushirish (konsol oynasi bilan) |
| `backend\stop_server.bat` | Serverni to'xtatish |

> 💡 `start_backend.bat` ni xohlagancha ko'p marta bosing — `app.py` o'zini
> tekshiradi va allaqachon ishlamayotgan bo'lsa ikkinchi nusxani jim qilib
> yopadi. Xatolar `backend\backend.log` fayliga yoziladi.

> 🪟 Papka nomi kirillcha bo'lsa ham ishlaydi: skriptlar avval **qisqa (8.3)
> yo'l**ga o'tadi, chunki `cmd.exe` kirill yo'llarni buzadi.

> ⚠️ O'z kompyuteringizga tashqaridan ulanish uchun port forward + statik IP kerak
> va xavfsiz emas. Sifatli natija uchun bulut variantidan foydalaning.

### 3.4 Server manzilini o'zgartirish

Ilovada **Profil → Ma'lumot** oynasida:

```
Server manzili: https://za-islamic-api.onrender.com
[💾 Saqlash va tekshirish]
```

Manzil `localStorage` da saqlanadi. Boshqa foydalanuvchilar o'z kompyuterida
bir xil manzilni kiritishlari kerak (yoki `?api=https://...` bilan ochishlari mumkin).

---

## 🔑 API manbalari

| Ma'lumot | Manba | Kalit |
|---|---|---|
| Narx + indikatorlar | `scanner.tradingview.com/global/scan` | kerak emas |
| Kripto push oqimi | `wss://stream.binance.com` | kerak emas |
| Iqtisodiy kalendar | `nfs.faireconomy.media` | kerak emas |

> Eski FCS API kaliti (`yrubfbo...`) olib tashlandi — uning rejasida
> **3 so'rov/daqiqa** limiti bor edi, real vaqt uchun yetarli emas.

### Nima uchun `text/plain`?

TradingView scanner'ga so'rov `Content-Type: application/json` bilan yuborilsa,
brauzer CORS preflight yuboradi va TradingView faqat `Referer,Accept`
sarlavhalariga ruxsat beradi — so'rov rad etiladi.
`text/plain` esa CORS-safe, shuning uchun preflight umuman yuborilmaydi
(`assets/market.js` ichidagi `fetchTV`).

---

## 📈 Avtomatik signal tizimi

Har 30 sekundda barcha 26 aktiv tekshiriladi. Baho **−10 … +10** oralig'ida:

| Manba | Kuch | Vazifa |
|---|---|---|
| TradingView tavsiyasi (kunlik) | 2.0 | umumiy trend |
| TradingView tavsiyasi (1 soat) | 2.0 | asosiy signal |
| TradingView tavsiyasi (15 daqiqa) | 1.5 | kirish vaqti |
| TradingView tavsiyasi (4 soat) | 1.5 | umumiy yo'nalish |
| RSI(14 · 1 soat) | 2.0 | ortiqcha xarid/sotish |
| MACD (1 soat + 15 daqiqa) | 2.5 | momentum |
| EMA9 vs EMA21 | 1.5 | trend kuchi |
| Narx vs SMA50 | 1.0 | trend tasdig'i |
| Stochastic(14) | 1.0 | qaytish nuqtalari |
| Bollinger bandlari | 0.8 | chegaralar |

* `baho ≥ +3` → **BUY** signal · `baho ≤ −3` → **SELL** signal
* **SL** = ATR(4 soat) × 1.5 · **TP** = ATR(4 soat) × 3.0 → Risk/Reward **1:2**
* Bir aktivinga faqat bitta ochiq avtomatik signal; bir vaqtda ko'pi bilan **6 ta**
* Har 5 soniyada TP/SL ga yetgani tekshiriladi va P/L hisoblanadi

---

## ✍️ Qo'lda signal qo'shish

Ikkala usul:

**1. Ilova ichida** — Signal bo'limida `➕ Signal qo'shish` tugmasi.

**2. `data/signals.json` fayli orqali** (barcha foydalanuvchilar uchun):

```json
[
  {
    "instrument": "EURUSD",
    "pair": "EUR/USD",
    "type": "BUY",
    "entry": 1.1350,
    "sl": 1.1330,
    "tp": 1.1400,
    "status": "pending",
    "note": "Kuchli qo'llab-quvvatlash darajasidan qaytish",
    "time": "2026-09-30T10:30:00Z"
  }
]
```

Fayl har **30 soniya** tekshiriladi. `status` qiymatlar
`pending` · `active` · `tp` · `sl` · `expired`.
Holat avtomatik ravishda joriy narx bo'yicha yangilanadi.

---

## 🔐 Backend API

| Metod | Yo'l | Izoh |
|---|---|---|
| `GET` | `/api/health` | holat (`adminOk` — token o'zgartirilganmi) |
| `GET` | `/api/market/quotes` | barcha narx + indikatorlar (3 s kesh) |
| `GET` | `/api/calendar` | iqtisodiy kalendar (10 daq kesh) |
| `POST` | `/api/auth/register` | ro'yxatdan o'tish |
| `POST` | `/api/auth/login` | kirish |
| `GET` | `/api/auth/me` | profil (`Bearer <token>`) |
| `POST` | `/api/auth/logout` | chiqish |
| `GET` | `/api/signals` | signal ro'yxati |
| `POST` | `/api/signals` | signal qo'shish (admin) |
| `POST` | `/api/signals/bulk` | ko'p signal (admin) |
| `PATCH` | `/api/signals/<id>` | yangilash (admin) |
| `DELETE` | `/api/signals/<id>` | o'chirish (admin) |
| `GET` | `/api/auth/users` | foydalanuvchilar (admin) |

Admin sarlavhasi: `X-Admin-Token: <ADMIN_TOKEN>`

Sozlamalar (ustunlik tartibi bilan):

| Nomi | Standart | Vazifa |
|---|---|---|
| `ADMIN_TOKEN` / `ZA_ADMIN_TOKEN` | `za_islamic_admin` | admin kaliti — **albatta o'zgartiring** |
| `PORT` / `ZA_PORT` | `8000` | port |
| `DB` / `ZA_DB` | `backend/za_islamic.db` | bazа fayli |
| `RATE_READ` / `ZA_RATE_READ` | `600` | daqiqada o'qish so'rovi |
| `RATE_WRITE` / `ZA_RATE_WRITE` | `60` | daqiqada yozish so'rovi |
| `RATE_LOGIN` / `ZA_RATE_LOGIN` | `15` | daqiqada kirish urinish |

Har bir sozlamani **ikki manbadan** o'qish mumkin — oldingi ustun:

1. Atrof-muhit o'zgaruvchisi (`ZA_<NOMI>`)
2. `backend/za_config.json` fayli

```json
{
  "ADMIN_TOKEN": "bu_yerda_tasodifiy_40_belgi",
  "PORT": "8000"
}
```

> 🔒 `za_config.json` `.gitignore` da — maxfiy token hech qachon GitHub'ga tushmaydi.

Xavfsizlik:
* Parollar — **PBKDF2-SHA256**, 260 000 iteratsiya + 16 baytli tasodifiy tuz
* Tokenlar — 32 baytli tasodifiy, **30 kun** muddati bilan
* Standart admin token bilan admin so'rovlari **avtomatik bloklanadi**
* CORS — so'rov `Origin` ini qaytaradi + `Vary: Origin` (cache bilan aralashmasligi uchun)
* Bloklangan foydalanuvchining **hamma seksi** darhol bekor qilinadi

---

## ⚠️ Muhim ogohlantirish

Avtomatik signallar **algoritmik tahlilga** asoslanadi — bu moliyaviy tavsiya emas.
Real bozorda signallar to'g'ri chiqmasligi mumkin. Har doim:

* Stop Loss qo'ying
* Balansingizning **1–2%** dan ko'pini riskga qo'ymang
* Risk/Reward **1:2** dan past bo'lsa savdo qilmang
* Katta summa bilan real hisobda emas, **demo** hisobda sinab ko'ring

---

## 🛠️ Tez muammolar

| Muammo | Yechim |
|---|---|
| Narxlar yangilanmayapti | Internetni tekshiring. Panel ustidagi `🔄 Hozir` ni bosing |
| `Server: yo'q (local rejim)` | Bu normal — backend ishlamayapti, narxlar baribir yangilanadi |
| Signal bo'limi qulflangan | Ro'yxatdan o'ting yoki `Mehmon sifatida` da davom eting |
| Kalendar bo'sh | GitHub Actions ishga tushishi 1–2 daqiqa oladi. Yoki `data/calendar.json` ni qo'lda yangirlang |
| Port 8000 band | `set ZA_PORT=8080 python app.py` |

---

## 📄 Litsenziya

MIT