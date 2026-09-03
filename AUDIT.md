# Nextly — Production Readiness Audit

**Audited** 2 September 2026 · **Branch** `main` @ `cba07ea` · **Stack** Next 16.3 · React 19.2 · Drizzle · Supabase
**Findings** 24 defects · 16 proposed features · 12 blocking

---

## Verdict

Nextly's accounting core is genuinely well built — integer money, landed-cost allocation,
append-only ledgers, RLS on every table, 41 passing tests and a clean typecheck. Almost none of
what is broken lives there.

**The failures are at the seams:** an import that filled the tables without going through the
posting service, two overlapping models for the same money, reports scoped to a window with no
data in it, and four screens that describe something they give you no way to do.

Beyond the defects, there is a second category this audit covers in §10: **capabilities a trading
business needs that were never built.** The system models buying and stocking extremely well. It
models *selling* thinly — no tax, no discount, no invoice, no payment status. That gap is invisible
today because there have been four sales, and it becomes urgent at about the fortieth.

| Area | State |
|---|---|
| Money core | Solid |
| Data integrity | 4 × P0 — live data already drifted |
| Domain model | Split across two tables |
| Reports | Empty by default |
| Sales model | Thin — no tax, discount, invoice or payment state |
| Storefront | No conversion path |
| Design | Dark-only |

---

## Findings index

| ID | Severity | Finding | Section |
|---|---|---|---|
| P0-1 | Blocking | Four confirmed sales, zero receipts in the ledger | §01 |
| P0-2 | Blocking | Cash paid for stock is $31.35 off the landed cost | §01 |
| P0-3 | Blocking | Drift alert measures the net, hiding the structure | §01 |
| P0-4 | Blocking | Future-dated sale invisible in every report period | §01 |
| P0-5 | Blocking | Ledger spending never reaches the P&L | §02 |
| P0-6 | Blocking | Reports default to a period with no data | §03 |
| P0-7 | Blocking | Owners page has no way to record a contribution | §04 |
| P0-8 | Blocking | Team invitations can never be accepted | §04 |
| P0-9 | Blocking | Multi-line sale entry is invisible | §05 |
| P0-10 | Blocking | Storefront has no conversion path at all | §06 |
| P0-11 | Blocking | Nothing published; publishing is buried | §06 |
| P0-12 | Blocking | App defaults to dark for everyone, forever | §07 |
| P1-1 | High | Expenses has no seeded categories | §02 |
| P1-2 | High | Margin by product ignores its own period selector | §03 |
| P1-3 | High | FX exposure shows four zeroes | §03 |
| P1-4 | High | Sign-in form ships a hard-coded admin address | §04 |
| P1-5 | High | Live margin diverges from the server on repeat lines | §05 |
| P1-6 | High | A 100% margin is displayed as a success | §05 |
| P1-7 | High | Storefront wears the dashboard's clothes | §06 |
| P1-8 | High | Density calibrated for a desk, not a phone | §07 |
| P2-1 | Medium | Command palette looks like search but isn't | §07 |
| P2-2 | Medium | No product thumbnails anywhere in admin | §07 |
| P2-3 | Medium | Activity trail has no page of its own | §07 |
| VERIFIED | — | Theme toggle works; its feedback does not | §07 |

Feature proposals `F-1` … `F-16` are in §10.

---

## Read this first

Two of the reported complaints are different problems than they look like. The implementing agent
needs to know this before touching anything.

### "I have to sell every product one by one"

The sale form **already supports unlimited line items**. `sale-form.tsx` holds
`lines: Line[]` in state, maps over it, and `saleSchema` accepts an array. The *Add line* button
exists — it is a small secondary button parked in the `SurfaceHeader`'s `action` slot, far from the
rows it appends to, on a form that opens showing exactly one row. It was never found.

This is a design failure, not a missing feature. It is fixed in the form's layout, not in the
schema. See §05.

### "These buttons don't do a thing"

**The theme toggle works.** Verified by driving the browser directly against the running dev
server: clicking *Light* flips `<html class>` from `dark` to `light`, writes
`nextly-theme=light` to localStorage, and repaints `body` from `rgb(8, 15, 20)` to
`rgb(250, 251, 252)`.

What is broken is that the buttons are 24 px, unlabelled, the "which one is on" state is a 1.5%
lightness difference invisible on a dark ground, and the middle button (*System*) genuinely does
nothing visible when the OS is already dark. It looks dead because it gives no feedback, not
because it is dead. See §07.

Everything else reported is real, and several things not reported are worse.

---

## 01 — Data integrity (blocking)

> The most serious section in this audit, and none of it was in the reported list. The
> architecture's central promise is that the cash ledger cannot drift from the documents behind
> it. In the live database, it already has.

### P0-1 · Four confirmed sales, zero sale receipts in the ledger

`createSale`, `updateSale` and `confirmSale` all post a `sales_receipt` ledger entry with
`source_kind = 'sale'` and `source_id = sale.id`. The code is correct. But the data in the
database never went through it — every ledger row is `source_kind = 'manual'`, and the four
confirmed sales have no receipt at all. In their place sits one hand-typed lump:
*"Inkomsten"*, +$350.00.

```
seq  date        dir  category            source    description                usd
───────────────────────────────────────────────────────────────────────────────────
 8   2026-08-11  in   owner_contribution  manual    Eigen investering opstart  294.75
 9   2026-08-11  out  purchase            manual    PO-001                     294.75
10   2026-08-25  in   owner_contribution  manual    Eigen investering           40.00
11   2026-08-25  out  shipping            manual    Verzendkosten               40.00
12   2026-08-29  in   sales_receipt       manual    Inkomsten                  350.00

confirmed sales V001–V004 …………… 358.00
ledger sales receipts …………………… 350.00
unexplained …………………………………………… 8.00, and not one sale is traceable to its cash
```

**How it happened.** The inventory movements *were* written, but by the importer, not the app.
Their note reads `Sale V001; weighted-average landed cost.` while `consumeStockFor` writes
`V001 at weighted-average landed cost.` — different string, different author. The single
audit-trail row confirms it: one entry, `imported master sheet`. The importer wrote stock
movements directly and skipped cash postings entirely.

That is a direct violation of the invariant `posting.ts` declares in its own header: *"Nothing
outside this file writes to `inventory_movements` or `ledger_entries`."*

**Fix.** A one-off reconciliation script — not a migration, since it touches data rather than
schema. Inside one transaction:

1. Post a reversing entry against the manual *Inkomsten* row via `reverseLedgerEntry`, reason
   `"Replaced by per-sale receipts during reconciliation"`. Do not delete it — the ledger is
   append-only and that property is the whole point.
2. For each confirmed sale, call `postLedgerEntry` with `sourceKind: 'sale'`,
   `sourceId: sale.id`, `amountCents: sale.totalCents`, `currency: sale.currency`,
   `rateMicros: sale.fxRateMicros`, `occurredAt: sale.soldAt`. Using the sale's own stored rate
   and date is essential — re-deriving them from today would rewrite history.
3. Do the same correction for PO-001 (P0-2).

Then fix the importer so every posting routes through `posting.ts`.

**Acceptance criteria**

- `SELECT COUNT(*) FROM sales s WHERE s.status='confirmed' AND NOT EXISTS (SELECT 1 FROM ledger_entries l WHERE l.source_kind='sale' AND l.source_id=s.id)` returns `0`.
- The cash balance before and after reconciliation differs by exactly $8.00 (the previously unexplained gap), and you can say why.
- The new P0-3 alert reports clean.

**Touches:** `src/server/services/posting.ts` · the import script · new `scripts/reconcile-postings.ts`

---

### P0-2 · Cash paid for stock is $31.35 off what the stock actually cost

The ledger books **$294.75** against `PO-001`. The received order's landed cost is **$326.10**
($216.43 + $95.25 + $14.42, read from `inventory_movements`). This is the same class of drift the
docs proudly note the spreadsheet had — it was imported along with everything else instead of
being corrected.

The dashboard *does* already flag this. `getAlerts()` computes `ledger_po_drift` and
`ledger_sales_drift`; both exceed the $1.00 threshold, so two warnings are live on the Overview
right now. If they have not been noticed, the alerts panel needs more visual weight (§07, P1-8).

**Fix.** Correct as part of the P0-1 reconciliation. Book the true landed cost. If the extra
$31.35 was genuinely never paid, it belongs as a payable (see F-9), not as a silent gap.

---

### P0-3 · The drift alert measures the net, so it hides the structural problem

`ledger_sales_drift` is `SUM(sales_receipt) − SUM(confirmed sales)`. Today that is **−$8.00**,
which reads like a rounding nuisance. The actual state is that *four out of four* sales have no
receipt and one unrelated lump is covering for them.

A netting check cannot tell those apart. It would report **$0.00 — perfectly healthy** — if the
lump happened to equal $358. The check passes precisely when someone has typed a plausible total,
which is the failure mode it exists to catch.

**Fix.** Add a second, stronger check that counts *unreconciled documents* rather than netting
amounts. Add both to the existing `getAlerts()` CTE:

```sql
-- confirmed sales with no receipt of their own
(SELECT COUNT(*) FROM sales s
  WHERE s.status = 'confirmed'
    AND NOT EXISTS (SELECT 1 FROM ledger_entries l
                     WHERE l.source_kind = 'sale' AND l.source_id = s.id)
)::text AS unposted_sales,

-- received purchase orders with no payment of their own
(SELECT COUNT(*) FROM purchase_orders p
  WHERE p.status = 'received'
    AND NOT EXISTS (SELECT 1 FROM ledger_entries l
                     WHERE l.source_kind = 'purchase_order' AND l.source_id = p.id)
)::text AS unposted_orders,
```

Severity `critical` for both — a document with no posting is a broken invariant, not a variance.
Keep the netting checks as `warning`; they catch a different thing (amounts that disagree) and both
are worth having.

**Touches:** `src/server/queries/alerts.ts`

---

### P0-4 · V004 is dated in the future and is invisible in every report period

`V004` is dated **9 Sep 2026**. Today is 2 Sep. `periodRange()` sets `to` to tomorrow midnight for
*every* preset — including *All time*:

```ts
const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
// ...
case 'all':
  return { from: new Date(Date.UTC(2000, 0, 1)), to };   // ← `to` is still tomorrow
```

So this sale's $25.00 of revenue appears in the Sales list and in lifetime margin-by-product, but
cannot be reached from the P&L under any period selection at all.

Two separate defects:

1. **The date got in.** The sale form sets `max={today()}` on the date input, but `saleSchema` never
   validates it server-side. Client-side `max` is a hint a keyboard or a paste walks straight past.
2. **"All time" is capped.** `all` should have no upper bound. As written it silently means
   "all time up to today", which is a different and unstated claim.

**Fix.**

- Give the `all` case an open upper bound: `to: new Date(Date.UTC(9999, 0, 1))`, or restructure
  `periodRange` to return `to: null` and have callers omit the upper predicate.
- Decide the forward-dating policy and enforce it in one place. Either add
  `.refine(d => d <= new Date(), 'A sale cannot be dated in the future')` to `saleSchema`, or drop
  the `max` attribute and accept forward-dating deliberately. Do not half-enforce it.
- When a period returns nothing but rows exist outside it, say so in the empty state:
  *"No sales in this period. 4 sales totalling $358.00 fall outside it."* That single sentence
  would have answered the P&L complaint on its own.

**Acceptance criteria**

- Unit test: `periodRange('all')` includes a date one year in the future.
- Unit test: `getProfitAndLoss` over `all` returns `revenueCents === 35800` against the current data.
- Attempting to submit a future-dated sale either fails validation with a legible message, or
  succeeds and appears in *All time* — but never silently disappears.

**Touches:** `src/lib/report-period.ts` · `src/lib/schemas.ts` · `src/components/reports/profit-and-loss.tsx`

---

## 02 — Cash ledger vs. expenses (blocking)

> "Cash ledger and expenses dont make sense" — correct. There are two doors for the same money,
> they behave differently, and only one of them reaches the profit and loss.

### P0-5 · Money spent through the ledger never reaches the P&L

| You do this | Writes `expenses` | Writes `ledger_entries` | Shows in P&L |
|---|---|---|---|
| Expenses → Log expense | yes | yes (`operating`) | **yes** |
| Ledger → Record movement, *Operating cost* | no | yes | **no** |
| Ledger → Record movement, *Shipping* | no | yes | **no** |
| Ledger → Record movement, *Other* | no | yes | **no** |
| Ledger → Record movement, *Refund* | no | yes | only if `source_kind='sale'` |

`getProfitAndLoss()` reads operating cost from the `expenses` table only:

```sql
SELECT SUM(amount_usd_cents) FROM expenses
 WHERE occurred_at >= $from AND occurred_at < $to
```

The *Verzendkosten* −$40.00 was entered as a ledger movement, so it has reduced the cash balance
and will never reduce the net result. Confirmed against the live database: `expenses` has
**0 rows**, while ledger outflows in non-purchase categories total **$40.00**.

Worse, `ledger-sheet.tsx` *offers* "Operating cost" as a category with no warning that picking it
excludes the money from the P&L. The two screens present as interchangeable and are not. The
refund row makes it stranger still: a refund posted from a return counts against revenue, but the
same category chosen by hand does not — correct behaviour, invisible rule.

**Fix — pick one model, then make the UI enforce it.**

**Recommended: the ledger is cash; expenses are the only door for operating cost.**

- Remove `operating`, `shipping` and `other` from the manual ledger sheet's category list. Leave it
  doing what its own copy already claims: *"For money that no document already accounts for"* —
  owner capital, draws, corrections.
- Keep the enum values in the database. They are still written by `createExpense` and by returns;
  narrowing the *picker* is the change, not narrowing the schema.
- When someone reaches for a cost-shaped category, redirect rather than refuse:
  *"Running costs go in Expenses so they reach the profit and loss. Log an expense →"*
- Add `shipping` as an *expense category* seed row (F/P1-1), so *Verzendkosten* has an obvious home.
- Backfill: convert the existing $40 shipping ledger row into an expense with
  `postToLedger: false`, so cash stays right and the P&L gains the cost.

**Alternative: the ledger is the single source, expenses become an annex.** Point
`getProfitAndLoss` at `ledger_entries` filtered to cost categories, and demote `expenses` to a
place receipts and categories are attached. Fewer moving parts, but it loses receipt attachments
and category reporting from the P&L, and it makes every hand-typed cash row a P&L event —
including mistakes. Only take this if you would rather delete the Expenses page entirely.

**Whichever you pick, add a test.** `getProfitAndLoss` currently has no unit coverage at all, which
is why a $40 hole went unnoticed.

**Touches:** `src/components/forms/ledger-sheet.tsx` · `src/server/queries/reports.ts`

---

### P1-1 · Expenses is a page that explains itself and then shows nothing

Zero rows, and no seeded expense categories, so the first thing anyone logging an expense meets is
an empty category picker. Seed the obvious set for this business in a migration:

*Shipping & freight · Marketing & ads · Software & tools · Transport & fuel · Packaging ·
Bank & card fees · Rent & utilities · Other*

The empty-state copy is also doing work the page should do structurally. It explains the
expense/purchase-order distinction in prose; put that as a permanent one-line hint under the page
title instead, where it is visible after the first expense exists too.

---

## 03 — Reports (blocking)

> The profit and loss is not broken. It is pointed at an empty window.

### P0-6 · Reports default to "This month", which has never contained a sale

Every sale is dated 28 Aug (last month) or 9 Sep (the future). The default period is *This month*
= 1–3 Sep. It is arithmetically correct and completely useless: the report you land on will be
empty for as long as this business records a handful of sales a month.

```
revenue, all confirmed sales ………………………………… $358.00
revenue, "This month" as the app computes it …… $0.00
revenue dated after today (invisible everywhere)  $25.00
expense rows …………………………………………………………………………… 0
cash out that can never reach the P&L ………………… $40.00
```

Note the inconsistency this creates internally: the Overview's margin waterfall defaults to
`all`, the Reports page defaults to `month`. The same business, two default answers.

**Fix.**

- Change the Reports default preset from `month` to `all`.
- Add a *Last month* preset. For a business closing a month at a time it is the one people actually
  want, and it is missing.
- Show the resolved dates beside the selector — `1 Sep – 2 Sep 2026`. Right now "This month" is
  unfalsifiable; a visible range makes an empty report self-explaining.
- Implement the "rows exist outside this period" empty state from P0-4.

Consider going further: make the default *smart* — resolve to the most recent period that contains
data on first load. Cheap to compute (`SELECT MAX(sold_at) FROM sales WHERE status='confirmed'`)
and it means the report is never empty for a reason the user cannot see.

**Touches:** `src/app/(app)/reports/page.tsx` · `src/lib/report-period.ts` · `src/components/patterns/period-selector.tsx`

---

### P1-2 · "Margin by product" sits under a period selector it ignores

`listProductMargins()` reads `v_product_margins`, which has no date scope — the view is lifetime.
It renders below a period control that appears to govern the whole page. The code comments
acknowledge this; the interface does not.

**Fix.** Make it period-aware. Replace the view read with a parameterised query rather than
altering a view that has GRANT dependencies:

```sql
SELECT p.id, p.code, p.name,
       SUM(si.quantity - si.quantity_returned)                    AS units_sold,
       SUM(si.line_total_usd_cents
           - (si.line_total_usd_cents * si.quantity_returned / NULLIF(si.quantity,0))) AS revenue_cents,
       SUM(si.cogs_cents
           - (si.cogs_cents * si.quantity_returned / NULLIF(si.quantity,0)))           AS cogs_cents
  FROM sale_items si
  JOIN sales s   ON s.id = si.sale_id
  JOIN product_variants v ON v.id = si.variant_id
  JOIN products p ON p.id = v.product_id
 WHERE s.status = 'confirmed' AND s.sold_at >= $from AND s.sold_at < $to
 GROUP BY p.id, p.code, p.name
HAVING SUM(si.quantity - si.quantity_returned) > 0
```

Note this also nets returns out of the product margin table, which the current view does not do —
so a heavily-returned product stops looking like a winner. If the change is deferred, at minimum
move the panel under a heading that says *Lifetime* and visually detach it from the period control.

**Touches:** `src/server/queries/reports.ts` · `src/components/reports/margin-by-product.tsx`

---

### P1-3 · FX exposure occupies half the page to display four zeroes

Every transaction so far is in USD, so *SRD booked*, *Revalued* and *Unrealised* are all $0.00,
both shares read 0%, and the rate sparkline is an empty dotted line because only one rate has ever
been recorded. It is the largest panel on the page and carries no information.

**Fix.** Collapse to a one-line summary when SRD exposure is zero — *"No SRD-denominated entries.
1 USD = 38.50 SRD since 11 Aug 2026."* — with a link to expand. Give the space to the P&L, which is
the report people came for. Restore the full panel automatically once an SRD transaction exists.

This panel becomes genuinely important the moment you start charging in SRD (see F-1 and F-3), so
build the collapse as a state, not a deletion.

---

## 04 — Dead-end screens (high)

> Three complaints are the same defect wearing different clothes: a page owns a concept, describes
> it confidently, and has no button for it.

### P0-7 · Owners has no way to record a contribution

`src/app/(app)/owners/page.tsx` renders a `PageHeader` with **no `action` prop** and two read-only
panels. It is the only page in the app that owns a business concept and ships zero write
affordances.

To add capital you must know to go to Cash ledger → Record movement → change the category to
*Owner contribution* → pick a person. Nothing on the Owners page says so. Its own empty state even
tells you to "mark a ledger entry as an owner contribution" without linking there.

**Fix.**

- Add **Record contribution** (primary) and **Record draw** (secondary) to the Owners page header.
- Both open the existing `LedgerSheet` with the category pre-selected and locked, and the owner
  field promoted to the top of the form. No new server action is needed — `createLedgerEntry`
  already does the work, and `listPrincipalOptions()` already supplies the owner list.
- `LedgerSheet` will need two new optional props: `lockedCategory?: LedgerCategory` and
  `defaultMemberId?: string`. Keep the existing unlocked behaviour for the Ledger page.
- Add a per-owner row action opening the same sheet with that owner pre-filled.
- Link each owner row to their filtered ledger history:
  `/ledger?category=owner_contribution&q=<name>`.

**Acceptance criteria** — from a cold start on `/owners`, a new contribution can be recorded
without visiting another page, and the capital account and split both update on return.

**Touches:** `src/app/(app)/owners/page.tsx` · `src/components/forms/ledger-sheet.tsx`

---

### P0-8 · Team invitations can never be accepted

It is worse than unnecessary — it makes a promise it cannot keep. `inviteMember` inserts a
`members` row and the success toast says *"They can sign in at any time with
youri@nextly.invalid."* They cannot. There is:

- no sign-up route,
- no invitation email,
- no password-reset flow,
- and `/login` only calls `signInWithPassword`.

A Supabase `auth.users` record must be created by hand in the Supabase dashboard first. That is why
both principals have read *Invited* since day one and only `nextly@admin.com` is *Active*.

The claiming mechanism itself is well designed — `getCurrentMember()` matches on lowercased email
and back-fills `auth_user_id` on first sign-in, which is exactly right for owners who held capital
in the ledger before the app existed. The missing half is any way to obtain the credential.

**Fix — choose by how many people will ever use this.**

**Two owners and no staff (recommended):** delete the Invite button and the `MemberSheet` create
path. Keep the members table, keep role editing, keep the claiming logic — Youri still needs it.
Replace the panel hint with the truth: *"Accounts are provisioned in Supabase. Contact the owner."*
Ship less, lie less.

**If staff will ever be added:** complete it properly.

1. In `inviteMember`, after inserting the member row, call
   `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: '${APP_URL}/auth/set-password' })`
   using a server-side client built from `SUPABASE_SECRET_KEY`.
2. Add `/auth/set-password` — receives the emailed link, calls `updateUser({ password })`, then
   redirects to `/dashboard` where `getCurrentMember()` claims the row.
3. Add "Forgot password" to the sign-in form via `resetPasswordForEmail`, pointing at the same
   route.
4. Make the invite transactional-ish: if the Supabase call fails, do not leave a member row behind
   claiming an invitation that was never sent.

Do not ship the middle state that exists today.

**Touches:** `src/components/forms/reference-sheets.tsx` · `src/server/actions/reference.ts` · `src/app/(app)/settings/page.tsx` · new `src/app/auth/set-password/page.tsx`

---

### P1-4 · The sign-in form ships a hard-coded admin address

`src/app/login/login-form.tsx`:

```ts
const [email, setEmail] = useState('nextly@admin.com');
```

Every visitor to the public sign-in page is handed a valid administrator username. Combined with
leaked-password protection being disabled on the Supabase project (the only security advisory
returned), that is a real credential-stuffing surface, not a cosmetic issue.

**Fix.** Initialise to `''`. Enable leaked-password protection in Supabase Auth settings. Add a
rate limit or captcha if the sign-in page stays publicly reachable. While you are there, the
placeholder reads `you@nextly.com` — a domain that does not appear anywhere else in the project;
make it match reality.

---

## 05 — Recording a sale (high)

> Three separate sales were recorded to the same customer on the same day. The form supports
> putting all three on one document. Everything below is about making that obvious — and about
> the sale model being thinner than the business needs (§10).

### P0-9 · Multi-line entry is invisible

Four things conspire:

- The form opens with exactly **one** row, which reads as a fixed shape rather than the first of a
  list.
- *Add line* is a `size="sm" variant="secondary"` button in the `SurfaceHeader` — top-right,
  visually detached from the rows it appends to.
- There is no per-line total, so a row does not look like a line item on a document.
- The panel is titled *Items*, the page title is *Record a sale* (singular), and the primary button
  is *Record sale*. Nothing says a sale can hold several products.

**Fix — restructure the Items panel.**

Target layout, desktop:

```
┌─ Items ──────────────────────────────────────────────────────────┐
│  #   Product                     Qty    Unit (USD)     Line       │
│  1   Wyze Cam Pan V3 · Black ▾     4       50.00      200.00   ⨯  │
│  2   Sandisk 64GB microSD ▾        4       27.00      108.00   ⨯  │
│                                                                   │
│  ┌ + Add another product ───────────────────────────────────────┐ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                          4 lines · 8 units        │
└───────────────────────────────────────────────────────────────────┘
```

- Move *Add line* to a **full-width dashed button directly beneath the last row**, labelled
  **+ Add another product**. This is the single highest-value change in the audit relative to
  effort.
- Add a right-aligned **Line** total column, `tabular`, so a row visibly computes.
- Number rows in a leading gutter.
- Auto-append a fresh empty row once a product is chosen in the last row — the pattern every POS
  uses. Guard it so it fires on selection, not on every keystroke.
- Keyboard: `Enter` in the last field adds a line; `Cmd/Ctrl + Enter` submits; `Cmd/Ctrl + Backspace`
  removes the focused line.
- Footer line: *"4 lines · 8 units"* so the document reads as a document.
- On mobile, stack each line as its own bordered card with a visible *Remove*, matching the
  `MobileList` idiom used everywhere else. The current `sm:grid-cols-[1fr_88px_120px_32px]`
  collapses to a stack with no separation between lines.

Apply the identical treatment to `purchase-order-form.tsx` — it has the same header-mounted
*Add line* at line 294 and will produce the same complaint.

**Touches:** `src/components/forms/sale-form.tsx` · `src/components/forms/purchase-order-form.tsx`

---

### P1-5 · The live margin panel disagrees with the server when a product appears twice

The form's own comment promises *"the number shown before submitting is the number that gets
stored"*. It holds for distinct products and breaks for repeats. The client recomputes each line
against the *original* `onHand`/`valueCents` from `listVariantOptions()`, while the server consumes
stock sequentially and re-reads the valuation after every line via `lockValuation`.

```
4 units on hand, $4.00 of value — two lines of the same variant

line 1  qty 4   client cogs $4.00   server cogs $4.00   stock → 0
line 2  qty 1   client cogs $1.00   server cogs $0.00   shortfall 1
                ─────────────────────────────────
                client $5.00        server $4.00

margin shown is understated, and the oversold warning never fires
```

For proportional splits the two agree (weighted average is linear), which is why this survived
review — it only diverges once a line exhausts the stock.

**Fix.** In the `totals` memo, carry a running position and decrement it as lines are walked:

```ts
const position = new Map(variants.map(v => [v.id, { qty: v.onHand, value: v.valueCents }]));
for (const line of lines) {
  const p = position.get(line.variantId);
  const take = Math.min(quantity, Math.max(p.qty, 0));
  const cost = take === p.qty ? p.value : mulDivRound(p.value, take, p.qty);
  cogs += cost;
  position.set(line.variantId, { qty: p.qty - take, value: p.value - cost });
  if (quantity > take) shortfalls.push({ label, short: quantity - take });
}
```

Better still, prevent the situation: when a variant already on the form is picked again, merge the
quantities into the existing row and flash it rather than creating a duplicate line. Add a unit
test comparing the client total against `consumeStock` over a repeated-variant fixture.

---

### P1-6 · A 100% margin is displayed as a success

`V004` shows **100.0%** margin in accent cyan on the Sales list. Its cost is $0.00 because it was
sold with nothing in stock — `shortfall = 1`. The headline figure on that row is not a good margin,
it is a missing cost, and the list gives no hint of that. The Overview's alerts panel knows
(`oversold_lines`), but the row itself does not show it, and the table footer folds the fake
margin into the page total.

**Fix.** Select `SUM(si.shortfall)` in `listSales`. Where non-zero:

- render the margin in the warning tone with a tooltip: *"1 unit had no stock; cost of goods is
  understated"*;
- show a small warning dot beside the number;
- exclude those rows from the footer's margin, or label the footer *provisional*.

The same treatment belongs on `/sales/[id]`, and the shortfall should resolve itself once a
covering purchase order is received — which is a real feature question, not just display. See F-8.

**Touches:** `src/server/queries/lists.ts` · `src/app/(app)/sales/page.tsx` · `src/app/(app)/sales/[id]/page.tsx`

---

## 06 — The storefront (high)

> A shop with nothing on the shelves and no way to buy.

### P0-10 · There is no way for a visitor to act

It *is* public — `/` and `/p/[slug]` render for signed-out visitors, are indexable, and have a
sitemap. The reason it feels pointless is that it is a dead end. Grepping
`src/app/(store)/p/[slug]/page.tsx` for `buy`, `cart`, `checkout`, `enquire`, `contact` or
`whatsapp` returns **nothing**. No phone number, no address, no form. A visitor who wants the
camera has no next step.

For a Paramaribo importer selling over the counter, full checkout is the wrong first move anyway.
The right one is the channel the customers already use.

**Fix — phase 1, ship this week.**

- **WhatsApp enquiry as the primary CTA** on every card and product page:

  ```
  https://wa.me/597XXXXXXX?text=Hallo Nextly, ik ben geïnteresseerd in
  {product} ({variant}) — SKU {sku}
  ```

  This is how electronics retail actually converts in Suriname, and it needs no cart, no payment
  provider and no fulfilment logic. Put the number in `settings` so it is not hard-coded.
- Show the **SRD price as the primary figure** with USD secondary. Customers think in SRD, and the
  conversion already exists in the `Money` component via `srdRate`.
- Add a real footer: address, opening hours, phone, WhatsApp, Instagram. Right now it says
  *"Nextly · Paramaribo, Suriname"* and nothing else.
- Replace *In stock / Out of stock* with something a buyer can act on — *"3 in stock — collect
  today"* / *"Sold out — message us for the next shipment"*.
- Add `Product` JSON-LD structured data with price and availability. You already publish a sitemap;
  this is the other half of being findable.

**Fix — phase 2, only if you want orders through the site.** See F-4 (quote requests). Real
checkout — Mope or bank-transfer reconciliation, delivery, returns — is a much larger commitment
and should not start until the enquiry flow proves demand.

**Touches:** `src/app/(store)/p/[slug]/page.tsx` · `src/components/store/product-card.tsx` · `src/app/(store)/layout.tsx` · `settings` schema

---

### P0-11 · Nothing is published, and publishing is buried

The catalog reads *"Nothing published yet"* because `catalog_published` is false on every product.
The only way to change it is to open a product, scroll to a *Publishing* panel near the bottom of a
447-line form, tick a checkbox and save. Nothing in the Products list shows publication state at
all.

**Fix.**

- Add a **Catalog** column to the Products list — a *Published* / *Draft* badge.
- Add *Publish to catalog* / *Unpublish* to the product row-actions menu. It is a reversible flip,
  so per the project's own three-tier friction model it needs no confirmation dialog. Set
  `catalog_published_at` on publish — the column exists and is never written.
- Add a `catalog` filter to the list toolbar.
- Block publishing with a legible reason when a product has no image, no summary or no price:
  *"Add a photo and a summary before publishing — an empty product page is worse than none."*
- Add *View on catalog ↗* to the product detail page for published products.

**Touches:** `src/app/(app)/products/page.tsx` · `src/components/forms/row-actions.tsx` · `src/server/actions/products.ts`

---

### P1-7 · The storefront wears the dashboard's clothes

The store reuses `ListToolbar`, the dashboard's `EmptyState`, 12–13px type and the admin card
geometry. That was a defensible consistency decision, but the two surfaces have opposite jobs: the
dashboard is an instrument scanned by two people who know it; the storefront is a shop window for
strangers who owe you thirty seconds of attention.

Reference points worth studying — **Aqara**, **SwitchBot**, **Shelly**, **Ubiquiti**. What they
share and Nextly lacks:

- a hero product shot on a light neutral ground, large, with room around it;
- product names at 18–24px, not 14px;
- price large and unmissable, not a 13px line under a summary;
- specs as scannable icon rows, not a key-value table;
- one clear CTA per screen;
- generous whitespace instead of dense hairline rules.

**Fix.**

- Give `(store)` its own type scale: names 18px/500, price 22px, body 14px, and a wider line height.
- Force light mode on the storefront — see §07.
- Product images `object-contain` with generous padding on a near-white tile, aspect 1:1 rather
  than 4:3.
- Replace the admin `ListToolbar` with category **chips**, not a dropdown.
- Drop `ChevronsUpDown`-style admin controls from public pages entirely.
- Add a gallery to the product page — `getCatalogProduct` already returns every image, and the
  page currently under-uses them.

---

## 07 — Design and colour

> "It seems so dark" — the light theme is finished, tested, and switched off.
> `src/styles/tokens.css` contains a complete light palette, tinted to hue 207 with accents
> darkened to clear WCAG AA on white. One line of configuration hides it.

### P0-12 · The app defaults to dark for everyone, forever

`ThemeProvider` is configured `defaultTheme="dark"` with `enableSystem`. Because `defaultTheme`
wins until someone explicitly chooses, every visitor — including every storefront visitor, who has
no toggle at all — gets near-black regardless of their operating system preference. Verified: on a
fresh load `localStorage['nextly-theme']` is `null` and `<html class>` is `dark`.

The light ramp that already exists and is never shown by default:

| Token | Value |
|---|---|
| `raised` | `hsl(0 0% 100%)` |
| `base` | `hsl(205 30% 98.5%)` |
| `sunken` | `hsl(205 28% 95.5%)` |
| `accent` | `hsl(196 82% 36%)` |
| `positive` | `hsl(179 78% 27%)` |
| `negative` | `hsl(4 68% 46%)` |

**Fix.**

- `defaultTheme="system"` in `src/components/providers/theme-provider.tsx`. With `enableSystem`
  already on, this is the setting the three-way toggle was designed for, and the toggle's *System*
  option becomes meaningful.
- If you want light specifically rather than following the OS, set `defaultTheme="light"`. Given
  "the color pallet allowed lighter colors", this is probably what you want for the dashboard.
- **Force light on the storefront.** Wrap `(store)` in its own provider with
  `forcedTheme="light"`. A public shop that is near-black because of an admin's saved preference is
  a conversion problem, and store visitors have no toggle to escape it.
- Update `viewport.themeColor` so mobile browser chrome follows.

---

### VERIFIED · The theme toggle is not broken — it is illegible

Tested directly against the running dev server. Clicking *Light* produced:

```
html class   …  …variable dark     →   …variable light
localStorage …  null              →   "light"
body bg      …  rgb(8, 15, 20)    →   rgb(250, 251, 252)   ✓ repainted
```

It works. What fails is every signal that it worked:

- **The selected state is invisible.** Active is `bg-raised` (207 32% 8.5%) against a `bg-inset`
  track (207 36% 7%) — a 1.5% lightness difference. On a dark screen you cannot tell which of the
  three is on.
- **The middle button really does nothing visible.** *System* on a dark-mode OS resolves to dark,
  which is what you were already looking at. Indistinguishable from a broken control.
- **24 px targets.** `size-6` with `size-3.5` icons — well under the 44 px minimum, on an app used
  from a phone.
- **No labels, no tooltips.** Three unlabelled glyphs; `aria-label` serves screen readers but
  nothing appears on hover.

**Fix.**

- Raise the active state to a genuinely distinct surface: `bg-active` plus a 1px
  `border-line-strong`, and set the active icon to `text-accent`.
- Grow to `size-8` (32px), or 44px below the `lg` breakpoint.
- Add tooltips, and when *System* is active append the resolved value: *System (dark)*. That alone
  answers "did anything happen?"
- Consider dropping to a two-way Light/Dark toggle. Three states are correct engineering and one
  more decision than two owners need.

**Touches:** `src/components/shell/theme-toggle.tsx`

---

### P1-8 · Density is calibrated for a desk, not for a phone

The Instrument language is genuinely good work — tinted neutrals, tabular figures everywhere,
hairline elevation, restrained radii. It is not generic and it should be kept. Four calibration
problems sit on top of it.

- **Type floor.** 10px and 11px carry real information (table headers, hints, meta rows, ledger
  balances). On a phone that is under the readable floor. Lift the minimum to 12px, and 11px only
  for uppercase labels with tracking.
- **Touch targets.** 24px icon buttons and 32px rows appear throughout — row actions, pagination,
  theme toggle. Below `lg`, nothing interactive should be under 44px.
- **Contrast.** `--nx-text-faint` in dark mode is `hsl(207 12% 36%)` on a `hsl(207 42% 5.5%)`
  ground — roughly 3.3:1, under AA for body text. It is used for hints and meta, not decoration.
  Lift to ~48% lightness.
- **The alerts panel is under-weighted.** It is titled *"Needs attention"* and sits in a panel
  identical to every other panel. Two live drift warnings have gone unnoticed. Give critical alerts
  a filled severity chip, a count badge in the panel header, and float the panel to the top of the
  Overview when anything critical is open.

---

### P2-1 · The command palette looks like search but never touches your data

`command-palette.tsx` matches against a hardcoded `ACTIONS` array and `ALL_NAV_ITEMS`. It renders
behind a magnifying glass in the topbar, binds `⌘K`, and calls itself a palette — but typing
`V003`, `Jo-Ann`, `NX-WYZE-PANV3` or `PO-001` returns nothing. In an operations tool that is the
main thing you would want it for.

**Fix.** Add a debounced server search behind a `searchEverything(q)` query — sales by number and
customer, products by name/code/SKU, customers by name/phone, purchase orders by number, ledger by
description. Group results by entity type under the existing Actions and Pages groups. One query
with `UNION ALL` and a `LIMIT 5` per branch keeps it a single round trip.

---

### P2-2 · No product thumbnails anywhere in the admin

`product_images` stores a 400px WebP `thumbUrl` and a `blurDataUrl` for every image. The storefront
uses them. The admin — Products, Inventory, sale lines, purchase-order lines, the product picker —
shows none. For a business selling physically similar black plastic devices, a 24px thumbnail in
the picker is worth more than the SKU beside it.

**Fix.** Add `thumbUrl` to `listVariantOptions()` and the product/inventory list queries; render a
24–32px rounded thumbnail in the first column and in `ComboboxOption`.

---

### P2-3 · The activity trail has no page of its own

`activity_logs` is written by every mutating action and read only by the Overview's *Recent
activity* panel, which shows the last handful. There is no way to answer "what changed last
Tuesday" or "who voided that sale". The table is indexed for exactly this
(`activity_logs_created_at_idx`, `activity_logs_entity_idx`).

**Fix.** Add `/activity` — a paginated, filterable list (by actor, entity type, date range) using
the existing list-page pattern. Cheap to build, and it is the difference between having an audit
trail and being able to use one.

---

## 08 — Hardening

The engineering baseline is better than most projects at this stage: `tsc --noEmit` clean, 41/41
unit tests passing, one advisory on the Supabase project, RLS on every table, a Playwright smoke
test covering the full buy → stock → sell path. The gaps are operational.

| Item | State | Action |
|---|---|---|
| Leaked-password protection | Disabled | Enable in Supabase Auth. The only security advisory returned. |
| Hard-coded admin email | Shipped | P1-4. Remove the default value. |
| Password reset | Absent | No recovery path exists for any account. |
| Error monitoring | Absent | Error boundaries render, nothing is reported. Add Sentry or Vercel log drains. |
| Database backups | Unverified | Confirm PITR on the Supabase plan before real trade depends on this. |
| Rate limiting | Absent | Server Actions are unthrottled behind auth; sign-in is unthrottled in front of it. |
| E2E coverage | Partial | Smoke test covers the happy path. Add returns, void, oversell, multi-line sales, and a viewer-role permission test. |
| Report arithmetic tests | Absent | Money primitives are well tested; `getProfitAndLoss` and `periodRange` are not. P0-4 and P0-6 would both have been caught. |
| Importer tests | Absent | The importer caused every P0 in §01 and has no coverage. |
| `/design-system` | Guarded | `notFound()` in production. Correct. |
| Dashboard indexing | Correct | Root layout noindex, store layout overrides, `robots.ts` consistent. |
| Storefront cost leakage | Correct | `catalog.ts` selects no cost figure anywhere. Verified. |
| Concurrency on stock | Correct | `lockValuation` takes `FOR UPDATE`. Two tabs cannot double-spend the same units. |
| Gapless numbering | Correct | Transactional counter table, not a sequence. |

**Worth saying plainly.** The costing engine, the append-only ledgers, the FX-rate series, the
gapless numbering, the returns model and the authorisation boundary are all done properly, and the
docs are unusually honest about their own trade-offs. Do not let this audit's length suggest
otherwise — none of the P0s are architectural. They are an importer that bypassed the posting
service, a default period, a default theme, and four missing buttons.

---

## 09 — Features the business needs that do not exist

> The system models **buying and stocking** extremely well and models **selling** thinly. Below is
> what a trading business of this shape needs, ordered by how soon it bites. Each entry says why it
> matters *for Nextly specifically*, not in general.

### F-1 · Sales tax (BTW) — no field exists anywhere

**Blocking if you are VAT-registered.**

`purchase_orders` has `taxCents` and `shippingTaxCents` for import duty. `sales` has **no tax
column at all**, and the sale form has no tax field. Suriname introduced BTW (VAT) in January 2023
at a standard rate of 10% — confirm your current rate and registration status with your accountant,
because if Nextly is registered, every figure in the P&L is presently wrong and every sale document
you hand a customer is non-compliant.

**Build.**

- `sales.tax_rate_bp` (basis points, integer — 1000 = 10%), `sales.tax_cents`,
  `sales.subtotal_cents`. Keep `total_cents` as the gross the customer paid, so nothing already
  stored changes meaning.
- Tax is **not** revenue. `getProfitAndLoss` must report `subtotal_cents`, with BTW collected shown
  as a separate liability line — money you are holding for the tax authority.
- A `tax_rate_bp` default in `settings`, overridable per sale (exports and some goods are zero-rated).
- A **BTW return** report: output tax collected on sales, input tax paid on purchase orders, net
  payable, over a chosen period. This is a filing you will do repeatedly; it should not be a
  spreadsheet.

**Effort:** ~2 days including the report. **Dependency:** F-3 (the invoice must show it).

---

### F-2 · Discounts — the column exists and nothing writes it

`sales.discountCents` is declared in the schema, selected in `documents.ts`, and **never written by
any action, never rendered by any page, and absent from the sale form**. It is a dead column that
looks like a feature.

For a counter business this matters immediately: haggling, bundle pricing and "round it down to
$200" are how sales actually close. Today the only way to record a discount is to edit the unit
price, which destroys the record of what the product normally sells for and quietly corrupts your
own price-realisation data.

**Build.** A discount field on the sale form — amount or percent, applied at document level with an
optional reason. Post revenue net of discount, keep the gross and the discount separately so
"average discount given" becomes answerable. Show it on the invoice.

**Effort:** ~half a day. **Decide first:** line-level or document-level. Document-level is enough.

---

### F-3 · An invoice or receipt the customer can keep

There is no PDF generation, no print stylesheet, no `@media print` rule, and no customer-facing
document anywhere in the codebase. A customer buying a $200 camera gets a row in your database and
nothing in their hand.

This is not cosmetic. It is what a warranty claim is made against, what a business customer needs
for their own books, and what BTW compliance requires once F-1 lands.

**Build.**

- `/sales/[id]/invoice` — a print-optimised route: business details, customer, line items,
  subtotal, discount, BTW, total, amount in SRD at the sale's own recorded rate, payment method,
  document number, and warranty terms.
- Print via the browser first (`window.print()` with a print stylesheet). It costs almost nothing
  and produces a real PDF on every platform. Reach for a PDF library only if you need emailing.
- A *Send via WhatsApp* action that shares the link — consistent with how the storefront should
  work (P0-10).
- Business identity (address, phone, BTW number, logo) belongs in `settings`, not hard-coded.

**Effort:** ~1 day. **Dependency:** F-1, F-2 for the totals block.

---

### F-4 · Payment status and money owed

Today a sale is either a draft (nothing happened) or confirmed (paid in full, instantly — the
receipt posts for the whole amount at confirm time). There is no third state, which means:

- you cannot sell to a customer who pays next week,
- you cannot take a deposit,
- you cannot answer "who owes me money",
- and the cash balance asserts money you may not have received.

For a counter business this is survivable. The first time you sell five cameras to an office on
terms, it is not.

**Build.**

- `sale_payments` — an append-only table (`sale_id`, `amount_cents`, `currency`, `fx_rate_micros`,
  `method`, `received_at`, `member_id`), each row posting its own `sales_receipt` ledger entry.
- Derive `paid_cents` and `balance_cents` per sale rather than storing them, matching the ledger
  discipline used everywhere else.
- Payment status badge on the sales list: *Paid · Partly paid · Unpaid · Overdue*.
- Confirming a sale offers *Paid in full now* (the default, preserving today's behaviour) or
  *Record payment later*.
- Outstanding balance on the customer detail page and a **Money owed** panel on the Overview.

**Effort:** ~2 days. This is the largest single gap in the sales model.

---

### F-5 · Quote requests from the storefront

The bridge between P0-10's WhatsApp CTA and the sales pipeline. A `quote_requests` table
(`name`, `phone`, `email`, `variant_id`, `quantity`, `message`, `status`, `created_at`), a form on
the product page, a *Requests* page in the admin, and an action that converts an accepted request
into a draft sale with the customer created inline.

This gives you online demand capture with no payment integration, no fulfilment logic, and no new
money concepts — it reuses the entire existing sales flow. It is also the cheapest way to find out
whether the storefront is worth investing in further.

**Effort:** ~1 day. **Do this before any real checkout work.**

---

### F-6 · Serial numbers and warranty tracking

`product_variants.barcode` exists and is unused; the docs list barcode scanning as deliberately
deferred. Serial tracking is a different and more urgent thing.

You import IoT devices. They fail. A Wyze camera has a manufacturer warranty, and a customer coming
back in eight months with a dead unit needs you to answer: when did they buy it, which unit is it,
is it in warranty, and can you claim against the supplier. Right now none of that is recordable.

**Build.**

- `sale_item_serials` (`sale_item_id`, `serial`), captured optionally at sale time.
- `warranty_months` on the product; warranty expiry derived from `sold_at`.
- Serial search in the command palette (F/P2-1) — type a serial, get the sale.
- A *Warranty* view on the customer and product detail pages.
- Optionally a `warranty_claims` table linking a serial to a supplier RMA.

**Effort:** ~1.5 days. **Trigger:** build this before the first warranty dispute, not after.

---

### F-7 · CSV export

No export exists anywhere — no CSV, no download, nothing. The design system even renders an
*Export* button variant that nothing implements. Every list page should export what it is currently
showing, filters applied.

You will need this for your accountant, for a BTW filing, for reconciling against a bank statement,
and as a hedge against ever being locked out of the app. It is one shared server action and a
button on eleven pages.

**Build.** `exportList(entity, query)` returning a CSV stream, wired to an *Export* button in
`ListToolbar`. Export the same rows the current filter shows — an export that ignores the filter is
a trap. Include a full-database export in Settings for backup purposes.

**Effort:** ~half a day for the shared mechanism.

---

### F-8 · Reorder intelligence, not just a low-stock flag

The alerts panel says *"N products are running low"* against a fixed threshold from settings. That
is a start, not a purchasing decision. It cannot tell you how fast something sells, how long
restocking takes, or how many to buy.

For an importer with a multi-week lead time from Amazon or AliExpress, this is the difference
between stocking out and over-ordering — and `inventory_movements` already holds everything needed
to compute it.

**Build.**

- Sell-through rate per variant over a trailing window.
- Days of cover = on hand ÷ daily rate.
- Lead time per supplier (a new column, defaulted and adjustable).
- A **Reorder** view: what to buy, how many, and by when, with a *Create purchase order from
  suggestions* action that pre-fills a draft PO.
- Resolve outstanding shortfalls (P1-6) against incoming receipts.

**Effort:** ~2 days. **Value grows with catalogue size** — worth deferring until you carry more
than a handful of SKUs.

---

### F-9 · Supplier payments and amounts owed

Currently a purchase order's cash side is entirely manual — which is exactly how PO-001 ended up
$31.35 adrift (P0-2). Orders are paid in full by card today, so the docs defer this, but the
manual posting is already causing errors.

**Build.** At minimum: post the PO's payment automatically on receipt, the way sales post their
receipt, so `ledger_po_drift` cannot happen by hand. Beyond that, a `purchase_order_payments` table
mirroring F-4 for the buy side, giving supplier balances and payment terms.

**Effort:** ~half a day for auto-posting; ~1.5 days for the full payment model.

---

### F-10 · Stock take

Stock adjustments exist and are well built — `adjustStock` posts a movement with a required reason
rather than editing a level. What is missing is the *session*: counting the whole shelf, entering
counts, and posting all the variances at once with one reason.

Doing that today means one adjustment at a time with no record that a count occurred.

**Build.** A `stock_takes` header plus `stock_take_lines` (expected vs counted), and a *Post
variances* action that writes one `adjustment` movement per discrepancy, all sourced to the count.
Show the shrinkage total — it is a real cost the P&L should eventually carry.

**Effort:** ~1 day. **Trigger:** the first time on-hand disagrees with the shelf.

---

### F-11 · Customer contact and history actions

`customers` stores `phone` and `email` and nothing acts on them. Add a WhatsApp link on the
customer record and in the sales list, prefilled with the sale number for follow-ups. Add
*last purchased*, *lifetime margin* (not just spend), and a repeat-purchase flag to the customer
detail page.

**Effort:** ~half a day.

---

### F-12 · Bulk price updates

Repricing today means opening each product's form and saving. With FX moving and import costs
changing, that becomes the reason prices go stale. Add multi-select on the Products list with
*Adjust prices by %* / *Set margin target*, previewing old → new before applying, and log every
change to `activity_logs`.

**Effort:** ~1 day. **Trigger:** more than ~15 SKUs, or the first significant SRD move.

---

### F-13 · Onboarding and setup state

A new deployment has no rate, no categories, no products, no members. `/setup` handles the
database-missing case only. The Overview on a fresh install is a wall of empty panels.

Add a dismissible setup checklist on the Overview — set an exchange rate, add a supplier, create a
product, raise a purchase order, record a sale — each linking to the relevant screen and
self-completing. `setup-banner.tsx` already exists as a starting point.

**Effort:** ~half a day.

---

### F-14 · Cost of the SRD position

FX exposure reports unrealised gain/loss on SRD cash but stops there. Once you charge in SRD
regularly (which the storefront pricing change in P0-10 encourages), you will want realised FX
gain/loss as a P&L line, not just a panel. Note it now so the P&L rework in F-1 leaves room.

**Effort:** ~1 day, after SRD volume exists.

---

### F-15 · Notifications worth receiving

Nothing leaves the app. Nobody is told when stock runs out, an order is overdue, a drift alert
fires, or a customer requests a quote. For a two-person business that checks the dashboard
irregularly, alerts nobody reads are alerts that do not exist.

Start narrow: a daily digest email or WhatsApp message with open critical alerts and yesterday's
sales. Do not build a notification centre.

**Effort:** ~1 day with a scheduled function.

---

### F-16 · Backup and recovery you have actually tested

Supabase PITR may or may not be on your plan — unverified. Beyond the platform, there is no export
(F-7), no seed-from-backup path, and no documented restore procedure. The entire financial history
of the business is in one Postgres database with no rehearsed way back.

Confirm PITR, schedule a weekly full export to blob storage, and — once — actually restore it into a
branch and check the numbers match. An untested backup is a belief, not a backup.

**Effort:** ~half a day plus the rehearsal.

---

### Feature priority summary

| | Feature | Why now | Effort |
|---|---|---|---|
| 1 | F-1 Sales tax (BTW) | Compliance; P&L is wrong without it if registered | 2d |
| 2 | F-3 Invoice / receipt | Customers have nothing; warranty and BTW both need it | 1d |
| 3 | F-2 Discounts | Dead column; you are already discounting via unit price | 0.5d |
| 4 | F-7 CSV export | Accountant, filings, lock-out insurance | 0.5d |
| 5 | F-5 Quote requests | Cheapest possible storefront conversion | 1d |
| 6 | F-4 Payment status / AR | First credit sale makes this urgent | 2d |
| 7 | F-9 Supplier auto-posting | Already caused P0-2 | 0.5d |
| 8 | F-16 Backup rehearsal | Insurance | 0.5d |
| 9 | F-6 Serials & warranty | Before the first dispute | 1.5d |
| 10 | F-13 Onboarding checklist | Fresh-install experience | 0.5d |
| 11 | F-11 Customer actions | Quick win | 0.5d |
| 12 | F-10 Stock take | When counts start disagreeing | 1d |
| 13 | F-8 Reorder intelligence | When the catalogue grows | 2d |
| 14 | F-12 Bulk pricing | ~15+ SKUs | 1d |
| 15 | F-15 Notifications | When nobody is checking daily | 1d |
| 16 | F-14 Realised FX | When SRD volume exists | 1d |

---

## 10 — Build order

Ordered by dependency and by how much each step changes what you see. Phase 1 is roughly one day's
work and resolves most of what was reported.

### Phase 1 — Make it match what it claims (~1 day)

**1. Turn the lights on** — `P0-12`, `VERIFIED` · ~1h
`defaultTheme="system"` or `"light"`; force light on `(store)`; fix the toggle's active state, size
and tooltips.
*Files:* `theme-provider.tsx`, `theme-toggle.tsx`, `(store)/layout.tsx`

**2. Make the reports show the data that exists** — `P0-4`, `P0-6` · ~2h
Default Reports to *All time*; add *Last month*; open the upper bound on `all`; display resolved
dates; add the "rows outside this period" empty state; validate `soldAt` server-side.
*Files:* `report-period.ts`, `schemas.ts`, `reports/page.tsx`, `profit-and-loss.tsx`

**3. Add the four missing buttons** — `P0-7`, `P0-9`, `P0-11`, `P1-4` · ~4h
Record contribution / draw on Owners; publish toggle in the products list and row actions;
full-width *Add another product* under the sale lines; blank the login email default.
*Files:* `owners/page.tsx`, `ledger-sheet.tsx`, `sale-form.tsx`, `products/page.tsx`,
`row-actions.tsx`, `login-form.tsx`

### Phase 2 — Make the numbers true (~2 days)

**4. Decide the cash/expense model, then enforce it** — `P0-5`, `P1-1` · ~4h
**Needs a decision first (§02).** Narrow the ledger categories, seed expense categories, backfill
the $40 shipping row, add a `getProfitAndLoss` test.

**5. Reconcile the live data and close the hole that caused it** — `P0-1`, `P0-2`, `P0-3` · ~1 day
Reversing entry for *Inkomsten*; a real receipt per confirmed sale; correct PO-001; route the
importer through `posting.ts`; add the unreconciled-document alerts. **Verify totals before and
after.**

**6. Auto-post supplier payments** — `F-9` (partial) · ~4h
So P0-2 cannot recur by hand.

### Phase 3 — Make selling complete (~4 days)

**7. Sales tax, discounts, invoice** — `F-1`, `F-2`, `F-3` · ~3.5d
The three belong together: they all change the sale totals block and the document that shows it.
Ship them as one change rather than three renegotiations of the same layout.

**8. Correctness follow-ups** — `P1-2`, `P1-3`, `P1-5`, `P1-6` · ~1 day
Running-valuation fix and duplicate-line merge; shortfall surfaced on the sales list; period-aware
margin by product; collapse FX exposure when empty.

### Phase 4 — Make the storefront earn its keep (~2 days)

**9. Storefront conversion** — `P0-10`, `P1-7` · ~1 day
WhatsApp CTA, SRD-primary pricing, real footer, actionable stock copy, store type scale, JSON-LD.
Publish the Wyze Cam.

**10. Quote requests** — `F-5` · ~1 day
Online demand capture that feeds the existing sales pipeline.

### Phase 5 — Operational maturity (~3 days)

**11. Export, backup, and the team decision** — `F-7`, `F-16`, `P0-8` · ~1.5d
CSV export on every list; confirm and rehearse restore; delete or complete the invite path.

**12. Density, contrast, touch targets, search, thumbnails** — `P1-8`, `P2-1`, `P2-2`, `P2-3` · ~1.5d
12px type floor, 44px mobile targets, lift `--nx-text-faint`, weight the alerts panel, real search
in the palette, thumbnails in admin lists, an `/activity` page.

**13. Harden** — §08 · ~1 day
Leaked-password protection, error monitoring, rate-limit sign-in, extend E2E to
returns/void/oversell/viewer-role, unit-test `periodRange`, `getProfitAndLoss` and the importer.

### Then, by trigger rather than by date

`F-4` payment status (first credit sale) · `F-6` serials (first warranty claim) ·
`F-10` stock take (first count disagreement) · `F-8` reorder (catalogue growth) ·
`F-12` bulk pricing (~15 SKUs) · `F-15` notifications · `F-14` realised FX

---

## 11 — Verification

Run after each phase. Every one of these is currently failing or absent.

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm e2e
```

**Data invariants** — should all return zero rows:

```sql
-- confirmed sales with no receipt
SELECT s.number FROM sales s WHERE s.status='confirmed'
  AND NOT EXISTS (SELECT 1 FROM ledger_entries l
                   WHERE l.source_kind='sale' AND l.source_id=s.id);

-- received orders with no payment
SELECT p.number FROM purchase_orders p WHERE p.status='received'
  AND NOT EXISTS (SELECT 1 FROM ledger_entries l
                   WHERE l.source_kind='purchase_order' AND l.source_id=p.id);

-- postings not traceable to a document (excluding genuine manual entries)
SELECT * FROM ledger_entries
 WHERE source_kind <> 'manual' AND source_id IS NULL;

-- stock below zero
SELECT * FROM v_stock_levels WHERE on_hand < 0;

-- revenue reachable from the P&L must equal revenue recorded
SELECT (SELECT SUM(total_usd_cents) FROM sales WHERE status='confirmed') AS recorded;
-- compare against the Reports page on "All time"
```

**Manual checks**

- Reports on first load shows a non-empty P&L.
- A sale with three different products can be recorded without discovering a hidden button.
- A capital contribution can be made from `/owners` without leaving the page.
- The storefront renders light for a signed-out visitor and offers a way to make contact.
- The theme toggle's selected state is identifiable at a glance in both themes.

---

## Blocking decisions

Four things need an answer before implementation can complete:

1. **The cash/expense model (step 4).** Does operating cost live in the ledger, or in Expenses?
2. **The team story (step 11).** Will anyone besides Leonardo and Youri ever sign in?
3. **BTW registration (F-1).** Is Nextly VAT-registered, and at what rate? This changes the P&L,
   the invoice and the reporting.
4. **Selling on credit (F-4).** Will you ever hand over goods before being paid in full?

Everything else can proceed immediately.

## 12 — Current implementation audit (2026-09-03)

The purchasing intelligence, bundle sales, weight snapshots, commercial
documents, public invoice access, CSV exports, and dashboard decision queue are
implemented in the current working tree.

Local verification completed:

- `pnpm typecheck` — passed.
- `pnpm lint` — passed with the Biome recommended preset.
- `pnpm test` — passed, 10 test files / 82 tests.
- `pnpm build` — passed with Next.js 16 Cache Components and 43 generated routes.
- `git diff --check` — passed; CRLF notices are Git working-tree conversion
  warnings, not whitespace errors.

Operational verification still required before calling this release live:

- `DATABASE_URL` and `DIRECT_URL` are blank in the current local environment,
  so `pnpm db:migrate` could not connect and no migration was applied here.
- Authenticated Playwright coverage is environment-gated and was skipped when
  no test user/database was configured. Configure staging auth and rerun it;
  a skipped test is not a pass.
- Live Supabase RLS, staging/production reconciliation, backup retention,
  restore drill, storage token, and Vercel environment configuration require
  the real project credentials and cannot be proven from this checkout.

The release gate therefore remains operationally blocked until the staging
steps in `docs/production-readiness.md` are completed. This is an external
environment prerequisite, not a code-test failure.
