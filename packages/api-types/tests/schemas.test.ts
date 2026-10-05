import { describe, expect, it } from 'vitest';
import { high, low, mid } from '../src';

const uuid = '6f3c2a10-0000-4000-8000-000000000001';

describe('low: ورودی‌ها', () => {
  it('OTP: شماره و کد', () => {
    expect(low.OtpRequestBody.safeParse({ phone: '09121234567' }).success).toBe(true);
    for (const phone of ['9121234567', '+989121234567', '0912123456', '091212345678', '۰۹۱۲۱۲۳۴۵۶۷', "0912123456'; DROP TABLE users;--", '']) expect(low.OtpRequestBody.safeParse({ phone }).success, phone).toBe(false);
    const v = { challengeId: uuid, deviceId: uuid, deviceLabel: 'Chrome · Windows' };
    expect(low.OtpVerifyBody.safeParse({ ...v, code: '12345' }).success).toBe(true);
    for (const code of ['1234', '123456', 'abcde', '12 45', '١٢٣٤٥']) expect(low.OtpVerifyBody.safeParse({ ...v, code }).success, code).toBe(false);
    expect(low.OtpVerifyBody.safeParse({ ...v, code: '12345', admin: true }).success).toBe(false);
  });
  it('رمز و پروفایل', () => {
    expect(low.SetPasswordBody.safeParse({ newPassword: '12345678' }).success).toBe(true);
    expect(low.SetPasswordBody.safeParse({ newPassword: '1234567' }).success).toBe(false);
    expect(low.SetPasswordBody.safeParse({ newPassword: 'x'.repeat(129) }).success).toBe(false);
    expect(low.ProfilePatchBody.safeParse({}).success).toBe(false);
    expect(low.ProfilePatchBody.safeParse({ firstName: 'سارا' }).success).toBe(true);
    expect(low.ProfilePatchBody.safeParse({ firstName: 'س' }).success).toBe(false);
    expect(low.ProfilePatchBody.safeParse({ firstName: 'سارا', role: 'admin' }).success).toBe(false);
  });
  it('مدل جلسهٔ عمومی: draft وجود ندارد', () => {
    const base = { id: uuid, title: 'عنوان جلسه', description: 'توضیحات کافی است.', schedule: { type: 'recurring', weekdays: [0, 5], timeOfDay: '18:00', durationMin: 60 }, nextStartsAt: null, location: { label: 'آنلاین' } };
    expect(low.PublicSession.safeParse({ ...base, status: 'scheduled' }).success).toBe(true);
    expect(low.PublicSession.safeParse({ ...base, status: 'draft' }).success).toBe(false);
    expect(low.PublicSession.safeParse({ ...base, status: 'started', schedule: { type: 'recurring', weekdays: [7], timeOfDay: '18:00', durationMin: 60 } }).success).toBe(false);
  });
});

describe('mid: ورودی‌ها', () => {
  it('ارزیابی: ۰..۱۰ صحیح، strict، یادداشت ≤ ۳۰۰', () => {
    const ok = { queueItemId: 'q-1', voice: 8, tone: 7, tajweed: 9 };
    expect(mid.EvaluationBody.safeParse(ok).success).toBe(true);
    for (const bad of [{ ...ok, voice: 11 }, { ...ok, tone: -1 }, { ...ok, tajweed: 2.5 }, { ...ok, note: 'x'.repeat(301) }, { ...ok, score: 100 }, { ...ok, queueItemId: '../../etc' }])
      expect(mid.EvaluationBody.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
  it('ورودی جلسه: پایان بعد از شروع و عناوین', () => {
    const s = { title: 'جلسه', description: 'توضیحات کافی برای جلسه.', location: { label: 'آنلاین' } };
    expect(mid.SessionInput.safeParse({ ...s, schedule: { type: 'once', startsAt: '2030-01-01T10:00:00+03:30', endsAt: '2030-01-01T11:00:00+03:30' } }).success).toBe(true);
    expect(mid.SessionInput.safeParse({ ...s, schedule: { type: 'once', startsAt: '2030-01-01T11:00:00+03:30', endsAt: '2030-01-01T10:00:00+03:30' } }).success).toBe(false);
    expect(mid.SessionInput.safeParse({ ...s, title: 'ab', schedule: { type: 'recurring', weekdays: [0], timeOfDay: '18:00', durationMin: 60 } }).success).toBe(false);
    expect(mid.SessionInput.safeParse({ ...s, schedule: { type: 'recurring', weekdays: [0], timeOfDay: '25:00', durationMin: 60 } }).success).toBe(false);
    expect(mid.SessionInput.safeParse({ ...s, schedule: { type: 'recurring', weekdays: [0], timeOfDay: '18:00', durationMin: 5 } }).success).toBe(false);
  });
  it('تعیین نقش: manager قابل تخصیص نیست', () => {
    expect(mid.SetRolesBody.safeParse({ roles: ['teacher'] }).success).toBe(true);
    expect(mid.SetRolesBody.safeParse({ roles: ['session_manager'] }).success).toBe(false);
  });
  it('حضور: امتیاز فقط ۰ یا ۵', () => {
    const entry = { userId: 'u1', name: 'سارا', enteredAt: '2026-10-01T12:00:00Z' };
    expect(mid.AttendanceResult.safeParse({ entry, pointsAwarded: 5, alreadyPresent: false }).success).toBe(true);
    expect(mid.AttendanceResult.safeParse({ entry, pointsAwarded: 0, alreadyPresent: true }).success).toBe(true);
    expect(mid.AttendanceResult.safeParse({ entry, pointsAwarded: 10, alreadyPresent: false }).success).toBe(false);
  });
});

describe('high: تنظیمات', () => {
  const ok = { version: 1, evalWeights: { voice: 40, tone: 30, tajweed: 30 }, badgeThresholds: [50, 150, 300, 500], flags: { maintenance_mode: false, registration_open: true } };
  it('پیش‌فرض‌ها معتبر', () => {
    expect(high.UpdateSettingsBody.safeParse(ok).success).toBe(true);
  });
  it('مجموع وزن‌ها = ۱۰۰ و آستانه صعودی', () => {
    expect(high.UpdateSettingsBody.safeParse({ ...ok, evalWeights: { voice: 50, tone: 30, tajweed: 30 } }).success).toBe(false);
    expect(high.UpdateSettingsBody.safeParse({ ...ok, evalWeights: { voice: 33.3, tone: 33.3, tajweed: 33.4 } }).success).toBe(false);
    expect(high.UpdateSettingsBody.safeParse({ ...ok, badgeThresholds: [50, 50, 300, 500] }).success).toBe(false);
    expect(high.UpdateSettingsBody.safeParse({ ...ok, badgeThresholds: [50, 150, 300] }).success).toBe(false);
  });
  it('پرچم ناشناخته و نقش سفارشی رد می‌شود', () => {
    expect(high.UpdateSettingsBody.safeParse({ ...ok, flags: { ...ok.flags, hack: true } }).success).toBe(false);
    // نقش/مجوز پویا: فقط قالب کلید اعتبارسنجی می‌شود (وجود در DB سمت سرور)
    expect(high.SetUserRolesBody.safeParse({ roles: ['Root!'] }).success).toBe(false);
    expect(high.SetUserRolesBody.safeParse({ roles: ['developer', 'content_editor'] }).success).toBe(true);
    expect(high.SetUserGrantsBody.safeParse({ grants: ['session.create'] }).success).toBe(true);
    expect(high.SetUserGrantsBody.safeParse({ grants: ['Bad Key'] }).success).toBe(false);
    expect(high.CreatePermissionBody.safeParse({ key: 'blog.post.publish', title: 'انتشار', moduleKey: 'blog' }).success).toBe(true);
    expect(high.CreatePermissionBody.safeParse({ key: 'blog', title: 'x', moduleKey: 'blog' }).success).toBe(false);
    expect(high.CreateRoleBody.safeParse({ key: 'editor', title: 'ویراستار', foo: 1 }).success).toBe(false);
  });
  it('نقش‌های سیستم حذف‌ناپذیرند', () => {
    const r = { key: 'developer', title: 't', description: 'd', undeletable: true, permissions: [], modules: [], effectivePermissions: [], lockedPermissions: [], stepUpRules: {}, holders: 1 };
    expect(high.SystemRole.safeParse(r).success).toBe(true);
    expect(high.SystemRole.safeParse({ ...r, key: 'X' }).success).toBe(false);
  });
});
