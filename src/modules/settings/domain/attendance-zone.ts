// Vùng chấm công quanh văn phòng: toạ độ tâm và bán kính (mét).
import { GeoLocation } from '../../attendance/domain/geo-location';
import { SettingsInputError } from '../settings.errors';

export interface Zone {
  lat: number;
  lng: number;
  radiusM: number;
}

export type PunchLocationCheck =
  | { kind: 'ok'; distanceM: number | null }
  | { kind: 'outside'; distanceM: number }
  | { kind: 'no-location' };

const RADIUS_MIN = 20;
const RADIUS_MAX = 5000;

/** Khoảng cách haversine giữa hai toạ độ, làm tròn mét. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const from = new GeoLocation({ latitude: a.lat, longitude: a.lng });
  const to = new GeoLocation({ latitude: b.lat, longitude: b.lng });
  return Math.round(from.calculateDistanceMeters(to));
}

const isCoord = (v: unknown, limit: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;

/**
 * Không có vùng thì chấm ở đâu cũng được. Có vùng mà thiếu hoặc sai lat/lng thì no-location
 * (0 / 0 là một vị trí hợp lệ). Cách đúng bằng bán kính vẫn là ok.
 */
export function checkPunchLocation(zone: Zone | null, at: { lat?: unknown; lng?: unknown }): PunchLocationCheck {
  if (zone === null) return { kind: 'ok', distanceM: null };
  if (!isCoord(at.lat, 90) || !isCoord(at.lng, 180)) return { kind: 'no-location' };
  const d = distanceM(zone, { lat: at.lat, lng: at.lng });
  return d > zone.radiusM ? { kind: 'outside', distanceM: d } : { kind: 'ok', distanceM: d };
}

/** Kiểm vùng: lat −90..90, lng −180..180, radiusM số nguyên 20..5000. Mỗi ô sai báo đúng tên ô. */
export function validateZone(v: unknown): Zone {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    throw new SettingsInputError('Vùng chấm công phải là một nhóm gồm lat, lng, radiusM', 'zone');
  }
  const z = v as Record<string, unknown>;
  if (!isCoord(z.lat, 90)) throw new SettingsInputError('Vĩ độ phải là số từ -90 đến 90', 'lat');
  if (!isCoord(z.lng, 180)) throw new SettingsInputError('Kinh độ phải là số từ -180 đến 180', 'lng');
  if (!Number.isInteger(z.radiusM) || (z.radiusM as number) < RADIUS_MIN || (z.radiusM as number) > RADIUS_MAX) {
    throw new SettingsInputError(`Bán kính phải là số nguyên từ ${RADIUS_MIN} đến ${RADIUS_MAX} mét`, 'radiusM');
  }
  return { lat: z.lat, lng: z.lng, radiusM: z.radiusM as number };
}
