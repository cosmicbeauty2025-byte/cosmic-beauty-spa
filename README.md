# Cosmic Beauty Spa

Static site + Supabase backend for the Cosmic Beauty Spa (Hudson, Florida).

## Pages
| File | Purpose |
| --- | --- |
| `index.html` | Sign-in / account creation (guest + esthetician) |
| `skincare-cosmos.html` | Public home page |
| `about-christina.html` | About Christina (bio + client work) |
| `meet-the-team.html` | Team page |
| `bioelements-shop.html` | Product shop (cart, checkout via edge function) |
| `client-portal.html` | Client skin portal (routines, water, streaks, photos) |
| `esthetician-dashboard.html` | Staff dashboard (clients, bookings, facial records, reviews) |
| `inventory-manager.html` | Product/category/stock management |

## Setup
1. In your Supabase project → SQL Editor, run `supabase-schema.sql`.
2. In Supabase Auth → Users, create Christina's account:
   `christina@cosmicbeautyspa.com` with a strong password
   (her profile is auto-flagged `is_admin`).
3. Open `index.html` in a browser (or serve the folder with any static server).

## Notes
- `auth.js` (CosmicAuth) keeps a localStorage session so guest pages work without Supabase JS.
- `supabase-client.js` contains all data helpers (profiles, appointments, treatments, reviews, reorder flags, skin photos, orders).
- `bioelements-shop.html` checkout posts to a Supabase Edge Function (`supabase/functions/create-checkout`) using Stripe. To enable:
  ```
  supabase functions deploy create-checkout stripe-webhook
  supabase secrets set STRIPE_SECRET_KEY=sk_... STRIPE_WEBHOOK_SECRET=whsec_...
  ```
  Then in Stripe → Developers → Webhooks, add endpoint `https://umqqouzqmknvvabdtclq.supabase.co/functions/v1/stripe-webhook` for `checkout.session.completed`. Successful payments auto-insert a row in `orders`.
- The old duplicate files (`*(1).html`, `Claude Setup.exe`) are still in Downloads — safe to delete.
