# Security

Who can do what, and — more importantly — where that is actually enforced.

---

## Two boundaries, doing different jobs

This is the part worth understanding before changing anything.

**Drizzle connects as the `postgres` role, which bypasses Row Level Security.**
That is deliberate, and it means:

> Server code must authorise explicitly. RLS will not save you.

Every Server Action begins with `requireMember()`, `requireWrite()` or
`requireOwner()` from [`src/server/auth.ts`](../../src/server/auth.ts). The
`(app)` layout calls `requireMember()` once so a new page is protected by
existing rather than by someone remembering to add a guard — but a layout cannot
protect a POST, so actions guard themselves.

**RLS is not redundant.** It is the boundary for the PostgREST API that Supabase
exposes on the public internet. Anyone with the publishable key can reach
`https://<project>.supabase.co/rest/v1/sales`. RLS is what makes that request
return nothing.

| Path | Authorised by |
|---|---|
| Next.js server code → Drizzle → Postgres | `requireMember` / `requireWrite` / `requireOwner` |
| Anything → Supabase REST API | Row Level Security |

---

## RLS design

Every table has `ENABLE ROW LEVEL SECURITY` **and** `FORCE ROW LEVEL SECURITY`.
Without `FORCE`, the table owner silently bypasses its own policies.

| Action | Who |
|---|---|
| `SELECT` | Any member. Nextly is one business with a handful of trusted staff, not multi-tenant SaaS. |
| `INSERT` / `UPDATE` | Owners and staff (`private.can_write()`). Viewers are read-only. |
| `DELETE` | Owners only. |
| `UPDATE` / `DELETE` on `inventory_movements`, `ledger_entries`, `activity_logs` | **Nobody.** No policy exists, so the action is refused. |

Absence of a policy denies. The append-only tables have an `INSERT` policy and
nothing else, which is how "append-only" is enforced by the database rather than
by convention.

### Helper functions live in `private`, not `public`

This is the one genuinely subtle thing here.

PostgREST exposes **every function in `public`** as an RPC endpoint at
`/rest/v1/rpc/<name>`. The first version of the schema put the RLS helpers there,
and Supabase's advisor immediately flagged it: `next_document_number()` was
callable over HTTP by any signed-in user, which would let them burn purchase
order numbers at will, and `is_owner()` leaked role information.

They now live in a `private` schema, which PostgREST does not expose. RLS
policies can reference any schema, so nothing was lost. `authenticated` still
holds `EXECUTE` on them, because policy expressions evaluate with the querying
role's privileges — it simply cannot reach them over the network.

**If you add a `SECURITY DEFINER` function, put it in `private`.** Then run:

```
get_advisors(project_id, type: "security")
```

It currently returns zero findings. Keep it that way.

All of them also set `search_path = ''` and fully qualify every reference, so a
caller cannot shadow a table name and hijack a definer-rights function.

### Views

Every view is created `WITH (security_invoker = true)`. Without it a view runs
with its owner's rights and becomes a hole straight through RLS — the reader
gets everything the view's owner can see, regardless of their own policies.

---

## Authentication

Supabase password auth (`signInWithPassword`). The account and its password
credential live in Supabase; Nextly never stores or sees a password.

This replaced an email one-time link during the first day of use, because a
magic link means waiting on an inbox every single sign-in, and for two owners
using the tool daily that friction outweighed the saved credential.

`/auth/callback` is retained: it exchanges a code for a session and is still
the landing point for a Supabase password-recovery link.

`getUser()` is used everywhere, never `getSession()`. `getSession` trusts a
cookie the browser supplied; `getUser` revalidates the token with Supabase.

### Invitation, and why `members.id` is not the auth id

`members.id` is our own key. `members.auth_user_id` links to `auth.users` and is
null until that person first signs in.

Keeping them separate is what lets an owner exist in the books before they have
ever logged in. Leonardo and Youri hold capital in the ledger dated August 2026,
recorded before this application existed; their `ledger_entries.member_id`
cannot wait on an auth record that does not yet exist.

First sign-in claims the invitation by matching on email
(`getCurrentMember` in `src/server/auth.ts`).

### Signing in is not access

An auth account grants **nothing** on its own. Access is the `members` row,
which only an owner can create; anyone who authenticates without one lands on
`/no-access` and every query is guarded.

With password auth, accounts are created in the Supabase dashboard rather than
self-served, so the surface is smaller than it was under magic links.

---

## Roles

| Role | Read | Write | Delete | Manage team |
|---|---|---|---|---|
| `owner` | ✓ | ✓ | ✓ | ✓ |
| `staff` | ✓ | ✓ | | |
| `viewer` | ✓ | | | |

`is_principal` is separate from role. It marks the people who appear in the
equity split — currently Leonardo and Youri. A future accountant could be an
`owner` without being a principal.

---

## The open-redirect guard

`/auth/callback` accepts a `next` parameter and validates it is a same-origin
absolute path before redirecting:

```ts
const next = requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/';
```

Without the `//` check, `//evil.example` is a protocol-relative URL and the
sign-in flow becomes an open redirect — a link that genuinely lands on the
Nextly domain and then bounces the visitor elsewhere. That is a real phishing
primitive, not a theoretical one.

---

## Secrets

| Variable | Exposure |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public. Fine. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public by design. Useless without RLS-passing auth. |
| `SUPABASE_SECRET_KEY` | **Server only.** Bypasses RLS entirely. |
| `DATABASE_URL` / `DIRECT_URL` | **Server only.** Contains the database password. |
| `BLOB_READ_WRITE_TOKEN` | **Server only.** |

`.env.local` is gitignored. Nothing in `src/` reads a secret outside
`src/server/`.
