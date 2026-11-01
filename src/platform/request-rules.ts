const { AsyncLocalStorage } = require('node:async_hooks');
const paramsStore = require('../params/store');
// Sáu mô-đun quy tắc dùng chung với giao diện. Máy chủ KHÔNG gọi bản trần của chúng: mọi chỗ dùng qua rulesFor(tháng).<mô-đun>, dựng bằng
// create(bộ tham số hiệu lực của tháng đó), để giá trị Admin đã lưu đến mọi đường kiểm.
const LeaveRules = require('../engine/leave'); // quy tắc cộng phép năm
const PunchRules = require('../engine/punch'); // quy tắc check-in / check-out
const CalendarRules = require('../engine/payroll-calendar'); // ngày, tháng hợp lệ; tách giờ làm theo ngày lễ
const ApprovalViewRules = require('../engine/approval-view'); // khoản tự khai cần Admin duyệt
const ActualHoursRules = require('../engine/actual-hours'); // giờ công theo Check-in/out thực tế
const KpiRules = require('../engine/kpi-score'); // KPI 5 thành phần: điểm, trọng số, ngưỡng
const WorkScheduleRules = require('../engine/work-schedule'); // lịch làm việc của chức vụ và của người (một nguồn)

// Số liệu quy tắc đọc từ bộ tham số hiệu lực của đúng tháng, không có bản sao số trong mã. Tra khoá theo loại nhân sự bằng
// Object.hasOwn, nên loại lạ ("constructor", "__proto__") không bao giờ trúng khoá nào.
// rulesFor(tháng) = { params, punch, leave, calendar, approvalView, actualHours, kpi, workSchedule }. Mỗi yêu cầu HTTP có một bản nhớ riêng (AsyncLocalStorage):
// một tháng chỉ resolve và dựng quy tắc một lần trong một yêu cầu, kể cả trong vòng lặp. Ngoài yêu cầu HTTP thì dựng mới mỗi lần gọi.
const requestRules = new AsyncLocalStorage();
async function rulesFor(month?) {
  const key = month || vnToday().slice(0, 7);
  const cache = requestRules.getStore();
  if (cache && cache.has(key)) return cache.get(key);
  const params = (await paramsStore.resolve(key)).params;
  const made = new Map<any, any>();
  const build = (name?, rules?) => {
    if (!made.has(name)) made.set(name, rules.create(params));
    return made.get(name);
  };
  const rules = {
    params,
    get punch() {
      return build('punch', PunchRules);
    },
    get leave() {
      return build('leave', LeaveRules);
    },
    get calendar() {
      return build('calendar', CalendarRules);
    },
    get approvalView() {
      return build('approvalView', ApprovalViewRules);
    },
    get actualHours() {
      return build('actualHours', ActualHoursRules);
    },
    get kpi() {
      return build('kpi', KpiRules);
    },
    get workSchedule() {
      return build('workSchedule', WorkScheduleRules);
    }
  };
  if (cache) cache.set(key, rules);
  return rules;
}
const monthParams = async (month?) => (await rulesFor(month)).params;
// level (tuỳ chọn): ghi đè theo bậc level.<mã>.<bậc>.<đuôi> (khác null) thắng giá trị của chức vụ (chuỗi: bậc → chức vụ)
const typeParam = (params?, type?, tail?, level?) => {
  const own = level === undefined ? undefined : params[`level.${type}.${level}.${tail}`];
  if (own !== undefined && own !== null && Object.hasOwn(params, `level.${type}.${level}.${tail}`)) return own;
  return Object.hasOwn(params, `type.${type}.${tail}`) ? params[`type.${type}.${tail}`] : undefined;
};
// Cờ quyền lợi của chức vụ: type.<mã>.benefit.<cờ> đúng true (vắng khoá, mã lạ là false; tra bằng Object.hasOwn nên "constructor" không trúng gì)
// level (tuỳ chọn): ghi đè theo bậc level.<mã>.<bậc>.benefit.<cờ> (khác null) thắng cờ của chức vụ (chuỗi: bậc → chức vụ)
const benefitOf = (params?, type?, flag?, level?) => {
  const own = level === undefined ? undefined : params[`level.${type}.${level}.benefit.${flag}`];
  if (typeof own === 'boolean' && Object.hasOwn(params, `level.${type}.${level}.benefit.${flag}`)) return own;
  return params[`type.${type}.benefit.${flag}`] === true && Object.hasOwn(params, `type.${type}.benefit.${flag}`);
};
// Số bậc lương của một loại: số khoá level.<loại>.<n>.base liên tiếp từ n = 1
const levelCountOf = (params?, type?) => {
  let count = 0;
  while (Object.hasOwn(params, `level.${type}.${count + 1}.base`)) count += 1;
  return count;
};
// Bộ định dạng dựng MỘT lần: toLocaleDateString dựng Intl.DateTimeFormat mới ở mỗi lần gọi (đo tải: 10 % CPU của /api/team)
const vnDayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const vnToday = () => vnDayFormat.format(new Date(Date.now())); // 'YYYY-MM-DD' theo giờ Việt Nam (máy chủ có thể chạy UTC); qua Date.now để test giả được đồng hồ
const nowIso = () => new Date(Date.now()).toISOString(); // qua Date.now để bài kiểm tra giả lập được đồng hồ

export = { requestRules, rulesFor, monthParams, typeParam, benefitOf, levelCountOf, vnToday, nowIso };
