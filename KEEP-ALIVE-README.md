# Bot Keep-Alive Alternatives

## 🔄 Vercel Cron (Tavsiya etilgan)

### 📁 Fayllar:
- `cron-handler.js` - Asosiy keep-alive funksiyasi
- `vercel.json` - Vercel konfiguratsiyasi

### 🚀 Vercel da deployment:
1. Repo ni Vercel ga ulang
2. Environment variables qo'shing:
   - `BOT_TOKEN` - bot token
   - `MONITOR_CHAT_ID` - monitoring chat ID (ixtiyoriy)
3. Vercel Cron Jobs da yangi job:
   - URL: `https://your-app.vercel.app/cron`
   - Schedule: `*/5 * * * *` (har 5 daqiqa)

---

## ⚡ Supabase Edge Function

### 📁 Fayl:
- `supabase-edge/keep-alive.ts` - TypeScript Edge Function

### 🚀 Supabase da deployment:
1. Supabase project oching
2. `supabase functions deploy keep-alive`
3. Environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. Cron job:
   - Har 5 daqiqada `https://your-project.supabase.co/functions/v1/keep-alive` ga GET request

---

## 🎯 Tavsiya: Vercel

### ✯ Afzalliklari:
- **Bepul** - 100MB gacha
- **Oson** - bir click da deployment
- **Tezkor** - global CDN
- **Stabil** - ishonchli xizmat

### 📋 Vercel uchun qadam:
```bash
# Vercel CLI o'rnatish
npm i -g vercel

# Deployment
vercel --prod

# Cron job sozlash
vercel env add BOT_TOKEN
vercel env add MONITOR_CHAT_ID
```

### 🔗 Cron URL:
```
https://your-app.vercel.app/cron
```

### ⏰ Cron Job sozlamasi:
Vercel dashboard → Cron Jobs → Add Job
- **URL**: `https://your-app.vercel.app/cron`
- **Schedule**: `*/5 * * * *`
- **Name**: `bot-keep-alive`
