import { api } from '$lib/api';

export const prerender = false;

const ORIGIN = 'https://israapp.ir';
const STATIC = ['/', '/sessions', '/about', '/privacy', '/terms'];

/** نقشهٔ سایت: صفحات ثابت + جلسات عمومی (از api-low؛ draft هرگز) */
export async function GET() {
  const urls = STATIC.map((p) => ({ loc: `${ORIGIN}${p}` }));
  try {
    for (let page = 1; page <= 5; page++) {
      const r = await api.publicContent.listSessions({ page, pageSize: 50 });
      for (const s of r.items) urls.push({ loc: `${ORIGIN}/sessions/${s.id}` });
      if (page * 50 >= r.total) break;
    }
  } catch {
    /* API در دسترس نیست: فقط صفحات ثابت */
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u.loc}</loc></url>`).join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' } });
}
