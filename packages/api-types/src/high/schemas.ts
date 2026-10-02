import { z } from 'zod';
import { Id, IranMobile, IsoDateTime, named } from '../core/primitives';
import { Uuid } from '../core/primitives';

export const SystemRoleKey = named('SystemRoleKey', z.enum(['developer', 'super_admin']));
export const PermissionKey = named(
  'PermissionKey',
  z.enum(['system.users.view', 'system.role.assign', 'system.permission.edit', 'system.settings.view', 'system.settings.edit', 'system.audit.view', 'session.create'])
);
export const Grant = named('Grant', z.enum(['session.create']), 'مجوز مستقیم per user (D1)');

export const PermissionInfo = named('PermissionInfo', z.object({ key: PermissionKey, title: z.string().max(120), group: z.enum(['system', 'session']) }));

export const SystemRole = named(
  'SystemRole',
  z.object({
    key: SystemRoleKey,
    title: z.string().max(60),
    description: z.string().max(300),
    undeletable: z.literal(true).meta({ description: 'نقش‌های سیستم حذف نمی‌شوند (قفل #28)' }),
    permissions: z.array(PermissionKey),
    lockedPermissions: z.array(PermissionKey),
    holders: z.number().int().min(0)
  })
);
export const SetRolePermissionsBody = named('SetRolePermissionsBody', z.object({ permissions: z.array(PermissionKey).max(20) }).strict());

export const SystemMe = named(
  'SystemMe',
  z.object({
    user: z.object({ id: Id, name: z.string().max(80), phone: IranMobile }),
    roles: z.array(SystemRoleKey),
    permissions: z.array(PermissionKey)
  })
);

export const SystemUser = named(
  'SystemUser',
  z.object({ id: Id, name: z.string().max(80), phone: IranMobile, roles: z.array(SystemRoleKey), grants: z.array(Grant), createdAt: IsoDateTime })
);
export const UsersQuery = z.object({
  q: z.string().trim().max(60).optional().meta({ description: 'جست‌وجو روی نام یا شماره (حداکثر ۶۰ نویسه)' }),
  role: z.union([SystemRoleKey, z.literal('none')]).optional()
});
export const SetUserRolesBody = named('SetUserRolesBody', z.object({ roles: z.array(SystemRoleKey).max(2) }).strict());
export const SetUserGrantsBody = named('SetUserGrantsBody', z.object({ grants: z.array(Grant).max(1) }).strict());

export const EvalWeights = named(
  'SystemEvalWeights',
  z
    .object({ voice: z.number().int().min(0).max(100), tone: z.number().int().min(0).max(100), tajweed: z.number().int().min(0).max(100) })
    .strict()
    .refine((w) => w.voice + w.tone + w.tajweed === 100, { message: 'مجموع وزن‌ها باید دقیقاً ۱۰۰ باشد.' })
);
const Thresholds = z
  .tuple([z.number().int().positive(), z.number().int().positive(), z.number().int().positive(), z.number().int().positive()])
  .refine((t) => t.every((x, i) => i === 0 || x > (t[i - 1] ?? 0)), { message: 'آستانه‌ها باید اکیداً صعودی باشند.' })
  .meta({ description: 'نشان‌های ۵۰/۱۵۰/۳۰۰/۵۰۰ (پیش‌فرض)؛ افت امتیاز نشان را باطل نمی‌کند' });
export const Flags = z.object({ maintenance_mode: z.boolean(), registration_open: z.boolean() }).strict();

export const SystemSettings = named(
  'SystemSettings',
  z.object({
    version: z.number().int().min(1).meta({ description: 'نسخهٔ خوش‌بینانه (optimistic concurrency)' }),
    evalWeights: EvalWeights,
    badgeThresholds: Thresholds,
    flags: Flags,
    updatedAt: IsoDateTime,
    updatedBy: z.string().max(80)
  })
);
export const UpdateSettingsBody = named(
  'UpdateSettingsBody',
  z.object({ version: z.number().int().min(1), evalWeights: EvalWeights, badgeThresholds: Thresholds, flags: Flags }).strict()
);

export const AuditEntry = named(
  'AuditEntry',
  z.object({
    id: Id,
    at: IsoDateTime,
    actor: z.object({ id: Id, name: z.string().max(80) }),
    action: z.string().regex(/^[a-z_]+(\.[a-z_]+)+$/).max(64),
    target: z.object({ type: z.enum(['user', 'role', 'settings']), id: Id, label: z.string().max(120) }).optional(),
    summary: z.string().max(300),
    meta: z.record(z.string(), z.unknown()).meta({ description: 'جزئیات فنی بدون PII حساس (OTP/توکن/رمز هرگز)' })
  })
);
export const AuditQuery = z.object({
  action: z.string().max(64).optional(),
  q: z.string().trim().max(60).optional()
});

export const Overview = named(
  'Overview',
  z.object({
    users: z.object({ total: z.number().int().min(0), admins: z.number().int().min(0) }),
    sessions: z.object({ draft: z.number().int().min(0), scheduled: z.number().int().min(0), started: z.number().int().min(0), ended: z.number().int().min(0) }),
    lastAudit: z.array(AuditEntry).max(5)
  })
);
export { Uuid };
