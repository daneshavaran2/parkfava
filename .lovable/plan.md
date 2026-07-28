## ۱. فونت شبنم سراسری با preload و fallback

- در `src/routes/__root.tsx`: افزودن `preload` برای فایل‌های اصلی woff2 شبنم (وزن‌های ۴۰۰ و ۷۰۰ نسخهٔ FD) با `as="font"` و `crossOrigin="anonymous"`، در کنار `preconnect` فعلی به jsdelivr.
- در `src/styles.css`: تعریف `@font-face`های محلی‌شده (به‌جای اتکای کامل به CSS ریموت) با `font-display: swap`، `unicode-range` مناسب و `size-adjust`/`ascent-override` برای اینکه fallback سیستمی (Tahoma/Segoe UI/ui-sans-serif) هم‌اندازه باشد و در مرورگرهای مختلف پرش چیدمان (FOUT shift) ندهد.
- زنجیرهٔ fallback یکسان برای `--font` و `--font-display`: `'Shabnam FD', 'Shabnam', Tahoma, 'Segoe UI', ui-sans-serif, system-ui, sans-serif`.
- نگاشت وزن‌ها: وزن‌های ۸۰۰/۹۰۰ به ۷۰۰ نگاشت می‌شوند تا مرورگر bold مصنوعی نسازد؛ فونت مونو (JetBrains Mono) برای اعداد فنی/مختصات دست‌نخورده می‌ماند.
- `src/lib/csp.ts` بررسی می‌شود تا `cdn.jsdelivr.net` در `font-src`/`style-src` مجاز باشد (در حال حاضر هست) و در صورت نیاز `preload` هم بلاک نشود.

## ۲. مرکز و زوم خودکار نقشه روی آدرس ثبت‌شده در پنل مدیریت

- `CompanyMap.tsx` مرکز نقشه را از `latitude/longitude` ثبت‌شده در پنل می‌گیرد (رفتار فعلی) و زوم را این‌طور تعیین می‌کند:
  - اگر `map_zoom` در پنل مقدار داشته باشد، همان استفاده می‌شود.
  - اگر نداشته باشد، زوم به‌صورت خودکار بر اساس دقتِ مختصات و وجود آدرس انتخاب می‌شود (پیش‌فرض هوشمند: ۱۶ وقتی آدرس دقیق موجود است، ۱۳ وقتی فقط مختصات شهری/تقریبی است).
  - نقشه با `panTo` + `setZoom` نرم روی مختصات جدید می‌نشیند و مارکر دوباره ساخته نمی‌شود (جلوگیری از پرش هنگام تغییر داده).
- کلیک روی مارکر: InfoWindow کامل‌تر با نام شرکت، آدرس کامل، مختصات فرمت‌شده و دو دکمهٔ «مسیریابی نشان» و «مسیریابی گوگل‌مپ» (از همان `buildNeshanUrl`/`buildGoogleMapsDirectionsUrl` در `src/lib/geo.ts`).
- InfoWindow با کلیدهای i18n (fa/en) و escape امن مقادیر؛ کلیدهای جدید به `fa.json` و `en.json` اضافه می‌شود.
- ورود با پارامتر `?lat=&lng=` مثل قبل پنل را هایلایت می‌کند و علاوه بر آن InfoWindow را باز می‌کند.

## ۳. رفع خطای محدودیت دامنه در localhost (هر دو راه)

- افزودن پشتیبانی از یک کلید توسعه: `VITE_GOOGLE_MAPS_DEV_KEY`. اگر روی `localhost`/`127.0.0.1` بودیم و این کلید ست شده باشد، لودر گوگل‌مپ از آن استفاده می‌کند؛ در غیر این‌صورت روی دامنه‌های lovable همان کلید مدیریت‌شدهٔ فعلی به‌کار می‌رود.
- fallback بدون کلید: کامپوننت جدید `CompanyMapFallback` با Leaflet + کاشی‌های OpenStreetMap (لود دینامیک، فقط کلاینت) که همان مارکر، همان پاپ‌آپ آدرس و همان `data-testid="company-map"` را دارد. در localhost بدون کلید dev، یا هنگام خطای گوگل (`RefererNotAllowedMapError`/`gm_authFailure`)، به‌جای پیام خطا این نقشه نمایش داده می‌شود — پس هیچ خطای قرمزی در محیط توسعه دیده نمی‌شود.
- `src/lib/csp.ts`: افزودن `https://*.tile.openstreetmap.org` به `img-src` و `unpkg.com`/`cdn.jsdelivr.net` در حد نیاز برای Leaflet.
- راهنمای ساخت کلید dev (ایجاد کلید در Google Cloud، فعال‌سازی Maps JavaScript API، افزودن `http://localhost:8080/*` و `http://127.0.0.1:8080/*` به HTTP referrers) به‌صورت یک بخش کوتاه در README اضافه می‌شود؛ کلید واقعی در `.env` محلی یا از طریق تنظیمات پروژه ست می‌شود و در کد hardcode نمی‌گردد.

## بررسی نهایی

- اجرای اپ و اسکرین‌شات از `/company/esm` در ۳۷۵px و ۱۲۸۰px برای تأیید فونت، نقشه و InfoWindow.
- اجرای `test:unit` و اسکریپت `scripts/test-directions-e2e.py` تا مطمئن شویم `data-testid`ها و رفتار مسیریابی نشکسته است.

## جزئیات فنی

- Leaflet فقط با `import()` داخل کامپوننت کلاینت‌اونلی لود می‌شود تا SSR در Worker نشکند.
- `gm_authFailure` روی `window` هوک می‌شود تا خطای دامنهٔ گوگل قابل تشخیص و قابل سوییچ به fallback باشد.
- هیچ فراخوانی geocoding/Routes سمت کلاینت انجام نمی‌شود؛ مرکز نقشه فقط از مختصات ذخیره‌شده در دیتابیس می‌آید، پس نیازی به gateway نیست.
