# Lemon Squeezy setup sheet

The Restash app code is **done** — it talks to Lemon Squeezy's public license
API directly (no backend). This sheet is the dashboard half. Work top to
bottom; at the end you hand back 6 values and the app is shippable.

---

## 0. Store basics (once)

- **Store name:** Restash
- Connect a payout method (Stripe or PayPal) under **Settings → Payouts**.
- Lemon Squeezy is Merchant of Record — **tax/VAT is handled for you**, nothing to configure.

---

## 1. Create 5 products

**Store → Products → New Product.** For every product below:

- **Generate license keys:** **ON**
- **Activation limit:** `3` (three Macs per license)
- **License length:** *Subscriptions* → "expires with subscription". *One-time/Lifetime* → "never expires".
- Category / icon: use the Restash app icon (`assets/brand/app/512.png`).

| # | Product name | Pricing | Visibility |
|---|---|---|---|
| 1 | **Restash — Monthly** | Subscription · **$9.99 / month** | Public |
| 2 | **Restash — Yearly** | Subscription · **$39 / year** | Public |
| 3 | **Restash — Lifetime** | Single payment · **$99** | Public |
| 4 | **Restash — Lifetime (Launch Offer)** | Single payment · **$50** | **Unlisted / Hidden** |
| 5 | **Restash — 1 Year (Launch Offer)** | Subscription · **$30 / year** | **Unlisted / Hidden** |

> Products 4 & 5 must be **Unlisted** — they're only reachable through the
> in-app one-time-offer link, never the public store.

### Product descriptions (copy-paste)

**Restash — Monthly**
> Restash is the macOS menu-bar app that keeps the things you reach for — wallet addresses, links, snippets, commands, contacts, files, even AI agent prompts — one hotkey away from any app. Billed monthly, cancel anytime.

**Restash — Yearly**
> A full year of Restash — save 67% versus monthly. Stash anything, summon it at your cursor, paste it anywhere. Includes every update released during your subscription.

**Restash — Lifetime**
> Restash, yours forever. One payment, no renewals, no expiry — and every future update included. The whole app: cursor numpad, stashes, QR decoder, agent templates, and more.

**Restash — Lifetime (Launch Offer)**
> A one-time launch offer — Restash Lifetime for $50, normally $99. Pay once, own it forever, all future updates included. This price won't return.

**Restash — 1 Year (Launch Offer)**
> A one-time launch offer — a full year of Restash for $30, normally $39.

---

## 2. Collect the 6 values

Once the products exist, gather these and hand them back:

**A. Checkout / buy links** (Product → **Share** → copy buy link):

| Key | Product |
|---|---|
| `monthly`     | Restash — Monthly |
| `yearly`      | Restash — Yearly |
| `lifetime`    | Restash — Lifetime |
| `otoLifetime` | Restash — Lifetime (Launch Offer) |
| `otoYearly`   | Restash — 1 Year (Launch Offer) |

**B. Variant IDs** — each product's numeric variant ID. Find them under
**Products → (product) → Variants**, or via the API
(`GET https://api.lemonsqueezy.com/v1/variants` with an API key from
**Settings → API**). One ID per product above.

> The app **fails open** — any valid license unlocks Restash even before the
> variant map is filled in. The IDs only make the tier label (Monthly vs.
> Lifetime), renewal bar, and upsells accurate. So checkout links are the hard
> launch blocker; variant IDs are a quick polish step.

**C. Support email** — confirm the real inbox (placeholder is `support@restash.app`).

---

## 3. What happens in the code

I drop those values into two spots and commit:

- `renderer.js` → `CHECKOUT_URLS` (the 5 buy links) + `SUPPORT_EMAIL`
- `main.js` → `LS_VARIANT_TIERS` (variant ID → `monthly` / `yearly` / `lifetime`)

Then: buy → Lemon Squeezy emails a license key → user pastes it into
**Billing → "Enter your license key"** → the app activates it against LS and
unlocks. Done.

---

## 4. Test before shipping

1. LS has a **Test mode** — flip it on, buy with card `4242 4242 4242 4242`.
2. Copy the emailed license key, paste it into Restash's Billing modal.
3. Confirm it flips to the paid view and the free-tier limits lift.
4. Hit **Deactivate this device**, confirm it drops back to free.
5. Switch LS back to **Live mode** before launch.
