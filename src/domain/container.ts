'use strict';
// Nơi dựng (composition root) các repository và service của src/domain: mỗi thứ dựng một lần, nhận phụ thuộc qua constructor.
// Route, src/params/store.ts và các lối vào khác (src/domain/explanation/explanations.ts) lấy đối tượng ở đây thay vì tự `new`.
// Dựng lười (lần đầu dùng mới dựng) để require vòng db ↔ params ↔ domain không xảy ra lúc nạp module; kết nối DB đổi (test mở DB khác)
// thì dựng lại.
const store = require('../platform/db');
const { EmployeeRepository, EmployeeDirectory } = require('./employee');
const { PositionCatalog } = require('./position');
const { ShiftCatalog } = require('./shift');
const { ExplanationRepository, ExplanationService } = require('./explanation');
const { LeaveLedgerRepository, LeaveAccountService } = require('./leave');
const { catalogParams } = require('./catalog-params');

const nowIso = () => new Date(Date.now()).toISOString();

class Container {
  declare store: any;

  #db: any = null;
  #built = new Map();

  constructor(source?) {
    this.store = source;
  }

  #once(name?, build?) {
    if (this.#db !== this.store.db) {
      this.#db = this.store.db;
      this.#built.clear();
    }
    if (!this.#built.has(name)) this.#built.set(name, build());
    return this.#built.get(name);
  }

  #repo(Type?) {
    return new Type({ queryBuilder: this.store.queryBuilder, transaction: this.store.transaction });
  }

  get employeeRepository() {
    return this.#once('employeeRepository', () => this.#repo(EmployeeRepository));
  }

  get positions() {
    return this.#once('positions', () => this.#repo(PositionCatalog));
  }

  get shifts() {
    return this.#once('shifts', () => this.#repo(ShiftCatalog));
  }

  get employees() {
    return this.#once(
      'employees',
      () =>
        new EmployeeDirectory({
          employees: this.employeeRepository,
          positions: this.positions,
          shifts: this.shifts,
          audit: this.store.audit
        })
    );
  }

  get explanationRepository() {
    return this.#once('explanationRepository', () => this.#repo(ExplanationRepository));
  }

  get explanations() {
    return this.#once('explanations', () => {
      const { selfDecision } = require('../platform/warnings');
      return new ExplanationService({
        repository: this.explanationRepository,
        staffExists: async (username?) => !!(await this.store.getStaff(username)),
        clock: nowIso,
        onSelf: () => selfDecision(true, { doing: 'duyệt giải trình' }),
        periodClosed: async (month?) => (await this.store.periods.get(month)).status !== 'open'
      });
    });
  }

  // Check-out muộn chờ Admin duyệt giải trình. Nạp muộn: attendance/request-rules đọc src/params/store.ts, store đó hỏi container
  get lateCheckout() {
    return this.#once('lateCheckout', () => {
      const { LateCheckout } = require('./explanation/late-checkout-session');
      const { rulesFor } = require('../platform/request-rules');
      const { punchStaff, sessionOverlap, hintPunch } = require('./attendance');
      return new LateCheckout({
        store: this.store,
        explanations: this.explanations,
        repository: this.explanationRepository,
        punchRules: async () => (await rulesFor()).punch,
        attendance: { punchStaff, sessionOverlap, hintPunch },
        audit: require('../platform/audit'),
        graceMin: require('../platform/config').CHECKOUT_GRACE_MIN
      });
    });
  }

  // Giải trình kèm lần bấm Check-in / Check-out không hợp lệ (luật hợp lệ của SessionStatus, ghi qua LateCheckout)
  get punchExplanation() {
    return this.#once('punchExplanation', () => {
      const { PunchExplanation } = require('./explanation/punch-explanation');
      return new PunchExplanation({
        classifier: this.sessionStatus,
        lateCheckout: this.lateCheckout,
        explanations: this.explanations
      });
    });
  }

  // Admin khai thay giờ vào / ra ⇒ lượt chấm công nguồn Admin. Nạp muộn cùng lý do với lateCheckout
  get adminPresence() {
    return this.#once('adminPresence', () => {
      const { AdminPresence } = require('./attendance/admin-presence');
      const { rulesFor } = require('../platform/request-rules');
      const { punchStaff, hintPunch } = require('./attendance');
      return new AdminPresence({
        store: this.store,
        punchRules: async (month?) => (await rulesFor(month)).punch,
        // dòng duyệt của ngày khai: { status } khi dòng duyệt còn khớp dấu vân tay của ngày khai hiện tại, không thì null (coi như chờ duyệt)
        dayApproval: async (username?, date?, day?) => {
          const view = (await rulesFor(date.slice(0, 7))).approvalView;
          const staff = await this.store.getStaff(username);
          const found = view.itemOf(
            day,
            view.dayCtx({ holidays: await this.store.getSetting('holidays', []), staffType: staff && staff.type }, date)
          );
          const row = (await this.store.approvals.forSheet(username, date.slice(0, 7)))[date];
          return found && row && row.fingerprint === found.fingerprint ? { status: row.status } : null;
        },
        attendance: { punchStaff, hintPunch },
        nowIso,
        audit: require('../platform/audit'),
        warn: require('../platform/warnings').warn
      });
    });
  }

  // Trạng thái hiển thị của lượt chấm công: ngưỡng trễ và cách đo phút trễ theo tham số của tháng, mức Check-out muộn của config
  get sessionStatus() {
    return this.#once('sessionStatus', () => {
      const { SessionStatus } = require('./attendance/session-status');
      const { rulesFor } = require('../platform/request-rules');
      const { lateCheckoutMin } = require('./explanation');
      const { ADMIN_ORIGIN } = require('./attendance/attendance-sessions');
      return new SessionStatus({
        rules: async (month?) => {
          const ah = (await rulesFor(month || undefined)).actualHours;
          return { graceMin: ah.RULE.GRACE_MIN, lateMinutes: ah.lateMinutes };
        },
        checkoutGraceMin: require('../platform/config').CHECKOUT_GRACE_MIN,
        lateCheckoutMin,
        adminOrigin: ADMIN_ORIGIN
      });
    });
  }

  // Điểm KPI: nối KpiScoring với kho dữ liệu và bộ tham số. Nạp muộn và đọc store mỗi lần gọi (test mở DB khác vẫn đúng)
  get kpi() {
    return this.#once('kpi', () => {
      const KpiRules = require('../engine/kpi-score'); // KPI 5 thành phần: điểm, trọng số, ngưỡng
      const { rulesFor, monthParams, typeParam } = require('../platform/request-rules');
      const { KpiScoring } = require('./kpi/kpi-scoring');
      return new KpiScoring({
        sheetOf: async (username?, month?) => await this.store.getSheet(username, month),
        monthParams,
        rulesFor,
        typeParam,
        KpiRules
      });
    });
  }

  // Vùng GPS Check-in: GeofencePolicy đọc vùng từ cài đặt và khoảng cách từ luật chấm công của tháng
  get geofencePolicy() {
    return this.#once('geofencePolicy', () => {
      const { rulesFor } = require('../platform/request-rules');
      const { GeofencePolicy } = require('./attendance/geofence-policy');
      return new GeofencePolicy({
        zone: async () => await this.store.getSetting('geofence', null),
        distanceM: async (...coords) => (await rulesFor()).punch.distanceM(...coords)
      });
    });
  }

  get leave() {
    return this.#once('leave', () => {
      // nạp muộn: request-rules và leave-days đọc src/params/store.ts, mà store đó lại hỏi container (paramRows)
      const { rulesFor, benefitOf, vnToday } = require('../platform/request-rules');
      const { leaveDates } = require('./leave-days');
      return new LeaveAccountService({
        ledger: this.#repo(LeaveLedgerRepository),
        store: this.store,
        rules: { rulesFor, benefitOf, leaveDates, vnToday, nowIso }
      });
    });
  }

  // Số phiên bản và dòng tham số của danh mục: src/domain/catalog-params.ts (src/params/store.ts đọc thẳng ở đó, không qua container)
  catalogRev() {
    return catalogParams.rev();
  }

  // Gọi bên trong giao dịch của thao tác sửa danh mục
  async bumpCatalogRev() {
    return await catalogParams.bump();
  }

  async catalogParamRows() {
    return await catalogParams.rows();
  }
}

const container = new Container(store);

export = { Container, container };
