// Khoá nút chấm công theo luật của BE (POST /me/punches): ngày làm (chỉ khi vào ca), vị trí, rồi vùng chấm công. File thuần.
import { vnd } from '../../utils/format';
import type { Zone } from './settings';

export type LatLng = { lat: number; lng: number };
export type PunchLock = { locked: false } | { locked: true; reason: string };

const EARTH_M = 6371000;
const rad = (deg: number) => (deg * Math.PI) / 180;

// Khoảng cách haversine giữa hai toạ độ, làm tròn tới mét.
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_M * Math.asin(Math.sqrt(h)));
}

// position: undefined = đang lấy, null = không lấy được. Ngày không phải ngày làm chỉ chặn vào ca; ra ca (ca đêm ra sáng hôm sau) thì không.
export function checkInLock(input: {
  kind: 'in' | 'out';
  workday: boolean;
  zone: Zone | null;
  position: LatLng | null | undefined;
}): PunchLock {
  const { kind, workday, zone, position } = input;
  if (kind === 'in' && !workday) return { locked: true, reason: 'Hôm nay không phải ngày làm của bạn' };
  if (zone === null) return { locked: false };
  if (position === undefined) return { locked: true, reason: 'Đang lấy vị trí…' };
  if (position === null) return { locked: true, reason: 'Không lấy được vị trí' };
  const d = distanceM(zone, position);
  if (d > zone.radiusM) return { locked: true, reason: `Bạn đang cách văn phòng ${vnd(d)} m` };
  return { locked: false };
}
