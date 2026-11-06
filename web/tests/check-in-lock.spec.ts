import { expect, test } from '@playwright/test';
import { checkInLock, distanceM } from '../src/mock/check-in';
import { homeView, workdayOn } from '../src/mock/staff-phone';

const zone = { lat: 10.7769, lng: 106.7009, radiusM: 150 };
const far = { lat: 10.782296, lng: 106.7009 };

test('distance is haversine rounded to the metre', () => {
  expect(distanceM(zone, far)).toBe(600);
  expect(distanceM(zone, zone)).toBe(0);
});

test('lock order follows the BE: workday, location, zone', () => {
  const kind = 'in' as const;
  expect(checkInLock({ kind, workday: false, zone, position: far })).toEqual({ locked: true, reason: 'Hôm nay không phải ngày làm của bạn' });
  expect(checkInLock({ kind, workday: true, zone: null, position: null })).toEqual({ locked: false });
  expect(checkInLock({ kind, workday: true, zone, position: undefined })).toEqual({ locked: true, reason: 'Đang lấy vị trí…' });
  expect(checkInLock({ kind, workday: true, zone, position: null })).toEqual({ locked: true, reason: 'Không lấy được vị trí' });
  expect(checkInLock({ kind, workday: true, zone, position: far })).toEqual({ locked: true, reason: 'Bạn đang cách văn phòng 600 m' });
  expect(checkInLock({ kind, workday: true, zone, position: { lat: 10.788142, lng: 106.7009 } })).toEqual({ locked: true, reason: 'Bạn đang cách văn phòng 1.250 m' });
  expect(checkInLock({ kind, workday: true, zone, position: zone })).toEqual({ locked: false });
});

test('the mock says an approved-leave day is not a workday (BE §5.6)', () => {
  expect(workdayOn('2026-10-12')).toBe(false); // phép năm
  expect(workdayOn('2026-10-17')).toBe(false); // iSAT
  expect(workdayOn('2026-10-28')).toBe(true);
  expect(homeView().workday).toBe(true); // hôm nay của dữ liệu giả không có đơn nghỉ
});

test('an off day never blocks punching out, the zone still does', () => {
  expect(checkInLock({ kind: 'out', workday: false, zone, position: zone })).toEqual({ locked: false });
  expect(checkInLock({ kind: 'out', workday: false, zone, position: far })).toEqual({ locked: true, reason: 'Bạn đang cách văn phòng 600 m' });
});
