export type Role = 'OWNER' | 'MANAGER' | 'STAFF';
export type Permission =
  | 'claims.review' | 'purchases.register' | 'purchases.cancel' | 'participants.view' | 'stats.view'
  | 'audit.view' | 'export' | 'raffle.manage' | 'raffle.close' | 'raffle.winner' | 'admins.manage';

const STAFF: Permission[] = ['claims.review', 'purchases.register', 'participants.view', 'stats.view'];
const MANAGER: Permission[] = [...STAFF, 'purchases.cancel', 'audit.view', 'export'];
const OWNER: Permission[] = [...MANAGER, 'raffle.manage', 'raffle.close', 'raffle.winner', 'admins.manage'];
const MATRIX: Record<Role, ReadonlySet<Permission>> = { STAFF: new Set(STAFF), MANAGER: new Set(MANAGER), OWNER: new Set(OWNER) };

export const can = (role: Role | null | undefined, perm: Permission): boolean => !!role && MATRIX[role]?.has(perm) === true;
