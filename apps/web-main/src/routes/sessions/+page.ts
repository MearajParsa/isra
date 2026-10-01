import { api } from '$lib/api';
import type { SessionStatus } from '$lib/api/types';
import { errorMessage } from '$lib/utils/errors';

const STATUSES: SessionStatus[] = ['scheduled', 'started', 'ended'];

export const load = async ({ url }: { url: URL }) => {
  const raw = url.searchParams.get('status');
  const status = STATUSES.find((s) => s === raw);
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  try {
    const result = await api.publicContent.listSessions({ status, page, pageSize: 6 });
    return { result, status: status ?? null, error: null as string | null };
  } catch (e) {
    return { result: null, status: status ?? null, error: errorMessage(e) };
  }
};
