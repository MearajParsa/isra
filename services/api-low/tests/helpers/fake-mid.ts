import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeMid {
  url: string;
  hits: { method: string; url: string; headers: IncomingMessage['headers']; body: unknown }[];
  /** پاسخ سفارشی per مسیر؛ برگرداندن undefined ⇒ 500 */
  handler: (req: IncomingMessage, body: unknown) => { status: number; json?: unknown } | undefined;
  close: () => Promise<void>;
}

/** api-mid جعلی با قرارداد internal REST (فقط برای تست) */
export async function startFakeMid(): Promise<FakeMid> {
  const hits: FakeMid['hits'] = [];
  const fake: FakeMid = {
    url: '',
    hits,
    handler: () => undefined,
    close: () => new Promise((r) => server.close(() => r()))
  };
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      const body = raw ? (JSON.parse(raw) as unknown) : undefined;
      hits.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body });
      const out = fake.handler(req, body);
      res.statusCode = out?.status ?? 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(out?.json ?? {}));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return fake;
}
