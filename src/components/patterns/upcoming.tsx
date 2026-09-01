import { Hammer } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';

/**
 * An honest placeholder.
 *
 * Used only for routes that are genuinely next in the build, never to dress up
 * a screen that does not work. It names what will be here and where to go in
 * the meantime, because a link that leads nowhere is worse than one that says
 * so plainly.
 */
export function Upcoming({
  what,
  instead,
  href,
}: {
  what: string;
  instead: string;
  href: Route;
}) {
  return (
    <Surface>
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <div className="grid size-10 place-items-center rounded-card border border-line-subtle bg-inset text-ink-4">
          <Hammer className="size-[18px]" />
        </div>
        <p className="mt-3 font-medium text-[14px] text-ink">Not built yet</p>
        <p className="mt-1 max-w-[46ch] text-[13px] text-ink-3 leading-relaxed">{what}</p>
        <Button asChild variant="secondary" size="sm" className="mt-4">
          <Link href={href}>{instead}</Link>
        </Button>
      </div>
    </Surface>
  );
}
