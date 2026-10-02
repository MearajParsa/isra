export const prerender = false;

import { api } from '$lib/api';
import { errorMessage } from '$lib/utils/errors';

export const load = async () => {
  try {
    const sessions = await api.publicContent.listSessions({ pageSize: 3 });
    return { sessions, sessionsError: null as string | null };
  } catch (e) {
    return { sessions: null, sessionsError: errorMessage(e) };
  }
};
