'use client';

import * as Popover from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * Searchable picker with inline creation.
 *
 * The create option matters more than the search does. Recording a sale to a
 * walk-in customer should not mean abandoning the form, navigating to
 * Customers, creating a record and starting over — that is the friction that
 * sends people back to the spreadsheet.
 */

export type ComboboxOption = {
  value: string;
  label: string;
  /** Right-aligned detail: a SKU, stock level, price. */
  meta?: string;
  /** Second line under the label. */
  hint?: string;
  disabled?: boolean;
};

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select',
  searchPlaceholder = 'Search',
  emptyLabel = 'Nothing matches that.',
  onCreate,
  createLabel = 'Create',
  id,
  disabled,
  className,
}: {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  /** When provided, an unmatched search term offers to create a record. */
  onCreate?: (label: string) => void | Promise<void>;
  createLabel?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((option) => option.value === value);
  const trimmed = query.trim();
  const exactMatch = options.some(
    (option) => option.label.toLowerCase() === trimmed.toLowerCase(),
  );
  const canCreate = Boolean(onCreate) && trimmed.length > 0 && !exactMatch;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        id={id}
        disabled={disabled}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-control border border-line bg-raised px-2.5',
          'text-left text-[13px] transition-colors outline-none',
          'focus-visible:border-accent-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          selected ? 'text-ink' : 'text-ink-4',
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? placeholder}</span>
        {selected?.meta ? (
          <span className="tabular shrink-0 text-[12px] text-ink-4">{selected.meta}</span>
        ) : null}
        <ChevronsUpDown className="size-3.5 shrink-0 text-ink-4" />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className={cn(
            'z-50 w-[var(--radix-popover-trigger-width)] min-w-[240px] overflow-hidden',
            'rounded-card border border-line bg-overlay shadow-overlay',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-98 data-[state=open]:zoom-in-98 duration-150',
          )}
        >
          <Command loop shouldFilter>
            <div className="border-line-subtle border-b px-2.5">
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={searchPlaceholder}
                className="h-9 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-4"
              />
            </div>

            <Command.List className="max-h-[260px] overflow-y-auto p-1">
              {!canCreate ? (
                <Command.Empty className="px-2.5 py-6 text-center text-[12px] text-ink-4">
                  {emptyLabel}
                </Command.Empty>
              ) : null}

              {options.map((option) => (
                <Command.Item
                  key={option.value}
                  value={`${option.label} ${option.meta ?? ''} ${option.hint ?? ''}`}
                  disabled={option.disabled}
                  onSelect={() => {
                    onChange(option.value === value ? null : option.value);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-control px-2.5 py-1.5 text-[13px] text-ink-2',
                    'data-[selected=true]:bg-hover data-[selected=true]:text-ink',
                    'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-40',
                  )}
                >
                  <Check
                    className={cn(
                      'size-3.5 shrink-0',
                      option.value === value ? 'text-accent' : 'text-transparent',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.hint ? (
                      <span className="block truncate text-[11px] text-ink-4">
                        {option.hint}
                      </span>
                    ) : null}
                  </span>
                  {option.meta ? (
                    <span className="tabular shrink-0 text-[11px] text-ink-4">
                      {option.meta}
                    </span>
                  ) : null}
                </Command.Item>
              ))}

              {canCreate ? (
                <Command.Item
                  value={`__create__${trimmed}`}
                  onSelect={async () => {
                    await onCreate?.(trimmed);
                    setOpen(false);
                    setQuery('');
                  }}
                  className="mt-1 flex cursor-pointer items-center gap-2 rounded-control border-line-subtle border-t px-2.5 py-1.5 text-[13px] text-accent data-[selected=true]:bg-hover"
                >
                  <Plus className="size-3.5 shrink-0" />
                  <span className="truncate">
                    {createLabel} &ldquo;{trimmed}&rdquo;
                  </span>
                </Command.Item>
              ) : null}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
