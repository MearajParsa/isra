import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { z } from 'zod';
import type { high } from '@isra/api-types';
import { AppError } from '../../common/app-error';
import { Clock } from '../../common/clock';
import { bufToUuid, isUuid, uuidToBuf, uuidv7 } from '../../common/ids';
import { isDupKey, keyTaken } from '../access/write-helpers';
import { AuditService } from '../audit.service';
import { type Q, conflict, withRetry } from '../db';
import { emit } from '../outbox.writer';

type Criterion = z.infer<typeof high.EvaluationCriterion>;
type CreateBody = z.infer<typeof high.CreateCriterionBody>;
type UpdateBody = z.infer<typeof high.UpdateCriterionBody>;

/** docs-v2/31 §۳: حداکثر ۱۵ معیار؛ حداقل یک معیار فعال */
export const MAX_CRITERIA = 15;

interface Row {
  id: Buffer;
  criterion_key: string;
  title: string;
  description: string;
  weight: number;
  max_score: number;
  active: number;
  sort_order: number;
  used: number;
  created_at: Date;
  updated_at: Date;
}

const COLS = 'id, criterion_key, title, description, weight, max_score, active, sort_order, used, created_at, updated_at';
const ORDER = 'ORDER BY sort_order, created_at, id';

const dto = (r: Row): Criterion => ({
  id: bufToUuid(r.id),
  key: r.criterion_key,
  title: r.title,
  description: r.description,
  weight: Number(r.weight),
  maxScore: Number(r.max_score),
  active: !!r.active,
  sortOrder: Number(r.sort_order),
  used: !!r.used,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString()
});

async function readAll(q: Q): Promise<Row[]> {
  return (await q.query(`SELECT ${COLS} FROM evaluation_criteria ${ORDER}`)) as Row[];
}

/**
 * انتشار کاتالوگ کامل معیارها به mid (`evaluation.criteria.changed`؛ نسخه +۱) در همان تراکنش (بدون DI؛ migration هم استفاده می‌کند).
 * high نمی‌داند mid کدام معیار را در ارزیابی استفاده کرده (قرارداد مسیری برای آن ندارد) ⇒ هر معیاری که **فعال** منتشر شود
 * از این لحظه «استفاده‌شده» (`used`) است و فقط غیرفعال می‌شود (CRITERION_IN_USE)؛ تخمین محافظه‌کارانه که snapshot ارزیابی‌ها را حفظ می‌کند.
 */
export async function publishCriteria(q: Q, now: Date): Promise<number> {
  await q.query('UPDATE evaluation_criteria SET used = 1 WHERE active = 1 AND used = 0');
  await q.query('UPDATE criteria_meta SET version = version + 1 WHERE id = 1');
  const v = (await q.query('SELECT version FROM criteria_meta WHERE id = 1')) as { version: string | number }[];
  const version = Number(v[0]?.version ?? 1);
  const rows = await readAll(q);
  await emit(q, now, 'evaluation.criteria.changed', {
    version,
    criteria: rows.map((r) => ({ id: bufToUuid(r.id), key: r.criterion_key, title: r.title, description: r.description, weight: Number(r.weight), maxScore: Number(r.max_score), active: !!r.active, sortOrder: Number(r.sort_order) }))
  });
  return version;
}

/**
 * معیارهای ارزیابی پویا (H-100..H-103؛ docs-v2/31 §۳، قفل #15). high منبع حقیقت؛ mid کش با `evaluation.criteria.changed`.
 * همهٔ نوشتن‌ها پشت قفل ردیف `criteria_meta` (سقف ۱۵، آخرین فعال و نسخه بدون TOCTOU)؛ audit و رویداد در همان تراکنش.
 */
@Injectable()
export class CriteriaService {
  constructor(
    private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly audit: AuditService
  ) {}

  async list(): Promise<{ version: number; items: Criterion[] }> {
    const [v, rows] = await Promise.all([this.ds.query('SELECT version FROM criteria_meta WHERE id = 1') as Promise<{ version: string | number }[]>, readAll(this.ds)]);
    return { version: Math.max(1, Number(v[0]?.version ?? 1)), items: rows.map(dto) };
  }

  private write<T>(fn: (m: Q) => Promise<T>): Promise<T> {
    return withRetry(() =>
      this.ds.transaction(async (m) => {
        await m.query('SELECT version FROM criteria_meta WHERE id = 1 FOR UPDATE');
        return fn(m);
      })
    );
  }

  private async lockOne(m: Q, id: string): Promise<Row> {
    const r = isUuid(id) ? ((await m.query(`SELECT ${COLS} FROM evaluation_criteria WHERE id = ? FOR UPDATE`, [uuidToBuf(id)])) as Row[]) : [];
    if (!r[0]) throw new AppError('NOT_FOUND', { message: 'معیار ارزیابی پیدا نشد.' });
    return r[0];
  }

  private async otherActive(m: Q, id: Buffer): Promise<number> {
    const r = (await m.query('SELECT COUNT(*) AS n FROM evaluation_criteria WHERE active = 1 AND id <> ?', [id])) as { n: string | number }[];
    return Number(r[0]?.n ?? 0);
  }

  private async log(m: Q, actorId: string, action: string, c: { id: string; title: string }, summary: string, meta: Record<string, unknown>) {
    await this.audit.write(m, { actor: await this.audit.actorOf(actorId, m), action, target: { type: 'criterion', id: c.id, label: c.title }, summary, meta });
  }

  // ───────── H-101 ─────────
  async create(actorId: string, body: CreateBody): Promise<Criterion> {
    const id = uuidv7(this.clock.now().getTime());
    await this.write(async (m) => {
      const n = (await m.query('SELECT COUNT(*) AS n FROM evaluation_criteria')) as { n: string | number }[];
      if (Number(n[0]?.n ?? 0) >= MAX_CRITERIA) throw conflict('LIMIT_REACHED', `حداکثر ${MAX_CRITERIA} معیار ارزیابی مجاز است.`, { limit: MAX_CRITERIA });
      const now = this.clock.now();
      try {
        await m.query('INSERT INTO evaluation_criteria (id, criterion_key, title, description, weight, max_score, active, sort_order, used, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)', [
          uuidToBuf(id),
          body.key,
          body.title,
          body.description,
          body.weight,
          body.maxScore,
          body.active ? 1 : 0,
          body.sortOrder,
          now,
          now
        ]);
      } catch (e) {
        if (isDupKey(e)) throw keyTaken('معیار');
        throw e;
      }
      const version = await publishCriteria(m, now);
      await this.log(m, actorId, 'criterion.create', { id, title: body.title }, `معیار ارزیابی «${body.title}» ساخته شد.`, { key: body.key, weight: body.weight, maxScore: body.maxScore, active: body.active, version });
    });
    return this.get(id);
  }

  async get(id: string): Promise<Criterion> {
    const r = isUuid(id) ? ((await this.ds.query(`SELECT ${COLS} FROM evaluation_criteria WHERE id = ?`, [uuidToBuf(id)])) as Row[]) : [];
    if (!r[0]) throw new AppError('NOT_FOUND', { message: 'معیار ارزیابی پیدا نشد.' });
    return dto(r[0]);
  }

  // ───────── H-102 ─────────
  /** کلید ثابت است (snapshot ارزیابی‌ها)؛ غیرفعال‌کردن آخرین معیار فعال ⇒ LAST_ACTIVE_CRITERION؛ بدون تغییر ⇒ بدون رویداد */
  async update(actorId: string, id: string, body: UpdateBody): Promise<Criterion> {
    await this.write(async (m) => {
      const cur = await this.lockOne(m, id);
      const next = {
        title: body.title ?? cur.title,
        description: body.description ?? cur.description,
        weight: body.weight ?? Number(cur.weight),
        max_score: body.maxScore ?? Number(cur.max_score),
        active: body.active === undefined ? !!cur.active : body.active,
        sort_order: body.sortOrder ?? Number(cur.sort_order)
      };
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const was = { title: cur.title, description: cur.description, weight: Number(cur.weight), max_score: Number(cur.max_score), active: !!cur.active, sort_order: Number(cur.sort_order) };
      for (const k of Object.keys(next) as (keyof typeof next)[]) if (next[k] !== was[k]) changes[k] = { from: k === 'description' ? 'changed' : was[k], to: k === 'description' ? 'changed' : next[k] };
      if (!Object.keys(changes).length) return;
      if (was.active && !next.active && (await this.otherActive(m, cur.id)) === 0) throw conflict('LAST_ACTIVE_CRITERION', 'دست‌کم یک معیار ارزیابی باید فعال بماند.');
      const now = this.clock.now();
      await m.query('UPDATE evaluation_criteria SET title = ?, description = ?, weight = ?, max_score = ?, active = ?, sort_order = ?, updated_at = ? WHERE id = ?', [
        next.title,
        next.description,
        next.weight,
        next.max_score,
        next.active ? 1 : 0,
        next.sort_order,
        now,
        cur.id
      ]);
      const version = await publishCriteria(m, now);
      await this.log(m, actorId, 'criterion.update', { id: bufToUuid(cur.id), title: next.title }, `معیار ارزیابی «${next.title}» ویرایش شد.`, { key: cur.criterion_key, changes, version });
    });
    return this.get(id);
  }

  // ───────── H-103 ─────────
  /** آخرین معیار فعال ⇒ LAST_ACTIVE_CRITERION؛ استفاده‌شده ⇒ CRITERION_IN_USE (با H-102 غیرفعال کنید)؛ پاسخ = وضعیت پیش از حذف */
  async remove(actorId: string, id: string): Promise<Criterion> {
    let before: Criterion | undefined;
    await this.write(async (m) => {
      const cur = await this.lockOne(m, id);
      before = dto(cur);
      if (cur.active && (await this.otherActive(m, cur.id)) === 0) throw conflict('LAST_ACTIVE_CRITERION', 'دست‌کم یک معیار ارزیابی باید فعال بماند.');
      if (cur.used) throw conflict('CRITERION_IN_USE', 'این معیار در ارزیابی‌ها استفاده شده است؛ به‌جای حذف آن را غیرفعال کنید.');
      await m.query('DELETE FROM evaluation_criteria WHERE id = ?', [cur.id]);
      const now = this.clock.now();
      const version = await publishCriteria(m, now);
      await this.log(m, actorId, 'criterion.delete', { id: before.id, title: cur.title }, `معیار ارزیابی «${cur.title}» حذف شد.`, { key: cur.criterion_key, version });
    });
    return before!;
  }
}
