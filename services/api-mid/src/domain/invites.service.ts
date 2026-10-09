import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { sha256 } from '../common/crypto';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { LiveService } from '../live/live.service';
import { MembersAccess, approvedCount } from './access.service';
import { NAME_SQL, conflict, displayName } from './db';
import { MembersService, memberDto } from './members.service';

const MAX_ACTIVE = 20;

interface InviteRow {
  id: Buffer;
  max_uses: number | null;
  uses: number;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
  created_by: Buffer;
  creator_name: string | null;
}

const SELECT = `SELECT i.id, i.max_uses, i.uses, i.expires_at, i.revoked_at, i.created_at, i.created_by, ${NAME_SQL} AS creator_name
                  FROM session_invites i LEFT JOIN user_directory d ON d.user_id = i.created_by`;

const dto = (r: InviteRow) => ({
  id: bufToUuid(r.id),
  maxUses: r.max_uses,
  uses: r.uses,
  expiresAt: r.expires_at.toISOString(),
  revokedAt: r.revoked_at ? r.revoked_at.toISOString() : null,
  createdAt: r.created_at.toISOString(),
  createdBy: { id: bufToUuid(r.created_by), name: r.creator_name || displayName() }
});

const notFound = () => new AppError('NOT_FOUND', { message: 'دعوت پیدا نشد.' });

/**
 * دعوت با کد (M-50..M-53): کد ۱۲۸ بیتی (base64url، ۲۲ نویسه) فقط یک‌بار برگردانده می‌شود؛ فقط SHA-256 ذخیره است.
 * مصرف اتمیک با UPDATE شرطی؛ حداکثر ۲۰ دعوت فعال per جلسه (LIMIT_REACHED).
 */
@Injectable()
export class InvitesService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly access: MembersAccess,
    private readonly members: MembersService,
    private readonly limiter: RateLimitService,
    private readonly live: LiveService
  ) {}

  /** M-50 (membership.manage): ۱.۷.۰ دعوت فقط برای عضویت (بدون نقش) */
  async create(userId: string, sessionId: string, b: { maxUses: number | null; expiresInHours: number }) {
    const code = randomBytes(16).toString('base64url');
    const id = uuidv7(this.clock.now().getTime());
    await this.ds.transaction(async (m) => {
      const { session } = await this.access.load(m, sessionId, userId, 'membership.manage', true);
      if (session.status === 'ended') throw conflict('SESSION_LOCKED', 'این جلسه پایان یافته است.');
      const now = this.clock.now();
      const act = (await m.query('SELECT COUNT(*) AS n FROM session_invites WHERE session_id = ? AND revoked_at IS NULL AND expires_at > ? AND (max_uses IS NULL OR uses < max_uses)', [uuidToBuf(sessionId), now])) as { n: string | number }[];
      if (Number(act[0]?.n ?? 0) >= MAX_ACTIVE) throw conflict('LIMIT_REACHED', 'حداکثر ۲۰ دعوت فعال برای هر جلسه مجاز است.');
      await m.query('INSERT INTO session_invites (id, session_id, code_hash, max_uses, uses, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)', [
        uuidToBuf(id),
        uuidToBuf(sessionId),
        sha256(code),
        b.maxUses,
        new Date(now.getTime() + b.expiresInHours * 3_600_000),
        uuidToBuf(userId),
        now
      ]);
    });
    const r = (await this.ds.query(`${SELECT} WHERE i.id = ?`, [uuidToBuf(id)])) as InviteRow[];
    return { ...dto(r[0]!), code };
  }

  async list(userId: string, sessionId: string, page: number, pageSize: number) {
    await this.access.load(this.ds, sessionId, userId, 'membership.manage');
    const sid = uuidToBuf(sessionId);
    const [rows, cnt] = await Promise.all([
      this.ds.query(`${SELECT} WHERE i.session_id = ? ORDER BY i.created_at DESC, i.id DESC LIMIT ? OFFSET ?`, [sid, pageSize, (page - 1) * pageSize]) as Promise<InviteRow[]>,
      this.ds.query('SELECT COUNT(*) AS n FROM session_invites WHERE session_id = ?', [sid]) as Promise<{ n: string | number }[]>
    ]);
    return { items: rows.map(dto), page, pageSize, total: Number(cnt[0]?.n ?? 0) };
  }

  /** M-52: idempotent */
  async revoke(userId: string, sessionId: string, inviteId: string): Promise<Record<string, never>> {
    await this.access.load(this.ds, sessionId, userId, 'membership.manage');
    if (!isUuid(inviteId)) throw notFound();
    const r = (await this.ds.query('SELECT 1 AS x FROM session_invites WHERE id = ? AND session_id = ?', [uuidToBuf(inviteId), uuidToBuf(sessionId)])) as unknown[];
    if (!r.length) throw notFound();
    await this.ds.query('UPDATE session_invites SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [this.clock.now(), uuidToBuf(inviteId)]);
    return {};
  }

  /**
   * M-53: سقف durable per کاربر (۱۰/دقیقه) و IP (۳۰/دقیقه). زیر قفل ردیف جلسه: ended ⇒ SESSION_LOCKED؛ عضو تأییدشده ⇒ همان عضویت
   * (بدون مصرف)؛ ظرفیت ⇒ SESSION_FULL؛ سپس مصرف اتمیک (منقضی/باطل ⇒ INVITE_EXPIRED، تمام ⇒ INVITE_EXHAUSTED) و approve.
   */
  async accept(userId: string, ip: string, code: string) {
    for (const [key, limit] of [[`m53:u:${userId}`, 10], [`m53:ip:${ip}`, 30]] as const) {
      const h = await this.limiter.hit('durable', key.slice(0, 120), limit, 60);
      if (!h.allowed) throw new AppError('RATE_LIMITED', { details: { retryAfterSec: h.resetSec } });
    }
    const hash = sha256(code);
    const found = (await this.ds.query('SELECT session_id FROM session_invites WHERE code_hash = ?', [hash])) as { session_id: Buffer }[];
    if (!found[0]) throw notFound();
    const sessionId = bufToUuid(found[0].session_id);
    let memberId = '';
    let changed = false;
    await this.ds.transaction(async (m) => {
      const session = await this.access.session(m, sessionId, true);
      if (!session) throw notFound();
      const inv = ((await m.query('SELECT id, max_uses, uses, expires_at, revoked_at FROM session_invites WHERE code_hash = ? FOR UPDATE', [hash])) as { id: Buffer; max_uses: number | null; uses: number; expires_at: Date; revoked_at: Date | null }[])[0];
      if (!inv) throw notFound();
      if (session.owner_id === userId) throw conflict('SESSION_MANAGER_PROTECTED', 'شما صاحب این جلسه هستید.');
      const ms = await this.access.membership(m, sessionId, userId);
      if (ms?.status === 'approved') {
        memberId = ms.memberId;
        return;
      }
      const now = this.clock.now();
      if (inv.revoked_at || inv.expires_at.getTime() <= now.getTime()) throw conflict('INVITE_EXPIRED', 'این دعوت منقضی یا باطل شده است.');
      if (inv.max_uses !== null && inv.uses >= inv.max_uses) throw conflict('INVITE_EXHAUSTED', 'ظرفیت استفاده از این دعوت تمام شده است.');
      if (session.status === 'ended') throw conflict('SESSION_LOCKED', 'این جلسه پایان یافته است.');
      if (session.capacity !== null && (await approvedCount(m, sessionId)) >= session.capacity) throw conflict('SESSION_FULL', 'ظرفیت این جلسه تکمیل است.');
      const u = (await m.query('UPDATE session_invites SET uses = uses + 1 WHERE id = ? AND revoked_at IS NULL AND expires_at > ? AND (max_uses IS NULL OR uses < max_uses)', [inv.id, now])) as { affectedRows?: number };
      if (!u.affectedRows) throw conflict('INVITE_EXHAUSTED', 'ظرفیت استفاده از این دعوت تمام شده است.');
      if (ms) {
        memberId = ms.memberId;
        await m.query("UPDATE session_members SET status = 'approved', decided_by = NULL, decided_at = ?, source = 'invite' WHERE id = ?", [now, uuidToBuf(memberId)]);
      } else {
        memberId = uuidv7(now.getTime());
        await m.query("INSERT INTO session_members (id, session_id, user_id, status, requested_at, decided_at, source) VALUES (?, ?, ?, 'approved', ?, ?, 'invite')", [uuidToBuf(memberId), uuidToBuf(sessionId), uuidToBuf(userId), now, now]);
      }
      changed = true;
    });
    if (changed) this.live.emit(sessionId, 'members.updated');
    return memberDto(await this.members.oneRow(this.ds, sessionId, memberId));
  }
}
