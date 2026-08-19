import { useQuery } from '@tanstack/react-query';
import { get, getPage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Meta, Notice } from '@/lib/types';

export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: () => get<Meta>('/meta'), staleTime: 10 * 60_000 });

export function useUnread() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notifications', 'unread'], enabled: !!user, refetchInterval: 60_000,
    queryFn: async () => (await getPage<Notice>('/me/notifications', { unread: 'true', pageSize: 1 })).meta?.unreadCount as number ?? 0,
  });
}
