import { error } from '@sveltejs/kit';
import { api } from '$lib/api';
import { ApiError } from '$lib/api/types';

export const load = async ({ params }: { params: { id: string } }) => {
  try {
    const session = await api.publicContent.getSession(params.id);
    return { session };
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === 'NOT_FOUND') error(404, e.message);
      if (e.code === 'SERVICE_UNAVAILABLE') error(503, e.message);
      error(e.status >= 400 ? e.status : 500, e.message);
    }
    error(500, 'مشکلی در بارگذاری جلسه پیش آمد.');
  }
};
