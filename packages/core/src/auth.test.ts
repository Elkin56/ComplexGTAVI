import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { validateInitData, AuthError, safeEqual } from './auth';
import { can } from './rbac';

const TOKEN = '123456:TEST-bot-token';
const now = new Date('2026-11-10T12:00:00Z');
const sign = (fields: Record<string, string>, token = TOKEN) => {
  const dcs = Object.entries(fields).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const hash = createHmac('sha256', createHmac('sha256', 'WebAppData').update(token).digest()).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
};
const user = JSON.stringify({ id: 482913057, first_name: 'Алексей', username: 'alexey_k' });
const fresh = () => ({ auth_date: String(Math.floor(now.getTime() / 1000) - 60), query_id: 'AAH', user });

describe('validateInitData', () => {
  it('принимает корректно подписанные данные', () => {
    const r = validateInitData(sign(fresh()), TOKEN, { now });
    expect(r.user).toMatchObject({ id: 482913057, first_name: 'Алексей' });
  });
  it('отклоняет подмену данных (смена user.id при той же подписи)', () => {
    const q = new URLSearchParams(sign(fresh()));
    q.set('user', JSON.stringify({ id: 1, first_name: 'Admin' }));
    expect(() => validateInitData(q.toString(), TOKEN, { now })).toThrow(AuthError);
  });
  it('отклоняет подпись другого бота', () => {
    expect(() => validateInitData(sign(fresh(), 'other:token'), TOKEN, { now })).toThrow(AuthError);
  });
  it('отклоняет данные без hash и мусор', () => {
    expect(() => validateInitData('user=1', TOKEN, { now })).toThrow(AuthError);
    expect(() => validateInitData('', TOKEN, { now })).toThrow(AuthError);
    expect(() => validateInitData('hash=zz', TOKEN, { now })).toThrow(AuthError);
  });
  it('отклоняет устаревшие и «будущие» данные', () => {
    const old = { ...fresh(), auth_date: String(Math.floor(now.getTime() / 1000) - 90000) };
    expect(() => validateInitData(sign(old), TOKEN, { now })).toThrow(/устарела/);
    const fut = { ...fresh(), auth_date: String(Math.floor(now.getTime() / 1000) + 3600) };
    expect(() => validateInitData(sign(fut), TOKEN, { now })).toThrow(AuthError);
  });
  it('отклоняет некорректного пользователя', () => {
    const bad = { ...fresh(), user: JSON.stringify({ id: -5, first_name: 'x' }) };
    expect(() => validateInitData(sign(bad), TOKEN, { now })).toThrow(AuthError);
  });
  it('safeEqual', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('RBAC', () => {
  it('роли и права', () => {
    expect(can('STAFF', 'claims.review')).toBe(true);
    expect(can('STAFF', 'purchases.cancel')).toBe(false);
    expect(can('STAFF', 'export')).toBe(false);
    expect(can('MANAGER', 'export')).toBe(true);
    expect(can('MANAGER', 'raffle.winner')).toBe(false);
    expect(can('OWNER', 'admins.manage')).toBe(true);
    expect(can(null, 'stats.view')).toBe(false);
    expect(can(undefined, 'stats.view')).toBe(false);
  });
});
