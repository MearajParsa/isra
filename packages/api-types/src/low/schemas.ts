import { z } from 'zod';
import { PointsSummary } from '../domain/points';
export { PointsSummary } from '../domain/points';
import { DeviceId, DeviceLabel, Id, IranMobile, IsoDateTime, OtpCode, PersonName, Uuid, named } from '../core/primitives';

export const OtpRequestBody = named('OtpRequestBody', z.object({ phone: IranMobile }).strict());
export const OtpChallenge = named(
  'OtpChallenge',
  z.object({
    challengeId: Uuid,
    expiresInSec: z.number().int().positive().max(600).meta({ description: 'TTL کد (قفل: ۱۲۰ ثانیه)' }),
    resendAfterSec: z.number().int().min(0).max(600)
  })
);
export const OtpVerifyBody = named(
  'OtpVerifyBody',
  z.object({ challengeId: Uuid, code: OtpCode, deviceId: DeviceId, deviceLabel: DeviceLabel }).strict()
);
export const PasswordLoginBody = named(
  'PasswordLoginBody',
  z.object({ phone: IranMobile, password: z.string().min(1).max(128), deviceId: DeviceId, deviceLabel: DeviceLabel }).strict()
);

export const AuthUser = named(
  'AuthUser',
  z.object({ id: Id, phone: IranMobile, isNewUser: z.boolean(), profileComplete: z.boolean(), hasPassword: z.boolean() })
);
export const AuthResult = named(
  'AuthResult',
  z.object({
    accessToken: z.string().min(16).max(4096).meta({ description: 'JWT RS256؛ ۱۵ دقیقه. برای کلاینت opaque است.' }),
    tokenType: z.literal('Bearer'),
    accessExpiresIn: z.number().int().positive().meta({ description: 'ثانیه (۹۰۰)' }),
    refreshToken: z
      .string()
      .min(16)
      .max(512)
      .optional()
      .meta({ description: 'فقط برای کلاینت‌های غیر وب. وب refresh را در cookie HttpOnly می‌گیرد و این فیلد را نمی‌بیند.' }),
    sessionId: Uuid,
    user: AuthUser
  })
);

export const RefreshBody = named(
  'RefreshBody',
  z.object({ refreshToken: z.string().min(16).max(512).optional() }).strict().meta({ description: 'وب: بدنهٔ خالی؛ refresh از cookie' })
);
export const RefreshResult = named(
  'RefreshResult',
  z.object({
    accessToken: z.string().min(16).max(4096),
    tokenType: z.literal('Bearer'),
    accessExpiresIn: z.number().int().positive(),
    refreshToken: z.string().min(16).max(512).optional()
  })
);

export const StepUpVerifyBody = named('StepUpVerifyBody', z.object({ challengeId: Uuid, code: OtpCode }).strict());
export const StepUpResult = named(
  'StepUpResult',
  z.object({ stepUpToken: z.string().min(16).max(512), expiresInSec: z.number().int().positive().max(900).meta({ description: '۳۰۰ ثانیه' }) })
);

export const Profile = named(
  'Profile',
  z.object({ firstName: z.string().max(40), lastName: z.string().max(40), avatarUrl: z.url().nullable() })
);
export const ProfilePatchBody = named(
  'ProfilePatchBody',
  z
    .object({ firstName: PersonName.optional(), lastName: PersonName.optional() })
    .strict()
    .refine((v) => Object.keys(v).length > 0, { message: 'دست‌کم یک فیلد لازم است.' })
);
export const Me = named('Me', z.object({ id: Id, phone: IranMobile, hasPassword: z.boolean(), profile: Profile }));
export const SetPasswordBody = named(
  'SetPasswordBody',
  z.object({ newPassword: z.string().min(8).max(128).meta({ description: 'حداقل ۸ نویسه' }) }).strict()
);

export const DeviceSession = named(
  'DeviceSession',
  z.object({
    id: Id,
    deviceLabel: z.string().max(80),
    platform: z.enum(['web', 'android']),
    createdAt: IsoDateTime,
    lastActiveAt: IsoDateTime,
    current: z.boolean()
  })
);

export const InboxKind = z.enum(['membership', 'turn', 'evaluation', 'system']);
export const InboxItem = named(
  'InboxItem',
  z.object({
    id: Id,
    kind: InboxKind,
    title: z.string().min(1).max(120),
    body: z.string().max(500),
    createdAt: IsoDateTime,
    readAt: IsoDateTime.nullable(),
    ref: z.string().max(200).nullable().meta({ description: 'ارجاع opaque برای deep-link' })
  })
);
export const UnreadCount = named('UnreadCount', z.object({ count: z.number().int().min(0) }));

export const Jwks = named(
  'Jwks',
  z.object({
    keys: z.array(
      z.object({
        kty: z.literal('RSA'),
        kid: z.string().min(1).max(64),
        use: z.literal('sig'),
        alg: z.literal('RS256'),
        n: z.string().min(100),
        e: z.string().min(1)
      })
    ).min(1)
  }),
  'کلیدهای عمومی RS256؛ mid/high با cache و refresh روی kid ناشناخته اعتبارسنجی می‌کنند'
);
