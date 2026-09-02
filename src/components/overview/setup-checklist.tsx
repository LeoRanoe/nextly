'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useState } from 'react';
import type { SetupState, SetupStepCode } from '@/server/queries/overview';

/**
 * The setup checklist (F-13).
 *
 * A fresh deployment has no rate, no supplier, no product — and an Overview
 * that is a wall of empty panels reads as a broken app rather than an empty
 * shop. This names the five things worth doing first and links straight to
 * each. Steps complete themselves from the data (`getSetupState`), so nothing
 * here tracks "visited"; dismissing only hides the whole card for owners who
 * are deliberately not ready yet, and dismissal survives via a cookie.
 */

type Step = { code: SetupStepCode; label: string; hint: string; href: string };

const STEPS: Step[] = [
  {
    code: 'rate',
    label: 'Set the exchange rate',
    hint: 'Every SRD figure in the books converts through it.',
    href: '/settings',
  },
  {
    code: 'supplier',
    label: 'Add a supplier',
    hint: 'Purchase orders need someone to buy from.',
    href: '/suppliers',
  },
  {
    code: 'product',
    label: 'Create a product',
    hint: 'Stock, prices and serials all hang off it.',
    href: '/products/new',
  },
  {
    code: 'order',
    label: 'Raise a purchase order',
    hint: 'Freight and fees land on the goods, not the P&L.',
    href: '/purchase-orders/new',
  },
  {
    code: 'sale',
    label: 'Record a sale',
    hint: 'The margin, cash and stock stories all start here.',
    href: '/sales/new',
  },
];

export function SetupChecklist({ state }: { state: SetupState }) {
  const [dismissed, setDismissed] = useState(false);

  if (state.complete || dismissed) return null;

  const remaining = STEPS.filter((step) => !state.done.includes(step.code));

  return (
    <div className="border-line-subtle bg-raised rounded-card border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold text-ink">Get the shop open</h2>
          <p className="mt-0.5 text-[12px] text-ink-3">
            {remaining.length} of {STEPS.length} steps left. Each one completes itself once the
            data exists.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            void fetch('/api/setup-banner', { method: 'POST' });
          }}
          className="text-[12px] text-ink-4 shrink-0 hover:text-ink-2"
        >
          Hide
        </button>
      </div>
      <ol className="mt-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {STEPS.map((step) => {
          const done = state.done.includes(step.code);
          return (
            <li key={step.code}>
              {done ? (
                <span className="text-ink-4 inline-flex items-start gap-2 rounded-control px-2 py-1.5 text-[12px]">
                  <CheckCircle2 className="text-positive mt-0.5 size-4 shrink-0" />
                  <span className="line-through">{step.label}</span>
                </span>
              ) : (
                <Link
                  href={step.href as Route}
                  className="hover:bg-hover focus-visible:outline-ring text-ink inline-flex items-start gap-2 rounded-control px-2 py-1.5 text-[12px] outline-2 outline-offset-2"
                >
                  <Circle className="text-ink-4 mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="font-medium">{step.label}</span>
                    <span className="block text-[11px] text-ink-4">{step.hint}</span>
                  </span>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
