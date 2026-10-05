/**
 * Permission & Authorization Utilities
 */

export const SYSTEM_ROLE_DEVELOPER = 'developer';
export const SYSTEM_ROLE_SUPER_ADMIN = 'super_admin';

export interface UserAuthContext {
  roles: string[];
  permissions: string[];
  stepUpExempt: boolean;
  stepUp: Record<string, 'required' | 'none'>;
}

/**
 * Checks if actor holds the developer role
 */
export function isDeveloper(roles: string[] = []): boolean {
  return roles.includes(SYSTEM_ROLE_DEVELOPER);
}

/**
 * Checks if actor holds the specified permission
 * Note: Developers have full access to everything except explicit contract exceptions
 */
export function hasPermission(actor: UserAuthContext | null | undefined, permission: string): boolean {
  if (!actor) return false;
  if (isDeveloper(actor.roles)) return true;
  return actor.permissions.includes(permission);
}

/**
 * Checks if step-up authentication (fresh OTP) is required for a given action
 */
export function isStepUpNeeded(actor: UserAuthContext | null | undefined, permission: string): boolean {
  if (!actor) return false;
  // Developers are exempt from step-up for all actions EXCEPT changing own password (H-04)
  if (actor.stepUpExempt) return false;
  return actor.stepUp?.[permission] === 'required';
}

/**
 * Validates dynamic role key format: ^[a-z][a-z0-9_]{2,31}$
 */
export function isValidRoleKey(key: string): boolean {
  return /^[a-z][a-z0-9_]{2,31}$/.test(key);
}

/**
 * Validates dynamic permission key format: module.action (2 to 4 dot-separated lowercase segments)
 * Prefix 'system.' is reserved and prohibited for custom permissions.
 */
export function isValidCustomPermissionKey(key: string): { valid: boolean; error?: string } {
  if (key.startsWith('system.')) {
    return { valid: false, error: 'پیشوند "system." سیستمی بوده و امکان ساخت آن وجود ندارد' };
  }
  const parts = key.split('.');
  if (parts.length < 2 || parts.length > 4) {
    return { valid: false, error: 'کلید مجوز باید شامل ۲ تا ۴ بخش جدا شده با نقطه باشد (مثال: users.export)' };
  }
  const segmentRegex = /^[a-z][a-z0-9_]*$/;
  for (const part of parts) {
    if (!segmentRegex.test(part)) {
      return { valid: false, error: 'هر بخش باید با حرف کوچک انگلیسی شروع شده و فقط شامل حروف، اعداد و خط تیره زیرین باشد' };
    }
  }
  return { valid: true };
}
