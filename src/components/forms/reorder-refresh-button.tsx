'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { refreshReorderRecommendations } from '@/server/actions/reorder';

export function ReorderRefreshButton() {
  const router = useRouter();
  const action = useAction(refreshReorderRecommendations, {
    onSuccess: () => {
      toast.success('Recommendation snapshot refreshed');
      router.refresh();
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? 'Could not refresh recommendations'),
  });
  return (
    <Button
      variant="secondary"
      onClick={() => action.execute({})}
      disabled={action.status === 'executing'}
    >
      <RefreshCw className="size-4" />{' '}
      {action.status === 'executing' ? 'Refreshing…' : 'Refresh recommendations'}
    </Button>
  );
}
