# 🎮 Guruh Oyini Bot

Telegram guruhlarida konkurslar o'tkazish uchun to'liq avtomatlashtirilgan bot.

---

## 📋 Xususiyatlar

- 🛠 **Admin Panel** — Guruh va o'yinlarni boshqarish
- 👔 **Moderator Panel** — Tayinlangan o'yinlarni nazorat qilish
- 👤 **User Panel** — O'yinga qo'shilish, raqamlarni ko'rish, transfer
- 🛡 **Anti-Cheat** — Botlar, nakrutka va kirib-chiqishni bloklash
- 🔗 **Referral tizimi** — Har bir foydalanuvchiga unikal taklif linki
- ✨ **Guruh vizualizatsiyasi** — Chiroyli raqam e'lonlari
- ⏰ **Avtomatik tugatish** — Muddat tugaganda o'yin avtomatik yopiladi
- 📢 **Broadcast** — Foydalanuvchilar va guruhlarga mass xabar

---

## 🚀 O'rnatish

### 1. Telegram Bot yaratish

[@BotFather](https://t.me/BotFather) dan yangi bot yarating:
```
/newbot
```
Token oling va `.env` ga yozing.

### 2. Supabase sozlash

1. [supabase.com](https://supabase.com) da loyiha yarating
2. `database/schema.sql` ni SQL Editor ga nusxalab ishga tushiring
3. Project URL va Anon Key ni `.env` ga yozing

### 3. Muhit o'zgaruvchilarini sozlash

```bash
cp .env.example .env
```

`.env` faylini to'ldiring:
```env
BOT_TOKEN=7123456789:AAFxxxxx...
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
ADMIN_IDS=123456789,987654321
```

### 4. Dependencies o'rnatish

```bash
npm install
```

### 5. Botni ishga tushirish

```bash
npm start
# yoki development uchun:
npm run dev
```

---

## 📖 Foydalanish

### Admin sifatida:
1. Botni guruhga **admin** qilib qo'shing
2. Bot bilan shaxsiy chatda `/admin` buyrug'ini yozing
3. **➕ Yangi o'yin** bosing va bosqichlarni bajaring

### Foydalanuvchi sifatida:
1. Botga `/start` yozing
2. O'yinni tanlang yoki taklif linki orqali kiring
3. 🔗 **Taklif linki** tugmasidan shaxsiy havola oling
4. Linkni do'stlaringizga yuboring — har N ta odam uchun raqam olasiz!

### Guruh buyruqlari:
- `/top` — TOP 10 ishtirokchi
- `/mystats` — Shaxsiy statistika
- `/gameinfo` — O'yin ma'lumotlari

---

## 🗄 Ma'lumotlar bazasi

```
users           — Telegram foydalanuvchilari
groups          — Bot qo'shilgan guruhlar
games           — O'yinlar
game_moderators — Moderatorlar
game_participants — Ishtirokchilar
game_numbers    — Berilgan raqamlar
member_logs     — Kirish/chiqish jurnali (anti-cheat)
broadcasts      — Yuborilgan xabarlar
```

---

## 🛡 Anti-Cheat tizimi

| Tahdid | Himoya |
|--------|--------|
| Guruhdan chiqib qayta kirish | `member_logs` orqali kuzatiladi, disqualify qilinadi |
| Boshqa akkaunt bilan nakrutka | Har bir akkaunt faqat 1 marta qatnasha oladi |
| Botlar | `is_bot` tekshiruvidan o'tmaydi |
| Kirib-chiqdi loop | 2+ leave/join = disqualify |

---

## 📁 Loyiha tuzilmasi

```
src/
├── index.js              # Asosiy kirish nuqtasi
├── database/
│   └── supabase.js       # DB client
├── handlers/
│   ├── admin.js          # Admin panel
│   ├── moderator.js      # Moderator panel
│   ├── user.js           # User panel
│   ├── group.js          # Guruh hodisalari
│   └── broadcast.js      # Mass xabar
├── middlewares/
│   ├── auth.js           # Autentifikatsiya
│   └── antiCheat.js      # Anti-cheat
├── services/
│   ├── gameService.js    # O'yin logikasi
│   ├── userService.js    # Foydalanuvchi logikasi
│   └── scheduler.js      # Cron jobs
└── utils/
    ├── keyboards.js      # Tugmalar
    └── messages.js       # Xabar shablonlari
```
# game-bot
