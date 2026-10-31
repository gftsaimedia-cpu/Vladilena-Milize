const store = require('../db');
const { HttpError } = require('../http');
const { rulesFor } = require('../request-rules');
const { warnIf } = require('../warnings');

/* ---------- GPS check-in (vùng công ty) ---------- */
// Ngoài khu vực công ty, thiếu vị trí hay vị trí kém chính xác: Check-in vẫn được ghi kèm cảnh báo; không lưu toạ độ; không chụp ảnh khuôn mặt.
// Lưu ý: toạ độ do trình duyệt tự gửi nên có thể bị giả (ứng dụng giả vị trí, công cụ lập trình). Đây là biện pháp răn đe
// khi bấm ở xa, không phải bằng chứng có mặt. Toạ độ chỉ dùng để so sánh trong một lần gọi:
// không ghi vào punches, attendance_sessions, punch_requests, nhật ký hay thông báo lỗi (cũng không ghi khoảng cách).
const geofence = () => store.getSetting('geofence', null);
const finiteIn = (value, min, max) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
function cleanGeofence(b) {
  if (!finiteIn(b.lat, -90, 90)) throw new HttpError(400, 'Vĩ độ (lat) phải là số từ -90 đến 90');
  if (!finiteIn(b.lng, -180, 180)) throw new HttpError(400, 'Kinh độ (lng) phải là số từ -180 đến 180');
  if (!finiteIn(b.radiusM, 20, 5000)) throw new HttpError(400, 'Bán kính (radiusM) phải là số từ 20 đến 5000 mét');
  const maxAccuracyM = b.maxAccuracyM === undefined ? 100 : b.maxAccuracyM;
  if (!finiteIn(maxAccuracyM, 10, 1000)) throw new HttpError(400, 'Độ chính xác tối đa phải là số từ 10 đến 1000 mét');
  return { lat: b.lat, lng: b.lng, radiusM: b.radiusM, maxAccuracyM };
}
// Nhân sự chỉ biết có bật hay không; Admin thấy cả cài đặt. Khách chưa đăng nhập không thấy gì.
const geofenceView = user => {
  if (!user) return {};
  const g = geofence();
  return { geofenceRequired: !!g, ...(user.role === 'admin' ? { geofence: g } : {}) };
};
// Kiểm vị trí gửi kèm khi Check-in; không làm gì (trả null) khi chưa bật vùng. Check-in vẫn
// thành công, trả mã lý do ('none' | 'low-accuracy' | 'outside') để server ghi vào lượt MỘT cờ boolean entry.outsideZone (tuyệt đối không toạ độ, độ chính xác hay khoảng cách) và cảnh báo.
// Số tiền không đổi: GPS không tham gia tính lương; Admin thấy cờ ở màn Chấm công để xem lại.
function checkGeofence(location) {
  const g = geofence();
  if (!g) return null;
  const l = location;
  const bad =
    !l ||
    typeof l !== 'object' ||
    !finiteIn(l.lat, -90, 90) ||
    !finiteIn(l.lng, -180, 180) ||
    !finiteIn(l.accuracy, 0, 1e9);
  const note = 'Lượt vẫn được ghi nhận và Admin sẽ xem lại; số tiền không đổi vì GPS không tham gia tính lương.';
  if (
    warnIf('GEO_NO_LOCATION', bad, {
      message: `Check-in không có vị trí GPS. ${note}`
    })
  )
    return 'none';
  if (
    warnIf('GEO_LOW_ACCURACY', l.accuracy > g.maxAccuracyM, {
      message: `Vị trí GPS chưa đủ chính xác khi Check-in. ${note}`
    })
  )
    return 'low-accuracy';
  if (
    warnIf('GEO_OUTSIDE', rulesFor().punch.distanceM(g.lat, g.lng, l.lat, l.lng) > g.radiusM, {
      message: `Bạn Check-in ngoài phạm vi công ty. ${note}`
    })
  )
    return 'outside';
  return null;
}

module.exports = { geofence, finiteIn, cleanGeofence, geofenceView, checkGeofence };
