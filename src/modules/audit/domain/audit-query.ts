import { BadRequestError } from '../../../common';
import { isValidDateText } from '../../../common/date-text';

export const AUDIT_PAGE_DEFAULT = 25;
export const AUDIT_PAGE_MAX = 200;

export interface AuditQuery {
  limit: number;
  offset: number;
  actor?: string;
  action?: string;
  fromAt?: string;
  toAt?: string;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// 0h ngày 'YYYY-MM-DD' theo giờ Việt Nam (UTC+7), trả về ISO UTC.
export function vnDayStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - VN_OFFSET_MS).toISOString();
}

// Ngày kế tiếp dạng 'YYYY-MM-DD'.
function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + DAY_MS).toISOString().slice(0, 10);
}

const blank = (v: unknown) => v === undefined || v === null || v === '';

function whole(raw: unknown, label: string, min: number, hint: string): number {
  const text = String(raw);
  const n = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(n) || n < min) {
    throw new BadRequestError(`${label} phải là số nguyên ${hint}`);
  }
  return n;
}

function day(raw: unknown, label: string): string {
  if (!isValidDateText(raw)) throw new BadRequestError(`${label} phải là ngày có thật dạng YYYY-MM-DD`);
  return raw;
}

export function parseAuditQuery(raw: Record<string, unknown>): AuditQuery {
  const limit = blank(raw.limit) ? AUDIT_PAGE_DEFAULT : Math.min(whole(raw.limit, 'limit', 1, 'dương'), AUDIT_PAGE_MAX);
  const offset = blank(raw.offset) ? 0 : whole(raw.offset, 'offset', 0, 'không âm');
  const query: AuditQuery = { limit, offset };

  if (typeof raw.actor === 'string' && raw.actor !== '') query.actor = raw.actor;
  if (typeof raw.action === 'string' && raw.action !== '') query.action = raw.action;

  const from = blank(raw.from) ? null : day(raw.from, 'Từ ngày');
  const to = blank(raw.to) ? null : day(raw.to, 'Đến ngày');
  if (from && to && from > to) throw new BadRequestError('Từ ngày phải trước hoặc bằng Đến ngày');
  if (from) query.fromAt = vnDayStart(from);
  if (to) query.toAt = vnDayStart(nextDay(to));
  return query;
}
