'use strict';
const { HttpError } = require('../../platform/http');
const { warnIf } = require('../../platform/warnings');

const finiteIn = (value?, min?, max?) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

class GeofencePolicy {
  declare zone: any;
  declare distanceM: any;

  constructor({ zone, distanceM }: any) {
    this.zone = zone;
    this.distanceM = distanceM;
  }

  static finiteIn(value?, min?, max?) {
    return finiteIn(value, min, max);
  }

  // Cài đặt vùng do Admin gửi: toạ độ, bán kính và độ chính xác tối đa phải trong khoảng hợp lệ
  static clean(b?) {
    if (!finiteIn(b.lat, -90, 90)) throw new HttpError(400, 'Vĩ độ (lat) phải là số từ -90 đến 90');
    if (!finiteIn(b.lng, -180, 180)) throw new HttpError(400, 'Kinh độ (lng) phải là số từ -180 đến 180');
    if (!finiteIn(b.radiusM, 20, 5000)) throw new HttpError(400, 'Bán kính (radiusM) phải là số từ 20 đến 5000 mét');
    const maxAccuracyM = b.maxAccuracyM === undefined ? 100 : b.maxAccuracyM;
    if (!finiteIn(maxAccuracyM, 10, 1000))
      throw new HttpError(400, 'Độ chính xác tối đa phải là số từ 10 đến 1000 mét');
    return { lat: b.lat, lng: b.lng, radiusM: b.radiusM, maxAccuracyM };
  }

  async viewFor(user?) {
    if (!user) return {};
    const g = await this.zone();
    return { geofenceRequired: !!g, ...(user.role === 'admin' ? { geofence: g } : {}) };
  }

  async check(location?) {
    const g = await this.zone();
    if (!g) return null;
    const l = location;
    const bad =
      !l ||
      typeof l !== 'object' ||
      !finiteIn(l.lat, -90, 90) ||
      !finiteIn(l.lng, -180, 180) ||
      !finiteIn(l.accuracy, 0, 1e9);
    const note = 'Lượt vẫn được ghi nhận và Admin sẽ xem lại; số tiền không đổi vì GPS không tham gia tính lương.';
    if (warnIf('GEO_NO_LOCATION', bad, { message: `Check-in không có vị trí GPS. ${note}` })) return 'none';
    if (
      warnIf('GEO_LOW_ACCURACY', l.accuracy > g.maxAccuracyM, {
        message: `Vị trí GPS chưa đủ chính xác khi Check-in. ${note}`
      })
    )
      return 'low-accuracy';
    if (
      warnIf('GEO_OUTSIDE', (await this.distanceM(g.lat, g.lng, l.lat, l.lng)) > g.radiusM, {
        message: `Bạn Check-in ngoài phạm vi công ty. ${note}`
      })
    )
      return 'outside';
    return null;
  }
}

export = { GeofencePolicy };
