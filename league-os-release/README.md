# League OS — Release Ready SQLite Edition

White-label futbol liga platformasi. Faqat TFC uchun emas: istalgan liga, turnir, akademiya, mahalla chempionati yoki korporativ sport musobaqasi uchun ishlaydi.

## Nimalar bor

- Public site: turnirlar, matchlar, live score, jadval, statistikalar, jamoa profillari.
- Admin panel: turnir, mavsum, jamoa, o‘yinchi, match, live event, media, poster va Telegram boshqaruvi.
- SQLite backend: Supabase yo‘q, cloud DB kerak emas.
- Telegram Login va Telegram Mini App.
- Bot va kanal ulash: token/env yoki UI orqali sozlash, test yuborish, default kanal tanlash.
- Bildirishnomalar: announcement/history, Telegram kanalga yuborish.
- White-label settings: servis nomi, slogan, ranglar, site URL, support kontakt.
- Release checklist: `/admin/launch`.
- Birinchi ishga tushirish wizard: `/setup`.

## Stack

- Next.js 16 + React 19
- SQLite via `node:sqlite`
- Telegram Bot API
- Railway deploy uchun tayyor

## Railway variables

Railway → Service → Variables:

```env
SESSION_SECRET=change-this-to-very-long-random-secret-32-plus-chars
SQLITE_PATH=/data/league-os.sqlite
UPLOAD_DIR=/data/uploads
SETUP_SECRET=change-this-setup-secret
TELEGRAM_BOT_TOKEN=123456:ABC
TELEGRAM_CHAT_ID=-100xxxxxxxxxx
ADMIN_TG_IDS=806860624,123456789
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=your_bot_username
NEXT_PUBLIC_SITE_URL=https://your-domain.up.railway.app
NODE_ENV=production
```

### Juda muhim: Railway Volume

SQLite doimiy saqlanishi uchun Railway’da Volume ulang:

- Mount path: `/data`
- Variable: `SQLITE_PATH=/data/league-os.sqlite`
- Variable: `UPLOAD_DIR=/data/uploads`

Volume ulanmasa baza deploy/restartdan keyin yo‘qolishi mumkin.

## Birinchi ishga tushirish

1. Deploy qiling.
2. Domain oching.
3. `/setup` ga kiring.
4. Liga nomi, site URL, bot username, bot token, kanal ID va birinchi admin Telegram ID kiriting.
5. `/login` orqali Telegram Login qiling.
6. `/admin/launch` da checklistni tekshiring.

Agar `SETUP_SECRET` qo‘ygan bo‘lsangiz, `/setup` formasida ham shu secretni kiriting.

## Muhim URLlar

- `/` — public bosh sahifa
- `/tournaments` — turnirlar ro‘yxati
- `/matches/[id]` — match public sahifasi
- `/teams/[id]` — jamoa profili
- `/login` — Telegram Login
- `/me` — shaxsiy kabinet
- `/setup` — birinchi sozlash wizard
- `/admin` — admin dashboard
- `/admin/launch` — reliz checklist
- `/admin/settings` — brending va Telegram settings
- `/admin/telegram` — bot/kanal ulash va test
- `/admin/notifications` — announcement va xabarlar
- `/tma` / `/tma/home` — Telegram Mini App

## Telegram kanal ulash

Kanalga botni admin qilib qo‘ying. Keyin chat ID sifatida quyidagilardan birini ishlating:

- Public kanal: `@channelusername`
- Private kanal/guruh: `-100xxxxxxxxxx`

Test: `/admin/telegram` → kanal qo‘shish → `Test`.

## Local run

```bash
npm install
npm run dev
```

Birinchi ishga tushganda SQLite file yaratiladi va demo turnir/jamoalar qo‘shiladi.

## Security notes

- `SESSION_SECRET` kuchli bo‘lsin.
- Bot tokenni envda saqlash eng xavfsiz. UI token fallback sifatida bor.
- `/api/local-db` public holatda faqat public-read jadvallarga select beradi; write/admin jadvallar uchun admin session kerak.
- Upload API faqat admin uchun ochiq.

## Fayl upload

Logo va match photo fayllari production’da `UPLOAD_DIR=/data/uploads` ichiga yoziladi va `/uploads/...` route orqali ko‘rsatiladi. Keyinchalik S3/R2 adapter qo‘shish mumkin.
