import { type IncomingMessage, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Transform, type Readable } from 'node:stream';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { ERROR_CATALOG, type ErrorCode, HEADERS, internal } from '@isra/api-types';
import { AppError } from '../common/app-error';
import { ENV, type Env } from '../config/env';
import { type Peer, internalHeaders } from './internal-auth';

type Params = Record<string, string>;
type Query = Record<string, string | number | boolean | undefined>;
/** گزینه‌های فراخوانی: Idempotency-Key مشتق‌شده (retry دوباره نسازد) و timeout کوتاه‌تر برای خواندن‌های غیرحیاتی */
interface CallOpts {
  params?: Params;
  query?: Query;
  body?: unknown;
  idempotencyKey?: string;
  timeoutMs?: number;
}
export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

const ErrBody = z.object({ error: z.object({ code: z.string(), message: z.string().optional(), details: z.record(z.string(), z.unknown()).optional() }) });
const Meta = z.object({ page: z.number().int(), pageSize: z.number().int(), total: z.number().int() });

/** پاسخ‌های بدون دادهٔ معنادار (Empty) */
const AnyData = z.unknown();

/**
 * کلاینت internal با پیشوند سرویس مبدأ (`INTERNAL_URL_*` شامل `/c` یا `/o` است؛ مسیر: `{url}/internal/v1{path}`).
 * نگاشت خطا (docs-v2/26): شبکه/timeout/۵xx/401/403 مبدأ ⇒ 503 SERVICE_UNAVAILABLE (پیام خنثی، لاگ بدون secret/PII)؛
 * ۴xx مبدأ با `{error:{code,message,details}}` ⇒ همان code/message/details. تنها استثنای 401: AUTH_INVALID_CREDENTIALS (رمز فعلی غلط).
 */
abstract class OriginClient {
  protected abstract readonly peer: Peer;
  protected abstract readonly baseUrl: string | undefined;
  protected readonly log = new Logger('OriginClient');

  constructor(protected readonly env: Env) {}

  protected unavailable(why: string): AppError {
    this.log.warn({ peer: this.peer, why }, 'origin unavailable');
    return new AppError('SERVICE_UNAVAILABLE');
  }

  protected path(tpl: string, params: Params = {}): string {
    return tpl.replace(/:(\w+)/g, (_, k: string) => encodeURIComponent(params[k] ?? ''));
  }

  private async raw(method: string, tpl: string, o: CallOpts): Promise<{ data: unknown; meta: unknown }> {
    if (!this.baseUrl) throw this.unavailable('no base url');
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(o.query ?? {})) if (v !== undefined) qs.set(k, String(v));
    const url = `${this.baseUrl}/internal/v1${this.path(tpl, o.params)}${qs.size ? `?${qs}` : ''}`;
    let res: Response;
    let text: string;
    try {
      res = await fetch(url, {
        method,
        headers: { ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(o.idempotencyKey ? { [HEADERS.idempotencyKey]: o.idempotencyKey } : {}), ...internalHeaders(this.env, this.peer) },
        body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
        signal: AbortSignal.timeout(o.timeoutMs ?? this.env.INTERNAL_TIMEOUT_MS)
      });
      text = await res.text();
    } catch (e) {
      throw this.unavailable(e instanceof Error ? e.name : 'network');
    }
    return this.interpret(res.status, text);
  }

  /** نگاشت پاسخ مبدأ (envelope یا خطا) — مشترک بین fetch و stream */
  protected interpret(status: number, text: string): { data: unknown; meta: unknown } {
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = undefined;
    }
    if (status < 200 || status >= 300) {
      const eb = ErrBody.safeParse(json);
      const code = eb.success ? eb.data.error.code : undefined;
      const known = code !== undefined && code in ERROR_CATALOG ? (code as ErrorCode) : undefined;
      const passthrough = status >= 400 && status < 500 && known !== undefined && ((status !== 401 && status !== 403) || known === 'AUTH_INVALID_CREDENTIALS');
      if (passthrough && eb.success) throw new AppError(known!, { message: eb.data.error.message, details: eb.data.error.details });
      throw this.unavailable(`http ${status}`);
    }
    const ok = z.object({ success: z.literal(true), data: z.unknown(), meta: z.unknown().optional() }).safeParse(json);
    if (!ok.success) throw this.unavailable('bad envelope');
    return { data: ok.data.data, meta: ok.data.meta };
  }

  /**
   * درخواست stream‌شده (۱.۷.۰، رسانهٔ گالری): بدنهٔ ورودی با backpressure و بدون بافر کامل به مبدأ pipe می‌شود و پاسخ به‌صورت
   * stream برمی‌گردد. `timeoutMs` = مهلت بیکاری socket (نه کل انتقال). شبکه/timeout ⇒ 503.
   * اگر مبدأ پیش از پایان بدنه پاسخ دهد (مثلاً 413/415)، خطای pipe نادیده گرفته می‌شود و همان پاسخ برمی‌گردد.
   */
  protected stream(method: string, tpl: string, o: { params?: Params; query?: Query; headers?: Record<string, string>; body?: Readable; maxBytes?: number; timeoutMs: number }): Promise<IncomingMessage> {
    if (!this.baseUrl) return Promise.reject(this.unavailable('no base url'));
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(o.query ?? {})) if (v !== undefined) qs.set(k, String(v));
    const url = new URL(`${this.baseUrl}/internal/v1${this.path(tpl, o.params)}${qs.size ? `?${qs}` : ''}`);
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    return new Promise<IncomingMessage>((resolve, reject) => {
      let settled = false;
      const done = (e: unknown, res?: IncomingMessage) => {
        if (settled) return;
        settled = true;
        if (res) resolve(res);
        else reject(e instanceof AppError ? e : this.unavailable(e instanceof Error ? e.name : 'network'));
      };
      const up = send(url, { method, headers: { ...(o.headers ?? {}), ...internalHeaders(this.env, this.peer) }, timeout: o.timeoutMs }, (res) => done(null, res));
      up.on('timeout', () => up.destroy(new Error('timeout')));
      up.on('error', (e) => done(e));
      if (!o.body) {
        up.end();
        return;
      }
      // سقف دفاعی: بیش از Content-Length/maxBytes ⇒ قطع (parser HTTP خودش طول را محدود می‌کند؛ این لایهٔ دوم است)
      const src = o.body;
      let seen = 0;
      const limit = new Transform({
        transform: (chunk: Buffer, _enc, cb) => {
          seen += chunk.length;
          if (o.maxBytes !== undefined && seen > o.maxBytes) cb(new AppError('PAYLOAD_TOO_LARGE'));
          else cb(null, chunk);
        }
      });
      // pipe دستی (نه pipeline): شکست مقصد نباید socket کلاینت را ببندد تا پاسخ خطا هنوز قابل ارسال باشد؛ باقی بدنه دور ریخته می‌شود
      const abort = (e: unknown) => {
        src.unpipe(limit);
        limit.unpipe(up);
        src.resume();
        up.destroy();
        done(e);
      };
      limit.on('error', abort);
      src.on('error', abort);
      src.on('close', () => {
        if (!src.readableEnded) abort(new Error('client aborted'));
      });
      src.pipe(limit).pipe(up);
    });
  }

  /** بدنهٔ کوچک (خطا/envelope) از پاسخ stream‌شده با سقف ۶۴KB */
  protected async readSmall(res: IncomingMessage, cap = 64 * 1024): Promise<string> {
    const chunks: Buffer[] = [];
    let n = 0;
    for await (const c of res as AsyncIterable<Buffer>) {
      n += c.length;
      if (n > cap) {
        res.destroy();
        throw this.unavailable('response too large');
      }
      chunks.push(c);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  protected async one<T extends z.ZodType>(schema: T, method: string, tpl: string, o: CallOpts = {}): Promise<z.infer<T>> {
    const { data } = await this.raw(method, tpl, o);
    const p = schema.safeParse(data);
    if (!p.success) throw this.unavailable('bad payload');
    return p.data;
  }

  protected async page<T extends z.ZodType>(item: T, tpl: string, o: CallOpts): Promise<Paged<z.infer<T>>> {
    const { data, meta } = await this.raw('GET', tpl, o);
    const d = z.array(item).safeParse(data);
    const m = Meta.safeParse(meta);
    if (!d.success || !m.success) throw this.unavailable('bad list payload');
    return { items: d.data, page: m.data.page, pageSize: m.data.pageSize, total: m.data.total };
  }

  protected async none(method: string, tpl: string, o: CallOpts = {}): Promise<void> {
    await this.one(AnyData, method, tpl, o);
  }

  /** پاسخ اختیاری: اگر شکل schema را داشت برمی‌گردد وگرنه null (نوشتن‌هایی که قرارداد پاسخشان را مشخص نکرده) */
  protected async maybe<T extends z.ZodType>(schema: T, method: string, tpl: string, o: CallOpts = {}): Promise<z.infer<T> | null> {
    const { data } = await this.raw(method, tpl, o);
    const p = schema.safeParse(data);
    return p.success ? p.data : null;
  }
}

type LowUser = z.infer<typeof internal.LowAdminUser>;
type LowSession = z.infer<typeof internal.LowAdminSession>;

/** high ⇒ low (مالک حساب: کاربر/رمز/نشست‌ها/گزارش‌های حساب) */
@Injectable()
export class LowAdminClient extends OriginClient {
  protected readonly peer = 'low' as const;
  protected readonly baseUrl: string | undefined;

  constructor(@Inject(ENV) env: Env) {
    super(env);
    this.baseUrl = env.INTERNAL_URL_LOW;
  }

  private readonly A = internal.LOW_ADMIN;

  getUser(id: string): Promise<LowUser> {
    return this.one(internal.LowAdminUser, 'GET', this.A.user, { params: { id } });
  }
  createUser(body: z.infer<typeof internal.LowAdminCreateUser>): Promise<LowUser> {
    return this.one(internal.LowAdminUser, 'POST', this.A.users, { body });
  }
  /** پاسخ استفاده نمی‌شود؛ حالت تازه با getUser خوانده می‌شود (وابسته نبودن به شکل پاسخ نوشتن‌ها) */
  updateUser(id: string, body: z.infer<typeof internal.LowAdminUpdateUser>): Promise<void> {
    return this.none('PATCH', this.A.user, { params: { id }, body });
  }
  deleteUser(id: string): Promise<void> {
    return this.none('DELETE', this.A.user, { params: { id } });
  }
  setStatus(id: string, body: z.infer<typeof internal.LowAdminStatus>): Promise<void> {
    return this.none('POST', this.A.status, { params: { id }, body });
  }
  setPassword(id: string, body: z.infer<typeof internal.LowAdminPassword>): Promise<void> {
    return this.none('PUT', this.A.password, { params: { id }, body });
  }
  changePassword(id: string, body: z.infer<typeof internal.LowAdminChangePassword>): Promise<void> {
    return this.none('POST', this.A.changePassword, { params: { id }, body });
  }
  /** ۱.۶.۰: exceptSessionId ⇒ نشست جاری می‌ماند (H-07 در یک فراخوانی) */
  logoutAll(id: string, body: z.infer<typeof internal.LowAdminLogoutAllBody> = {}): Promise<void> {
    return this.none('POST', this.A.logoutAll, { params: { id }, body });
  }
  /** ساخت گروهی (H-73 createMissing)؛ Idempotency-Key ⇒ retry دوباره نمی‌سازد */
  usersBulk(body: z.infer<typeof internal.LowAdminUsersBulkBody>, idempotencyKey?: string) {
    return this.one(internal.LowAdminUsersBulkResult, 'POST', this.A.usersBulk, { body, idempotencyKey });
  }
  /** آمار تحویل پیام همگانی (H-46) */
  broadcast(id: string) {
    return this.one(internal.LowAdminBroadcastStats, 'GET', this.A.broadcast, { params: { id } });
  }
  listSessions(id: string, q: { page?: number; pageSize?: number; activeOnly?: boolean } = {}): Promise<Paged<LowSession>> {
    return this.page(internal.LowAdminSession, this.A.sessions, { params: { id }, query: { page: q.page, pageSize: q.pageSize, activeOnly: q.activeOnly === undefined ? undefined : String(q.activeOnly) } });
  }
  revokeSession(id: string, sessionId: string): Promise<void> {
    return this.none('DELETE', this.A.session, { params: { id, sessionId } });
  }
  reportOtp(q: z.input<typeof internal.LowAdminRangeQuery>) {
    return this.one(internal.LowAdminOtpSeries, 'GET', this.A.reportOtp, { query: q });
  }
  reportClients() {
    return this.one(internal.LowAdminClients, 'GET', this.A.reportClients);
  }
  reportUsers(q: z.input<typeof internal.LowAdminUsersReportQuery>) {
    return this.one(internal.LowAdminUsersReport, 'GET', this.A.reportUsers, { query: q });
  }
}

const M = internal.MID_ADMIN;
const Count = z.number().int().min(0);

/** high ⇒ mid (مالک جلسه/عضو/حضور/صف/ارزیابی/امتیاز) */
@Injectable()
export class MidAdminClient extends OriginClient {
  protected readonly peer = 'mid' as const;
  protected readonly baseUrl: string | undefined;

  constructor(@Inject(ENV) env: Env) {
    super(env);
    this.baseUrl = env.INTERNAL_URL_MID;
  }

  listSessions(q: Query) {
    return this.page(internal.MidAdminSession, M.sessions, { query: q });
  }
  getSession(id: string) {
    return this.one(internal.MidAdminSession, 'GET', M.session, { params: { id }, query: { includeDeleted: 'true' } });
  }
  createSession(body: z.infer<typeof internal.MidAdminCreateSession>, idempotencyKey?: string) {
    return this.one(internal.MidAdminSession, 'POST', M.sessions, { body, idempotencyKey });
  }
  patchSession(id: string, body: z.infer<typeof internal.MidAdminPatchSession>) {
    return this.one(internal.MidAdminSession, 'PATCH', M.session, { params: { id }, body });
  }
  transition(id: string, body: z.infer<typeof internal.MidAdminTransition>) {
    return this.one(internal.MidAdminSession, 'POST', M.transition, { params: { id }, body });
  }
  deleteSession(id: string): Promise<void> {
    return this.none('DELETE', M.session, { params: { id } });
  }
  listMembers(id: string, q: Query) {
    return this.page(internal.MidAdminMember, M.members, { params: { id }, query: q });
  }
  decide(id: string, memberId: string, body: z.infer<typeof internal.MidAdminDecide>) {
    return this.one(internal.MidAdminMember, 'PATCH', M.member, { params: { id, memberId }, body });
  }
  /** قرارداد پاسخ حذف را مشخص نکرده؛ اگر mid عضو حذف‌شده را برگرداند (userId برای audit) استفاده می‌شود */
  removeMember(id: string, memberId: string) {
    return this.maybe(z.object({ userId: z.string(), name: z.string().optional() }).loose(), 'DELETE', M.member, { params: { id, memberId } });
  }
  attendance(id: string, query: Query = {}) {
    return this.one(internal.MidAdminAttendance.extend({ occurrenceId: z.string().nullable().default(null) }), 'GET', M.attendance, { params: { id }, query });
  }
  queue(id: string, query: Query = {}) {
    return this.one(internal.MidAdminQueue, 'GET', M.queue, { params: { id }, query });
  }
  evaluations(id: string, query: Query = {}) {
    return this.one(internal.MidAdminEvaluations, 'GET', M.evaluations, { params: { id }, query });
  }
  // ───────── ۱.۶.۰ (docs-v2/30) ─────────
  membersAdd(id: string, body: z.input<typeof internal.MidAdminAddMembers>, idempotencyKey?: string) {
    return this.one(internal.MidAdminAddMembersResult, 'POST', M.membersAdd, { params: { id }, body, idempotencyKey, timeoutMs: Math.max(this.env.INTERNAL_TIMEOUT_MS, 5000) });
  }
  membersDecide(id: string, body: z.infer<typeof internal.MidAdminDecideBulk>) {
    return this.one(internal.MidAdminDecideBulkResult, 'POST', M.membersDecide, { params: { id }, body });
  }
  /** ۱.۷.۰: تغییر استاد صاحب (H-74) */
  owner(id: string, body: z.input<typeof internal.MidAdminOwner>) {
    return this.one(internal.MidAdminOwnerResult, 'PUT', M.owner, { params: { id }, body });
  }
  occurrences(id: string, query: Query) {
    return this.page(internal.MidAdminOccurrence, M.occurrences, { params: { id }, query });
  }
  markAttendance(id: string, body: z.infer<typeof internal.MidAdminMarkAttendance>) {
    return this.one(internal.MidAdminMarkAttendanceResult, 'POST', M.attendanceMark, { params: { id }, body });
  }
  revokeAttendance(id: string, userId: string, body: z.infer<typeof internal.MidAdminRevokeAttendance>) {
    return this.one(internal.MidAdminRevokeAttendanceResult, 'POST', M.attendanceRevoke, { params: { id, userId }, body });
  }
  queueNext(id: string, body: z.infer<typeof internal.MidAdminQueueNext>) {
    return this.one(internal.MidAdminQueue, 'POST', M.queueNext, { params: { id }, body });
  }
  queueAct(id: string, itemId: string, body: z.infer<typeof internal.MidAdminQueueAct>, idempotencyKey?: string) {
    return this.one(internal.MidAdminQueue, 'PATCH', M.queueItem, { params: { id, itemId }, body, idempotencyKey });
  }
  patchEvaluation(id: string, evalId: string, body: z.infer<typeof internal.MidAdminEvaluationPatch>) {
    return this.one(internal.MidAdminEvaluation, 'PATCH', M.evaluation, { params: { id, evalId }, body });
  }
  voidEvaluation(id: string, evalId: string, body: z.infer<typeof internal.MidAdminEvaluationVoid>) {
    return this.one(internal.MidAdminEvaluation, 'POST', M.evaluationVoid, { params: { id, evalId }, body });
  }
  notify(id: string, body: z.infer<typeof internal.MidAdminNotify>, idempotencyKey?: string) {
    return this.one(internal.MidAdminNotifyResult, 'POST', M.notify, { params: { id }, body, idempotencyKey });
  }
  userMemberships(id: string, query: Query) {
    return this.page(internal.MidAdminUserMembership, M.userMemberships, { params: { id }, query });
  }
  userPoints(id: string, query: Query) {
    return this.one(internal.MidAdminUserPoints, 'GET', M.userPoints, { params: { id }, query });
  }
  pointsAdjust(id: string, body: z.infer<typeof internal.MidAdminPointsAdjust>, idempotencyKey?: string) {
    return this.one(internal.MidAdminPointsAdjustResult, 'POST', M.pointsAdjust, { params: { id }, body, idempotencyKey });
  }
  /** شمارش دارندگان؛ timeout کوتاه (فراخواننده خطا را به ۰ تبدیل می‌کند) */
  badgeHolders(timeoutMs: number) {
    return this.one(internal.MidAdminBadgeHolders, 'GET', M.badgeHolders, { timeoutMs });
  }
  // ───────── ۱.۷.۰ (docs-v2/31) ─────────
  /** صاحبان جلسه (job اعطای teacher) */
  sessionOwners(page: number, pageSize: number) {
    return this.page(internal.MidAdminSessionOwner, M.sessionOwners, { query: { page, pageSize } });
  }
  teacherSupporters(id: string, query: Query) {
    return this.page(internal.MidAdminTeacherSupporter, M.teacherSupporters, { params: { id }, query });
  }
  putTeacherSupporter(id: string, supporterId: string, body: z.input<typeof internal.MidAdminSupporterPut>) {
    return this.one(internal.MidAdminTeacherSupporter, 'PUT', M.teacherSupporter, { params: { id, supporterId }, body });
  }
  deleteTeacherSupporter(id: string, supporterId: string, actorId: string): Promise<void> {
    return this.none('DELETE', M.teacherSupporter, { params: { id, supporterId }, query: { actorId } });
  }
  sessionSupporters(id: string, query: Query) {
    return this.page(internal.MidAdminSessionSupporter, M.supporters, { params: { id }, query });
  }
  putSessionSupporter(id: string, userId: string, body: z.input<typeof internal.MidAdminSupporterPut>) {
    return this.one(internal.MidAdminSessionSupporter, 'PUT', M.supporter, { params: { id, userId }, body });
  }
  deleteSessionSupporter(id: string, userId: string, actorId: string): Promise<void> {
    return this.none('DELETE', M.supporter, { params: { id, userId }, query: { actorId } });
  }
  galleries(id: string, query: Query) {
    return this.page(internal.MidAdminGallery, M.galleries, { params: { id }, query });
  }
  createGallery(id: string, body: z.input<typeof internal.MidAdminCreateGallery>, idempotencyKey?: string) {
    return this.one(internal.MidAdminGallery, 'POST', M.galleries, { params: { id }, body, idempotencyKey });
  }
  patchGallery(id: string, galleryId: string, body: z.input<typeof internal.MidAdminPatchGallery>) {
    return this.one(internal.MidAdminGallery, 'PATCH', M.gallery, { params: { id, galleryId }, body });
  }
  deleteGallery(id: string, galleryId: string, actorId: string): Promise<void> {
    return this.none('DELETE', M.gallery, { params: { id, galleryId }, query: { actorId } });
  }
  galleryItems(id: string, galleryId: string, query: Query) {
    return this.page(internal.MidAdminGalleryItem, M.galleryItems, { params: { id, galleryId }, query });
  }
  deleteGalleryItem(id: string, galleryId: string, itemId: string, actorId: string): Promise<void> {
    return this.none('DELETE', M.galleryItem, { params: { id, galleryId, itemId }, query: { actorId } });
  }
  /**
   * H-115: بدنهٔ خام stream‌شده به MID_ADMIN.galleryItems (Content-Type/Content-Length اصلی؛ بدون بافر کامل).
   * پاسخ کوچک JSON (GalleryItem) خوانده و مثل بقیهٔ فراخوانی‌ها نگاشت می‌شود.
   */
  async uploadGalleryItem(id: string, galleryId: string, query: z.input<typeof internal.MidAdminUploadQuery>, body: Readable, meta: { contentType: string; contentLength: number; idempotencyKey?: string }) {
    const res = await this.stream('POST', M.galleryItems, {
      params: { id, galleryId },
      query: { actorId: query.actorId, title: query.title },
      headers: { 'Content-Type': meta.contentType, 'Content-Length': String(meta.contentLength), ...(meta.idempotencyKey ? { [HEADERS.idempotencyKey]: meta.idempotencyKey } : {}) },
      body,
      maxBytes: meta.contentLength,
      timeoutMs: this.env.MEDIA_PROXY_TIMEOUT_MS
    });
    const { data } = this.interpret(res.statusCode ?? 502, await this.readSmall(res));
    const p = internal.MidAdminGalleryItem.safeParse(data);
    if (!p.success) throw this.unavailable('bad payload');
    return p.data;
  }
  /**
   * H-117: محتوای خام از MID_ADMIN.galleryItemContent؛ `Range`/`If-None-Match`/`If-Range` عبور می‌کند. پاسخ ۲xx/۳۰۴/۴۱۶ همان stream است؛
   * خطای JSON مبدأ (۴xx/۵xx) مثل بقیهٔ فراخوانی‌ها نگاشت می‌شود.
   */
  async galleryItemContent(id: string, galleryId: string, itemId: string, headers: Record<string, string>): Promise<IncomingMessage> {
    const res = await this.stream('GET', M.galleryItemContent, { params: { id, galleryId, itemId }, headers, timeoutMs: this.env.MEDIA_PROXY_TIMEOUT_MS });
    const st = res.statusCode ?? 502;
    if ((st >= 200 && st < 300) || st === 304 || st === 416) return res;
    this.interpret(st, await this.readSmall(res));
    throw this.unavailable(`http ${st}`);
  }
  comments(id: string, query: Query) {
    return this.page(internal.MidAdminComment, M.comments, { params: { id }, query });
  }
  moderateComment(id: string, commentId: string, body: z.input<typeof internal.MidAdminModerateComment>) {
    return this.one(internal.MidAdminComment, 'PATCH', M.comment, { params: { id, commentId }, body });
  }
  deleteComment(id: string, commentId: string, actorId: string): Promise<void> {
    return this.none('DELETE', M.comment, { params: { id, commentId }, query: { actorId } });
  }
  /** آمار وضعیت جلسه‌ها برای H-01 (مسیر internal موجود mid) */
  sessionStats() {
    return this.one(z.object({ draft: Count, scheduled: Count, started: Count, ended: Count }), 'GET', '/stats/sessions');
  }
  userSummary(id: string) {
    return this.one(internal.MidAdminUserSummary, 'GET', M.userSummary, { params: { id } });
  }
  reportOverview(q: z.input<typeof internal.MidAdminRangeQuery>) {
    return this.one(internal.MidAdminOverview, 'GET', M.reportOverview, { query: q });
  }
  reportSessions(q: z.input<typeof internal.MidAdminRangeQuery>) {
    return this.one(internal.MidAdminSessionsSeries, 'GET', M.reportSessions, { query: q });
  }
  reportLeaderboard(limit: number) {
    return this.one(internal.MidAdminLeaderboard, 'GET', M.reportLeaderboard, { query: { limit } });
  }
}
