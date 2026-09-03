import { Database } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Wordmark } from '@/components/shell/wordmark';
import { isDatabaseConfigured, isServerEnvironmentValid } from '@/lib/env';

export const metadata: Metadata = { title: 'Setup' };

/**
 * Shown when there are no database credentials.
 *
 * Without a database there is no `members` table, so there is nobody to
 * authorise and no data to protect. Saying that plainly is better than a stack
 * trace, and better than a sign-in form that could never succeed.
 */
export default function SetupPage() {
  const databaseConfigured = isDatabaseConfigured();
  const environmentValid = isServerEnvironmentValid();
  if (databaseConfigured && environmentValid) redirect('/dashboard');

  return (
    <div className="grid min-h-dvh place-items-center px-6 py-12">
      <main className="w-full max-w-[520px]">
        <Wordmark />

        <div className="mt-8 flex size-9 items-center justify-center rounded-control bg-warning-muted text-warning">
          <Database className="size-5" />
        </div>
        <h1 className="mt-4 font-medium text-[18px] text-ink tracking-[-0.02em]">
          {databaseConfigured ? 'Check the database configuration' : 'Connect the database'}
        </h1>
        <p className="mt-2 text-[13px] text-ink-3 leading-relaxed">
          {databaseConfigured
            ? 'The database connection settings are present but do not match the required Supabase pooler format.'
            : 'The Supabase project is created and migrated, and the Master Sheet has already been imported. Two connection strings are still missing.'}
        </p>

        <ol className="mt-6 space-y-4">
          <Step index={1} title="Open the project settings">
            <a
              href="https://supabase.com/dashboard/project/jkaxfghplcwbxxhkjtwf/settings/database"
              target="_blank"
              rel="noreferrer"
              className="tabular break-all text-accent underline-offset-4 hover:underline"
            >
              supabase.com/dashboard/project/jkaxfghplcwbxxhkjtwf/settings/database
            </a>
            <p className="mt-1">
              Reset the database password if nobody has it. Nothing else uses this project, so a
              reset breaks nothing.
            </p>
          </Step>

          <Step
            index={2}
            title={
              databaseConfigured
                ? 'Replace the connection strings in .env.local'
                : 'Copy two connection strings into .env.local'
            }
          >
            <dl className="mt-1 space-y-1.5">
              <Pair
                name="DATABASE_URL"
                value="Transaction pooler, port 6543"
                why="Runtime. Built for short serverless connections."
              />
              <Pair
                name="DIRECT_URL"
                value="Session pooler, port 5432"
                why="Migrations. DDL needs a real session."
              />
            </dl>
            <p className="mt-2 rounded-control border border-warning/40 bg-warning-muted px-2.5 py-2 text-[11px] text-ink-2 leading-relaxed">
              Both hosts must end in <span className="tabular">pooler.supabase.com</span>. The
              direct connection (<span className="tabular">db.&lt;ref&gt;.supabase.co</span>) is
              IPv6-only and Vercel is IPv4-only, so it does not fail — it hangs.
            </p>
          </Step>

          <Step index={3} title="Restart the dev server">
            <code className="tabular mt-1 inline-block rounded-control border border-line bg-inset px-2 py-1 text-[12px]">
              pnpm dev
            </code>
            <p className="mt-1">
              Then sign in. Leonardo is already seeded as an owner, so the first sign-in link
              will let you straight in.
            </p>
          </Step>
        </ol>

        <p className="mt-6 border-line-subtle border-t pt-4 text-[12px] text-ink-4 leading-relaxed">
          Full instructions, including deployment, are in{' '}
          <span className="tabular">docs/05-operations/environments.md</span>.
        </p>
      </main>
    </div>
  );
}

function Step({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="tabular grid size-6 shrink-0 place-items-center rounded-full border border-line bg-inset text-[11px] text-ink-3">
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-[13px] text-ink">{title}</p>
        <div className="mt-1 text-[12px] text-ink-3 leading-relaxed">{children}</div>
      </div>
    </li>
  );
}

function Pair({ name, value, why }: { name: string; value: string; why: string }) {
  return (
    <div className="rounded-control border border-line-subtle bg-inset px-2.5 py-2">
      <dt className="tabular text-[12px] text-ink-2">{name}</dt>
      <dd className="text-[11px] text-ink-3">
        {value} <span className="text-ink-4">— {why}</span>
      </dd>
    </div>
  );
}
