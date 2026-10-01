import type { AuditEntry, Grant, PermissionKey, SystemRoleKey, SystemSettings } from '../high-types';
import { DEFAULT_ROLE_PERMS, DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS } from './highRules';

const KEY = 'isra.admin.mock.v1';

export interface AUser {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  password: string | null;
  createdAt: string;
  roles: SystemRoleKey[];
  grants: Grant[];
}
export interface ASession {
  id: string;
  userId: string;
  deviceLabel: string;
  createdAt: string;
}
export interface DState {
  users: AUser[];
  sessions: ASession[];
  /** شبیه‌سازی cookie HttpOnly refresh */
  cookieSessionId: string | null;
  rolePerms: Record<SystemRoleKey, PermissionKey[]>;
  settings: SystemSettings;
  audit: AuditEntry[];
  sessionCounts: { draft: number; scheduled: number; started: number; ended: number };
  seq: number;
}

export const SUPER = '22222222-2222-4222-8222-222222222222';
export const DEV = '33333333-3333-4333-8333-333333333333';
const PLAIN = '44444444-4444-4444-8444-444444444444';

const FIRST = ['علی', 'زهرا', 'محمد', 'فاطمه', 'حسین', 'مریم', 'رضا', 'نرگس', 'امیر', 'سمیه', 'مهدی', 'الهام', 'یاسین', 'هانیه', 'کاوه'];
const LAST = ['احمدی', 'کریمی', 'نوری', 'صادقی', 'حسینی', 'رحیمی', 'موسوی', 'جعفری', 'اکبری', 'کاظمی', 'مرادی', 'عباسی'];

function seed(): DState {
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const day = 86_400_000;
  const users: AUser[] = [
    { id: SUPER, phone: '09121234567', firstName: 'سارا', lastName: 'محمدی', password: 'isra1234', createdAt: iso(120 * day), roles: ['super_admin'], grants: ['session.create'] },
    { id: DEV, phone: '09123333333', firstName: 'رضا', lastName: 'احمدی', password: 'isra1234', createdAt: iso(200 * day), roles: ['developer'], grants: ['session.create'] },
    { id: PLAIN, phone: '09125555555', firstName: 'نیلوفر', lastName: 'کریمی', password: 'isra1234', createdAt: iso(60 * day), roles: [], grants: ['session.create'] }
  ];
  for (let i = 0; i < 37; i++) {
    users.push({
      id: `5555${String(i).padStart(4, '0')}-0000-4000-8000-000000000000`,
      phone: `0935${String(1000000 + i * 7919).slice(0, 7)}`,
      firstName: FIRST[i % FIRST.length],
      lastName: LAST[(i * 5) % LAST.length],
      password: null,
      createdAt: iso((i + 1) * 3 * day),
      roles: i === 3 ? ['super_admin'] : [],
      grants: i % 6 === 0 ? ['session.create'] : []
    });
  }
  const audit: AuditEntry[] = [];
  const actions: [string, string, AuditEntry['target'] | undefined][] = [
    ['system.role.assigned', 'نقش «مدیر کل» به کاربر اختصاص یافت', { type: 'user', id: users[6].id, label: `${users[6].firstName} ${users[6].lastName}` }],
    ['system.grant.added', 'مجوز «ساخت جلسه» به کاربر داده شد', { type: 'user', id: users[12].id, label: `${users[12].firstName} ${users[12].lastName}` }],
    ['system.settings.changed', 'آستانهٔ نشان‌ها به‌روز شد', { type: 'settings', id: 'settings', label: 'تنظیمات سراسری' }],
    ['system.permission.changed', 'ماتریس مجوز نقش «مدیر کل» تغییر کرد', { type: 'role', id: 'super_admin', label: 'مدیر کل' }],
    ['system.grant.removed', 'مجوز «ساخت جلسه» از کاربر گرفته شد', { type: 'user', id: users[18].id, label: `${users[18].firstName} ${users[18].lastName}` }],
    ['system.role.removed', 'نقش «مدیر کل» از کاربر برداشته شد', { type: 'user', id: users[24].id, label: `${users[24].firstName} ${users[24].lastName}` }]
  ];
  for (let i = 0; i < 24; i++) {
    const [action, summary, target] = actions[i % actions.length];
    const actor = i % 3 === 0 ? users[1] : users[0];
    audit.push({
      id: `a-${i + 1}`,
      at: iso((i + 1) * 5 * 3_600_000),
      actor: { id: actor.id, name: `${actor.firstName} ${actor.lastName}` },
      action,
      target,
      summary,
      meta: { requestId: `req-${1000 + i}` }
    });
  }
  return {
    users,
    sessions: [],
    cookieSessionId: null,
    rolePerms: structuredClone(DEFAULT_ROLE_PERMS),
    settings: {
      version: 1,
      evalWeights: { ...DEFAULT_WEIGHTS },
      badgeThresholds: [...DEFAULT_THRESHOLDS],
      flags: { maintenance_mode: false, registration_open: true },
      updatedAt: iso(9 * day),
      updatedBy: 'رضا احمدی'
    },
    audit,
    sessionCounts: { draft: 3, scheduled: 12, started: 2, ended: 41 },
    seq: 100
  };
}

let state: DState | null = null;

export function load(): DState {
  if (state) return state;
  let loaded: DState | null = null;
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) loaded = JSON.parse(raw) as DState;
    } catch {
      loaded = null;
    }
  }
  state = loaded ?? seed();
  return state;
}

export function save() {
  if (typeof localStorage === 'undefined' || !state) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export const fullName = (u: Pick<AUser, 'firstName' | 'lastName' | 'phone'>) =>
  `${u.firstName} ${u.lastName}`.trim() || u.phone;
