# Bill Book — Sri Lalithha Pulverisers

Take a photo of a bill → the app reads it → a person checks it → it is saved and copied into a Google Sheet (with the photo in Google Drive).

It understands 4 bills:

| Bill | Paper | Saved fields |
|---|---|---|
| **Transit Form** (ore in) | Transit Form (Duplicate), `DD…` | Stationary No, Date, Lessee, Consignee, Grade, Vehicle, Qty, Transit Form No |
| **APMDC Bill** (purchase) | APMDC GST Invoice, `PSI/…` | Invoice No, Date, Item, Qty, Taxable, CGST, SGST, Invoice Value, Vehicle |
| **Form E** (powder out) | Form E Transit Pass (Original), `MDLB…` | Stationary No, Date, Consignee, Grade, Vehicle, Qty, Sale Value |
| **Sales Bill** | Sri Lalithha Tax Invoice | Invoice No, Date, Bill To, Item, Qty, Rate, Taxable, CGST, SGST, Total |

Sample photos of each are in `samples/`.

## How it works

- **Reading:** Google Gemini (free tier). One scan = one request. Free tier is **20 requests per model per day per Google project**, reset at midnight US Pacific (≈ 12:30 / 1:30 PM IST). The app tries 4 models in turn, so one project gives **80 scans a day**. The app counts them and shows "N scans left today · refills at …".
- **Blurry photos** are caught on the phone before sending (no scan used). If Gemini says the photo is blurry, cut off or dark, the app asks for a retake.
- **Checks:** GST adds up, CGST = SGST, qty × rate = taxable, vehicle number format, bill number format, date not in the future / not a year old, duplicates.
- **APMDC Bill ↔ Transit Form** are matched by truck + quantity + date; unmatched ones show under "Needs a look".
- **Google Sheet:** every save/edit/delete updates the sheet in the background (retried later if it fails). Tabs: Monthly Summary, Transit Forms, APMDC Bills, Form E, Sales Bills.

## Code map

```
src/lib/bill-types.ts      the 4 bill types, fields, cleaning, checks, formatting (shared)
src/lib/extractor.ts       Gemini prompt + structured output + retake rules
src/lib/quota.ts           free-tier scan credits
src/lib/db.ts              Postgres (Neon) — bills, photos, ai_usage tables
src/lib/sheets.ts          Google Sheet / Drive sync
src/lib/auth.ts, proxy.ts  company name + 4-digit password login
src/lib/client/*           browser helpers: api, photo compression + blur score, cached fetch, scan flow
src/components/*           UI pieces (ui/, bill/, scan/, bills/, home/, layout/)
src/app/(app)/*            pages: Home, Scan, Bills, Bill detail
google-apps-script/Code.gs paste into the Google Sheet's Apps Script
```

## Setup

### 1. Environment variables (Vercel → Settings → Environment Variables)

See `.env.example`. Required: `DATABASE_URL` (Neon), `APP_COMPANY_NAME`, `APP_PASSWORD` (4 digits), `AUTH_SECRET`, `GEMINI_API_KEYS`, `GOOGLE_SHEETS_WEBHOOK_URL`, `NEXT_PUBLIC_GOOGLE_SHEET_URL`.

### 2. Google Sheet + Drive photos

1. Open the Google Sheet → **Extensions → Apps Script**.
2. Delete everything in `Code.gs`, paste the whole of `google-apps-script/Code.gs`, click **Save**.
3. **Deploy → New deployment** → type **Web app** → Execute as **Me**, Who has access **Anyone** → **Deploy**. Allow the permissions it asks for (Sheets + Drive).
4. Copy the **Web app URL** into `GOOGLE_SHEETS_WEBHOOK_URL` on Vercel and redeploy.
5. The tabs and the Drive folder **Bill Photos** are created automatically with the first saved bill. The old tabs (Transit Duplicate, Transit Original, Tax Invoices) can be deleted by hand.

### 3. Run locally

```bash
npm install
npm run dev
```
