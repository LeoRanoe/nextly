'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { ChevronDown, LogOut, Menu as MenuIcon, Settings } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Item, Label, Menu, Separator } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/cn';
import { createClient } from '@/lib/supabase/client';
import { CommandPalette } from './command-palette';
import { Sidebar } from './sidebar';
import { ThemeToggle } from './theme-toggle';

export type TopbarMember = {
  fullName: string;
  email: string;
  role: 'owner' | 'staff' | 'viewer';
};

const ROLE_LABEL: Record<TopbarMember['role'], string> = {
  owner: 'Owner',
  staff: 'Staff',
  viewer: 'Read only',
};

export function Topbar({ member }: { member: TopbarMember }) {
  const [navOpen, setNavOpen] = useState(false);
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-line-subtle border-b bg-base/85 px-4 backdrop-blur-md lg:px-6">
      {/* Mobile navigation */}
      <Dialog.Root open={navOpen} onOpenChange={setNavOpen}>
        <Dialog.Trigger
          className="grid size-8 shrink-0 place-items-center rounded-control text-ink-3 hover:bg-hover hover:text-ink lg:hidden"
          aria-label="Open navigation"
        >
          <MenuIcon className="size-4" />
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[248px] border-line-subtle border-r bg-sunken data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left duration-200 lg:hidden">
            <VisuallyHidden>
              <Dialog.Title>Navigation</Dialog.Title>
            </VisuallyHidden>
            <Sidebar className="h-full" onNavigate={() => setNavOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex-1">
        <CommandPalette />
      </div>

      <ThemeToggle />

      <Menu
        contentClassName="w-56"
        trigger={
          <button
            type="button"
            className={cn(
              'flex h-8 items-center gap-2 rounded-control pr-1.5 pl-1 text-[13px] text-ink-2',
              'transition-colors hover:bg-hover hover:text-ink',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
            )}
          >
            <Avatar name={member.fullName} />
            <span className="hidden sm:inline">{member.fullName}</span>
            <ChevronDown className="size-3.5 text-ink-4" />
          </button>
        }
      >
        <Label>
          <p className="truncate font-medium text-[13px] text-ink">{member.fullName}</p>
          <p className="truncate text-[11px] text-ink-4">{member.email}</p>
          <p className="mt-1 text-[11px] text-ink-3">{ROLE_LABEL[member.role]}</p>
        </Label>
        <Separator />
        <Item asChild>
          <Link href="/settings">
            <Settings className="size-4 text-ink-4" /> Settings
          </Link>
        </Item>
        <Item
          onSelect={async () => {
            await createClient().auth.signOut();
            router.replace('/login');
            router.refresh();
          }}
        >
          <LogOut className="size-4 text-ink-4" /> Sign out
        </Item>
      </Menu>
    </header>
  );
}

/** Initials rather than a generated gradient blob. Two owners: they know who
 *  they are, and a fake avatar image is pure template smell. */
function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span className="tabular grid size-6 shrink-0 place-items-center rounded-full border border-line bg-inset text-[10px] text-ink-2">
      {initials}
    </span>
  );
}
