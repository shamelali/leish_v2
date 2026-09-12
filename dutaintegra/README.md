# Duta Integra — merged marketing site (explee structure × dutaintegra content)

A self-contained static build that merges **explee.com**'s conversion structure
(lead-capture hero, proof stats, pipeline walkthrough, testimonials, pay-as-you-go
calculator, FAQ, pricing tiers) onto **dutaintegra.my**'s real content, brand and
services — bilingual EN + BM, in the same plain-HTML style as the live site.

> **This folder lives inside the `leish_v2` repo**, which deploys to
> `leish.my`. dutaintegra.my's own source is not in this workspace, so this is
> the merged build as a portable static bundle: drop it into the DI site repo (or
> serve it directly) and it runs unchanged.

## Preview locally

```bash
python3 -m http.server 8000 --directory dutaintegra
# then open http://localhost:8000/
```

No build step, no dependencies. `index.html` and `ai-outbound.html` are the two
pages; everything else is assets.

## What's in the merge

| Source                                       | What was carried over                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| dutaintegra.my homepage + `/ms/`             | Bilingual EN/BM pattern, positioning, 2023/Cyberjaya stats, three retainer tiers        |
| dutaintegra.my/services                      | Eight capabilities, four-step process, "retainers not jobs" framing                     |
| dutaintegra.my/pricing                       | Web tiers from RM 500, Foundation RM 2,000, Growth RM 5,300, AI Partner RM 8,300        |
| dutaintegra.my/cases                         | AGMX, Eastelpro, Dutaconnect, Leish — with their published metrics                       |
| dutaintegra.my/about + contact + free-audit   | Founder/company diligence, contact details, five-pillar audit offer, consent language   |
| explee.com                                   | Hero lead capture, stat strip, "Learns what you sell → books meetings" pipeline, PDPA-style trust block, carousel, PAYG calculator, FAQ-before-CTA, honest "three things nobody else has" |
| **New (proposed)**                           | The **AI Outbound engine** product line + `ai-outbound.html` deep page and its pricing   |

### What is new and not yet a live Duta Integra offer

The AI outbound engine, its pricing (RM 1,500 / RM 3,500 / send-credit rates) and
the pilot timeline in `ai-outbound.html` are a **proposal** built to match DI's
existing retainer logic. Confirm the numbers before publishing — they are
indicative, not published DI rates.

### What was deliberately *not* copied

explee's testimonial wall, client logos, G2 rating and lead-count stats are other
companies' claims. They are replaced with DI's own case outcomes. **No fake
client quotes and no invented metrics appear anywhere in this build** — see
"Adding real testimonials" below.

## Files

```
dutaintegra/
├── index.html            # merged homepage (all sections)
├── ai-outbound.html      # deep page for the new AI outbound engine
├── README.md             # this file
├── tools/
│   └── check-pages.py    # dependency-free audit: tag balance, EN/BM parity, CSS + link coverage
└── assets/
    ├── css/site.css      # design system — tokens in :root, responsive, print, reduced-motion
    ├── js/site.js        # language toggle, tabs, carousel, calculator, counters, forms
    └── img/              # AI-generated placeholder imagery (swap for real photos)
```

Run the audit after any edit:

```bash
python3 tools/check-pages.py
# PASS index.html — 368 bilingual pairs, 154 classes
# PASS ai-outbound.html — 197 bilingual pairs, 82 classes
```

## Editing guide

### Brand tokens

All colour, radius, font and shadow decisions live in the `:root` block of
`assets/css/site.css`. To match the live site's palette exactly, sample it from
dutaintegra.my and replace the six `--navy-*` / `--teal` / `--amber` values —
layout does not need to change.

### Bilingual copy

Every user-visible string carries a pair of attributes and the language toggle in
the header swaps them (`EN` / `BM`, remembered in `localStorage`):

```html
<h2 data-en="Transparent pricing." data-ms="Harga telus.">Transparent pricing.</h2>
<input data-en-placeholder="yourcompany.com.my" data-ms-placeholder="syarikatanda.com.my" />
```

- `data-en` / `data-ms` are applied with `innerHTML`, so inline `<em>`, `<b>` and
  `<a>` are fine inside them. Use single quotes for attributes inside the value.
- Keep both attributes present — `python3 tools/check-pages.py` fails the build
  if an English string is added without its Bahasa Malaysia pair (the current
  build has 368 pairs on `index.html`, 197 on `ai-outbound.html`).
- The default language is English. To make Bahasa Malaysia the default, change
  `currentLang` in `assets/js/site.js` or add a server-side redirect at `/ms/`.
- A `/ms/` mirror the way the live site does it would duplicate these files with
  the BM strings as the visible defaults and the hreflang pair already in place in
  both `<head>` blocks.

### Adding real testimonials

The proof carousel on `index.html` currently carries **case outcomes**, not
quotes. When you have signed quotes, paste this markup inside
`[data-carousel-track]` (and delete a placeholder card):

```html
<article class="quote">
  <p class="quote__text" data-en="“Their words, in English.”" data-ms="“Kata-kata mereka, dalam BM.”">
    “Their words, in English.”
  </p>
  <div class="quote__metric">
    <div><b>409</b><span data-en="Warm leads" data-ms="Lead hangat">Warm leads</span></div>
    <div><b>RM 2.62</b><span data-en="Cost / lead" data-ms="Kos / lead">Cost / lead</span></div>
  </div>
  <div class="quote__foot">
    <span class="quote__av">WF</span>
    <span>
      <span class="quote__who">Full Name</span>
      <span class="quote__org" data-en="Role · Company" data-ms="Peranan · Syarikat">Role · Company</span>
    </span>
  </div>
</article>
```

Only add a quote if the person has agreed to be named — this build has none, and
the carousel says so in plain language.

### Wiring the forms

Both forms are client-side stubs. Add `data-endpoint` to send JSON anywhere:

```html
<form data-audit-form data-endpoint="/api/audit" novalidate>…</form>
```

With no endpoint the form validates, then confirms inline so the flow can be
reviewed end to end. The audit form mirrors the fields on
`dutaintegra.my/free-audit` (including the PDPA 2010 consent checkbox); the pilot
form adds target-customer and volume fields. Real delivery should keep the
consent record with the submission — that is the PDPA audit trail.

### The calculator

`#calc-emails` drives four outputs. The model is in `assets/js/site.js`
(`COST_PER_EMAIL`, `LEAD_RATE_LOW/HIGH`, `MEETING_RATE_LOW/HIGH`) and is labelled
as illustrative on the page. Replace the rates with your own pilot data once you
have it — and keep the disclaimer, because it is the honest part.

## Known gaps before this goes live

1. **Testimonials** — none are real yet; the carousel shows case outcomes instead.
2. **Pricing** — the outbound numbers are proposals, the rest match
   `dutaintegra.my/pricing` as published.
3. **Images** — AI-generated placeholders. Replace with real DI photography (the
   hero is abstract; the four case images are stand-ins for AGMX, Eastelpro,
   Dutaconnect and Leish).
4. **Forms** — need a real endpoint and consent storage.
5. **`/ms/` mirror** — the toggle is client-side, which is fine for a static
   preview but weaker for SEO than real `/ms/` URLs. The live site already has
   that structure; port this design into it rather than replacing it.
6. **Deployment** — this folder is in the `leish_v2` repo, which deploys to
   `leish.my`. Nothing here touches that deployment (it is outside `src/` and is
   not built by Next), but it must be moved to the DI repo to reach
   dutaintegra.my.

## Next.js port (if you'd rather not keep it static)

The live DI site is plain `.html`, so this build matches that. If you later move
DI to Next.js (as `leish.my` did), the natural split is: tokens → Tailwind theme,
`.card` / `.price` / `.quote` → components, `site.js` behaviour → small client
components, and the `data-en` / `data-ms` pairs → a dictionary keyed by
`lang` in a `[lang]` route segment.
