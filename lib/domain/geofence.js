'use strict';
// Mặt tiền giữ tên hàm xuất cũ; logic nằm ở class GeofencePolicy (lib/domain/attendance/geofence-policy.js), phụ thuộc nối thật ở đây.
const store = require('../db');
const { rulesFor } = require('../request-rules');
const { GeofencePolicy } = require('./attendance/geofence-policy');

const zone = async () => await store.getSetting('geofence', null); // đọc store mỗi lần: test mở DB khác vẫn đúng
const policy = new GeofencePolicy({
  zone,
  distanceM: async (...coords) => (await rulesFor()).punch.distanceM(...coords)
});

module.exports = {
  geofence: zone,
  finiteIn: GeofencePolicy.finiteIn,
  cleanGeofence: GeofencePolicy.clean,
  geofenceView: async user => await policy.viewFor(user),
  checkGeofence: async location => await policy.check(location)
};
