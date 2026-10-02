import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock } from '../common/clock';
import { bufToUuid, uuidToBuf, uuidv7 } from '../common/ids';
import { type Q } from './db';
import { emitInbox } from './outbox.writer';
import { SettingsService } from './settings.service';

const BADGE_KEYS = ['badge_50', 'badge_150', 'badge_300', 'badge_500'] as const;

@Injectable()
export class PointsService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly settings: SettingsService
  ) {}

  /**
   * ثبت امتیاز idempotent: یکتایی (reason, ref_id) در DB ⇒ هر رخداد فقط یک‌بار امتیاز می‌دهد (حتی با درخواست موازی).
   * همان تراکنش: total را زیاد و نشان‌های رسیده را اعطا می‌کند (نشان با افت امتیاز revoke نمی‌شود؛ امتیاز هرگز کم نمی‌شود).
   * آستانه‌ها از بیرون تراکنش داده می‌شود (خواندن تنظیمات داخل تراکنش یک اتصال دوم از pool می‌گیرد ⇒ قحطی pool زیر بار).
   * @returns true اگر امتیاز تازه ثبت شد
   */
  async award(m: Q, userId: string, points: number, reason: 'attendance' | 'evaluation', refId: string, thresholds: readonly number[]): Promise<boolean> {
    const now = this.clock.now();
    const ins = (await m.query('INSERT IGNORE INTO point_ledger (id, user_id, points, reason, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?)', [uuidToBuf(uuidv7(now.getTime())), uuidToBuf(userId), points, reason, uuidToBuf(refId), now])) as { affectedRows?: number };
    if (!ins.affectedRows) return false;
    if (points <= 0) return true;

    await m.query('INSERT INTO user_points (user_id, total, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE total = total + VALUES(total), updated_at = VALUES(updated_at)', [uuidToBuf(userId), points, now]);
    const [{ total }] = (await m.query('SELECT total FROM user_points WHERE user_id = ?', [uuidToBuf(userId)])) as { total: number }[];
    for (let i = 0; i < BADGE_KEYS.length; i++) {
      const t = thresholds[i]!;
      if (total < t) continue;
      const b = (await m.query('INSERT IGNORE INTO badge_awards (id, user_id, badge_key, threshold, awarded_at) VALUES (?, ?, ?, ?, ?)', [uuidToBuf(uuidv7(now.getTime())), uuidToBuf(userId), BADGE_KEYS[i], t, now])) as { affectedRows?: number };
      if (b.affectedRows) await emitInbox(m, now, userId, 'system', 'نشان جدید', `به ${t} امتیاز رسیدید و نشان دریافت کردید.`, 'points');
    }
    return true;
  }

  async summary(userId: string) {
    const [pts, badges, cfg] = await Promise.all([
      this.ds.query('SELECT total FROM user_points WHERE user_id = ?', [uuidToBuf(userId)]) as Promise<{ total: number }[]>,
      this.ds.query('SELECT badge_key, awarded_at FROM badge_awards WHERE user_id = ?', [uuidToBuf(userId)]) as Promise<{ badge_key: string; awarded_at: Date }[]>,
      this.settings.get()
    ]);
    const got = new Map(badges.map((b) => [b.badge_key, b.awarded_at]));
    return {
      total: pts[0]?.total ?? 0,
      badges: BADGE_KEYS.map((key, i) => ({ key, threshold: cfg.thresholds[i]!, awardedAt: got.get(key)?.toISOString() ?? null }))
    };
  }
}

export { bufToUuid };
