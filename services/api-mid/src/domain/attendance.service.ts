import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../common/app-error';
import { Clock } from '../common/clock';
import { bufToUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { LiveService } from '../live/live.service';
import { MembersAccess } from './access.service';
import { NAME_SQL, conflict, displayName, withRetry } from './db';
import { PointsService } from './points.service';
import { SettingsService } from './settings.service';
import { ATTENDANCE_POINTS } from './rules';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly access: MembersAccess,
    private readonly points: PointsService,
    private readonly settings: SettingsService,
    private readonly live: LiveService
  ) {}

  private nameOf = async (userId: string): Promise<string> => {
    const r = (await this.ds.query(`SELECT ${NAME_SQL} AS name FROM user_directory d WHERE d.user_id = ?`, [uuidToBuf(userId)])) as { name: string }[];
    return r[0]?.name || displayName();
  };

  /**
   * ثبت حضور؛ idempotent. «+۵ فقط یک‌بار» در دو لایه: UNIQUE(session,user) روی attendance و UNIQUE(reason,ref) روی ledger
   * ⇒ حتی ۱۰۰ درخواست موازی دقیقاً یک بار امتیاز می‌دهند.
   */
  async checkIn(userId: string, sessionId: string) {
    const now = this.clock.now();
    const { session, membership } = await this.access.load(this.ds, sessionId, userId);
    if (membership?.status !== 'approved') throw new AppError('AUTH_FORBIDDEN', { message: 'ابتدا باید عضو تأییدشدهٔ این جلسه باشید.' });
    if (session.status !== 'started') throw conflict('SESSION_LOCKED', 'ثبت حضور فقط وقتی جلسه شروع شده ممکن است.');

    const name = await this.nameOf(userId);
    const { thresholds } = await this.settings.get();
    let awarded = false;
    let enteredAt = now;
    await withRetry(() => this.ds.transaction(async (m) => {
      const id = uuidv7(now.getTime());
      const ins = (await m.query('INSERT IGNORE INTO attendance_entries (id, session_id, user_id, entered_at) VALUES (?, ?, ?, ?)', [uuidToBuf(id), uuidToBuf(sessionId), uuidToBuf(userId), now])) as { affectedRows?: number };
      if (ins.affectedRows) {
        awarded = await this.points.award(m, userId, ATTENDANCE_POINTS, 'attendance', id, thresholds);
      } else {
        const e = (await m.query('SELECT entered_at FROM attendance_entries WHERE session_id = ? AND user_id = ?', [uuidToBuf(sessionId), uuidToBuf(userId)])) as { entered_at: Date }[];
        enteredAt = e[0]!.entered_at;
      }
    }));
    if (awarded) this.live.emit(sessionId, 'attendance.updated');
    return { entry: { userId, name, enteredAt: enteredAt.toISOString() }, pointsAwarded: awarded ? (5 as const) : (0 as const), alreadyPresent: !awarded };
  }

  async list(userId: string, sessionId: string) {
    await this.access.load(this.ds, sessionId, userId, 'attendance.view');
    const rows = (await this.ds.query(`SELECT a.user_id, a.entered_at, ${NAME_SQL} AS name FROM attendance_entries a LEFT JOIN user_directory d ON d.user_id = a.user_id WHERE a.session_id = ? ORDER BY a.entered_at ASC, a.id ASC LIMIT 1000`, [uuidToBuf(sessionId)])) as { user_id: Buffer; entered_at: Date; name: string }[];
    return { items: rows.map((r) => ({ userId: bufToUuid(r.user_id), name: r.name || displayName(), enteredAt: r.entered_at.toISOString() })), total: rows.length };
  }
}
