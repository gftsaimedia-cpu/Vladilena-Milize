(function (root: any, factory: any) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PayrollParams = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Tham số tính lương: MẶC ĐỊNH (bằng đúng các hằng số đang chạy trong mã), hợp nhất theo tháng và các lớp tham số có kiểu.
  // Dùng chung trình duyệt (window.PayrollParams) và máy chủ (require), thuần: không I/O, không đồng hồ, không DOM.
  // Giá trị giữ nguyên đơn vị của mã (0,08 vẫn là 0,08; 75 điểm vẫn là 75). Siêu dữ liệu (nhãn, loại, sàn, thành phần giao diện)
  // nằm ở src/params/registry.ts; khối GENERATED dưới đây chỉ chứa GIÁ TRỊ, sinh bởi `npm run params:extract`, không sửa tay.

  /* GENERATED:BEGIN (scripts/params/extract-defaults.ts) */
  const DEFAULTS: Record<string, any> = {
    'advance.basis': 'byWorkedDays',
    'advance.eligibleTypes.ctv': true,
    'advance.eligibleTypes.nv': true,
    'advance.eligibleTypes.tts': true,
    'advance.rate': 0.8,
    'advance.untilDay': 15,
    'approval.batch': true,
    'approval.pendingAtLock': 'confirm',
    'attendance.absentCompare': 'gte',
    'attendance.beyondShiftRule': 'cap8',
    'attendance.cutRounding': 'halfUpStep',
    'attendance.declaredLeaveRule': 'declared',
    'attendance.earlyCheckinMaxHours': 4,
    'attendance.extraSourceRule': 'calendar',
    'attendance.extraWindowRule': 'continuous',
    'attendance.futureDaysRule': 'none',
    'attendance.gapRule': 'step',
    'attendance.graceCompare': 'gte',
    'attendance.graceMin': 15,
    'attendance.graceMonthlyCount': 0,
    'attendance.graceMonthlyMin': 0,
    'attendance.graceScope': 'perPunch',
    'attendance.lateEarlyRule': 'separate',
    'attendance.lossMode': 'all',
    'attendance.makeupDayStepRule': 'exact',
    'attendance.missingAllRule': 'absent',
    'attendance.missingOneSideRule': 'pending',
    'attendance.offScheduleRule': 'unpaid',
    'attendance.openSessionMaxHours': 16,
    'attendance.overLimitCompare': 'gte',
    'attendance.overLimitHours': 24,
    'attendance.overLimitTolerance': 0,
    'attendance.shortHoursRounding': 'none',
    'attendance.sources.file': false,
    'attendance.stepMin': 30,
    'attendance.tiers': [],
    'attendance.undeclaredPunchRule': 'report',
    'catalog.orgUnits': [],
    'catalog.positions': [],
    'catalog.workLocations': [],
    'contract.deriveFrom': null,
    'contract.expiryWarnDays': 30,
    'control.reasonMaxLength': 300,
    'control.reasonMinLength': 10,
    'control.reasonRequired.aiDismiss': true,
    'control.reasonRequired.changeDecision': true,
    'control.reasonRequired.paramChange': true,
    'control.reasonRequired.periodReopen': true,
    'control.reasonRequired.reject': true,
    'control.reasonRequired.slipOverride': true,
    'employeeCode.onTypeOrUnitChange': 'newCode',
    'employeeCode.pattern': '{type}{unit}{seq:2}',
    'employeeCode.reuseAfterLeave': 'never',
    'formula.heSoNgayKpi': {
      text: 'hệ số ngày đi làm của KPI = nếu vượt ngưỡng giờ KPI (giờ vượt ngưỡng ; ngưỡng giờ vượt KPI) thì tỷ lệ ngày đi làm ngược lại 1',
      tree: {
        v: 1,
        name: 'heSoNgayKpi',
        root: 'n1',
        nodes: {
          n1: {
            t: 'cond',
            if: 'n2',
            then: 'n5',
            else: 'n6'
          },
          n2: {
            t: 'builtin',
            name: 'vuotNguongKpi',
            args: ['n3', 'n4']
          },
          n3: {
            t: 'var',
            id: 'gioVuotNguong'
          },
          n4: {
            t: 'param',
            key: 'kpi.overLimitHours'
          },
          n5: {
            t: 'ref',
            name: 'tyLeNgayDiLam'
          },
          n6: {
            t: 'lit',
            v: 1
          }
        }
      }
    },
    'formula.luongKpi': {
      text: 'lương KPI = nếu loại có KPI thì (nếu KPI đạt thì (nếu KPI năm thành phần thì tiền KPI theo điểm năm thành phần (mức KPI đã duyệt ; điểm KPI ; hệ số ngày đi làm của KPI) ngược lại tiền KPI theo phần trăm (mức KPI đã duyệt ; điểm KPI ; hệ số ngày đi làm của KPI)) ngược lại 0) ngược lại 0',
      tree: {
        v: 1,
        name: 'luongKpi',
        root: 'n1',
        nodes: {
          n1: {
            t: 'cond',
            if: 'n2',
            then: 'n3',
            else: 'n16'
          },
          n2: {
            t: 'var',
            id: 'coKpi'
          },
          n3: {
            t: 'cond',
            if: 'n4',
            then: 'n5',
            else: 'n15'
          },
          n4: {
            t: 'var',
            id: 'kpiDat'
          },
          n5: {
            t: 'cond',
            if: 'n6',
            then: 'n7',
            else: 'n11'
          },
          n6: {
            t: 'var',
            id: 'kpiNamThanhPhan'
          },
          n7: {
            t: 'builtin',
            name: 'tienKpi',
            args: ['n8', 'n9', 'n10']
          },
          n8: {
            t: 'var',
            id: 'mucKpi'
          },
          n9: {
            t: 'var',
            id: 'diemKpi'
          },
          n10: {
            t: 'ref',
            name: 'heSoNgayKpi'
          },
          n11: {
            t: 'builtin',
            name: 'tienKpiCu',
            args: ['n12', 'n13', 'n14']
          },
          n12: {
            t: 'var',
            id: 'mucKpi'
          },
          n13: {
            t: 'var',
            id: 'diemKpi'
          },
          n14: {
            t: 'ref',
            name: 'heSoNgayKpi'
          },
          n15: {
            t: 'lit',
            v: 0
          },
          n16: {
            t: 'lit',
            v: 0
          }
        }
      }
    },
    'formula.phuCapChuyenCan': {
      text: 'chuyên cần = nếu loại có phụ cấp thì (nếu giữ được chuyên cần (ngày nghỉ xét chuyên cần ; giờ vượt ngưỡng ; ngưỡng ngày nghỉ chuyên cần theo loại) thì lương cơ bản của level × tỷ lệ chuyên cần theo loại × tỷ lệ ngày đi làm ngược lại 0) ngược lại 0',
      tree: {
        v: 1,
        name: 'phuCapChuyenCan',
        root: 'n1',
        nodes: {
          n1: {
            t: 'cond',
            if: 'n2',
            then: 'n3',
            else: 'n14'
          },
          n2: {
            t: 'var',
            id: 'loaiCoPhuCap'
          },
          n3: {
            t: 'cond',
            if: 'n4',
            then: 'n8',
            else: 'n13'
          },
          n4: {
            t: 'builtin',
            name: 'giuChuyenCan',
            args: ['n5', 'n6', 'n7']
          },
          n5: {
            t: 'var',
            id: 'ngayNghiXetChuyenCan'
          },
          n6: {
            t: 'var',
            id: 'gioVuotNguong'
          },
          n7: {
            t: 'param',
            key: 'type.<type>.maxAbsent'
          },
          n8: {
            t: 'op',
            op: 'mul',
            a: 'n9',
            b: 'n12'
          },
          n9: {
            t: 'op',
            op: 'mul',
            a: 'n10',
            b: 'n11'
          },
          n10: {
            t: 'var',
            id: 'luongCoBan'
          },
          n11: {
            t: 'param',
            key: 'type.<type>.attendance'
          },
          n12: {
            t: 'ref',
            name: 'tyLeNgayDiLam'
          },
          n13: {
            t: 'lit',
            v: 0
          },
          n14: {
            t: 'lit',
            v: 0
          }
        }
      }
    },
    'formula.phuCapDiLai': {
      text: 'đi lại = nếu loại có phụ cấp thì (nếu ở iDorm thì 0 ngược lại lương cơ bản của level × tỷ lệ phụ cấp đi lại theo loại × tỷ lệ ngày đi làm) ngược lại 0',
      tree: {
        v: 1,
        name: 'phuCapDiLai',
        root: 'n1',
        nodes: {
          n1: {
            t: 'cond',
            if: 'n2',
            then: 'n3',
            else: 'n11'
          },
          n2: {
            t: 'var',
            id: 'loaiCoPhuCap'
          },
          n3: {
            t: 'cond',
            if: 'n4',
            then: 'n5',
            else: 'n6'
          },
          n4: {
            t: 'var',
            id: 'iDorm'
          },
          n5: {
            t: 'lit',
            v: 0
          },
          n6: {
            t: 'op',
            op: 'mul',
            a: 'n7',
            b: 'n10'
          },
          n7: {
            t: 'op',
            op: 'mul',
            a: 'n8',
            b: 'n9'
          },
          n8: {
            t: 'var',
            id: 'luongCoBan'
          },
          n9: {
            t: 'param',
            key: 'type.<type>.travel'
          },
          n10: {
            t: 'ref',
            name: 'tyLeNgayDiLam'
          },
          n11: {
            t: 'lit',
            v: 0
          }
        }
      }
    },
    'formula.tamUng': {
      text: 'tạm ứng = nếu bật tạm ứng thì làm tròn đồng (tỷ lệ tạm ứng × cơ sở tạm ứng) ngược lại 0',
      tree: {
        v: 1,
        name: 'tamUng',
        root: 'n1',
        nodes: {
          n1: {
            t: 'cond',
            if: 'n2',
            then: 'n3',
            else: 'n7'
          },
          n2: {
            t: 'var',
            id: 'batTamUng'
          },
          n3: {
            t: 'builtin',
            name: 'roundDong',
            args: ['n4']
          },
          n4: {
            t: 'op',
            op: 'mul',
            a: 'n5',
            b: 'n6'
          },
          n5: {
            t: 'param',
            key: 'advance.rate'
          },
          n6: {
            t: 'var',
            id: 'tienUng'
          },
          n7: {
            t: 'lit',
            v: 0
          }
        }
      }
    },
    'formula.tongThuNhap': {
      text: 'tổng thu nhập = tổng sáu thành phần ngày + (đi lại + chuyên cần) + lương KPI',
      tree: {
        v: 1,
        name: 'tongThuNhap',
        root: 'n1',
        nodes: {
          n1: {
            t: 'op',
            op: 'add',
            a: 'n2',
            b: 'n7'
          },
          n2: {
            t: 'op',
            op: 'add',
            a: 'n3',
            b: 'n4'
          },
          n3: {
            t: 'var',
            id: 'tongThanhPhanNgay'
          },
          n4: {
            t: 'op',
            op: 'add',
            a: 'n5',
            b: 'n6'
          },
          n5: {
            t: 'ref',
            name: 'phuCapDiLai'
          },
          n6: {
            t: 'ref',
            name: 'phuCapChuyenCan'
          },
          n7: {
            t: 'ref',
            name: 'luongKpi'
          }
        }
      }
    },
    'formula.tyLeNgayDiLam': {
      text: 'tỷ lệ ngày đi làm = số ngày đi làm ÷ ngày công chuẩn',
      tree: {
        v: 1,
        name: 'tyLeNgayDiLam',
        root: 'n1',
        nodes: {
          n1: {
            t: 'op',
            op: 'div',
            a: 'n2',
            b: 'n3'
          },
          n2: {
            t: 'var',
            id: 'ngayDiLam'
          },
          n3: {
            t: 'var',
            id: 'ngayCongChuan'
          }
        }
      }
    },
    'geofence.earthRadiusM': 6371000,
    'geofence.enabled': false,
    'geofence.lat': null,
    'geofence.lng': null,
    'geofence.maxAccuracyM': 100,
    'geofence.maxAccuracyM.default': 100,
    'geofence.maxAccuracyM.max': 1000,
    'geofence.maxAccuracyM.min': 10,
    'geofence.outside': 'block',
    'geofence.radiusM': null,
    'geofence.radiusM.max': 5000,
    'geofence.radiusM.min': 20,
    'holiday.compensatory': 'manual',
    'holiday.makeupRate': 3,
    holidays: [],
    'insurance.base': 'baseSalary',
    'insurance.baseAttr': '',
    'insurance.coverage.long': true,
    'insurance.coverage.short': false,
    'insurance.floorMode': 'none',
    'isat.monthlyLimit': null,
    'isat.weekday': 6,
    'kpi.belowPassRule': 'zero',
    'kpi.incompleteRule': 'waiting',
    'kpi.overLimitCompare': 'gt',
    'kpi.overLimitHours': 24,
    'kpi.passCompare': 'gte',
    'kpi.payCurveRule': 'linear',
    'kpi.ratioRule': 'whenOverLimit',
    'kpi.scoreDecimals': 2,
    'kpi.scoreMax': 100,
    'kpi.weight.manager': 12,
    'kpi.weight.peer': 18,
    'kpi.weight.self': 6,
    'kpi.weight.user': 24,
    'kpi.weight.wework': 40,
    'kpi.weworkGateRule': 'zero',
    'kpi.weworkMin': 75,
    'kpi.weworkMinCompare': 'gte',
    'law.ceiling.compensationShare': 0.3,
    'law.ceiling.fixedTermMonths': 36,
    'law.ceiling.otDayTotalHours': 12,
    'law.ceiling.otMonthHours': 40,
    'law.ceiling.probationDays.college': 60,
    'law.ceiling.probationDays.manager': 180,
    'law.ceiling.probationDays.other': 6,
    'law.ceiling.probationDays.vocational': 30,
    'law.floor.holidayRate': 3,
    'law.floor.nightOtAddRate': 0.2,
    'law.floor.nightPremium': 0.3,
    'law.floor.otRate': 1.5,
    'law.floor.weekendOtRate': 2,
    'law.floor.privateLeave.childMarriage': 1,
    'law.floor.privateLeave.death': 3,
    'law.floor.privateLeave.marriage': 3,
    'law.floor.probationPayRate': 0.85,
    'law.luongCoSo': 2530000,
    'law.region': 1,
    'law.regionMinWage.1': 5310000,
    'law.regionMinWage.2': null,
    'law.regionMinWage.3': null,
    'law.regionMinWage.4': null,
    'leave.accrual.birthday': 1,
    'leave.accrual.perMonth': 1,
    'leave.accrual.start': 0,
    'leave.accrualMode': 'app',
    'leave.birthdayMode': 'addToAnnual',
    'leave.expiry.fromYear': 2026,
    'leave.expiry.month': 1,
    'leave.ifourteen.days': 0,
    'leave.seniority.stepYears': 5,
    'leave.settleMethod': 'manual',
    'leave.useLeaveFirst': 'optional',
    'level.ctv.1.base': 6000000,
    'level.ctv.1.kpi': 1500000,
    'level.ctv.1.name': 'Fresher',
    'level.ctv.2.base': 6000000,
    'level.ctv.2.kpi': 3000000,
    'level.ctv.2.name': 'Practitioner',
    'level.ctv.3.base': 6000000,
    'level.ctv.3.kpi': 4500000,
    'level.ctv.3.name': 'Advanced Practitioner',
    'level.ctv.4.base': 6000000,
    'level.ctv.4.kpi': 6000000,
    'level.ctv.4.name': 'Senior Practitioner',
    'level.nv.1.base': 6000000,
    'level.nv.1.kpi': 6000000,
    'level.nv.1.name': 'Nhân viên',
    'level.nv.2.base': 6500000,
    'level.nv.2.kpi': 6500000,
    'level.nv.2.name': 'Chuyên viên',
    'level.nv.3.base': 7000000,
    'level.nv.3.kpi': 7000000,
    'level.nv.3.name': 'Lead',
    'level.nv.4.base': 7500000,
    'level.nv.4.kpi': 7500000,
    'level.nv.4.name': 'HDO (Human Development Officer)',
    'level.tts.1.base': 1000000,
    'level.tts.1.name': 'Bậc 1',
    'level.tts.2.base': 1500000,
    'level.tts.2.name': 'Bậc 2',
    'level.tts.3.base': 2000000,
    'level.tts.3.name': 'Bậc 3',
    'level.tts.4.base': 3000000,
    'level.tts.4.name': 'Bậc 4',
    'level.tts.5.base': 4000000,
    'level.tts.5.name': 'Bậc 5',
    'level.tts.6.base': 5000000,
    'level.tts.6.name': 'Bậc 6',
    'money.roundMode': 'halfUp',
    'money.roundTo': 1,
    'net.deductionPriority': ['courtOrder', 'compensation', 'taxSettlement', 'recovery', 'unionFee', 'loanRepayment'],
    'net.stepOrder': ['gross', 'exemptAndTaxable', 'insurance', 'pit', 'advance', 'otherDeductions', 'extraIncome'],
    'night.breakPremium': 0.3,
    'night.otAddRate': 0.2,
    'ot.afterMakeup': 'block',
    'ot.holidayRate': 3,
    'ot.nightAddScope': 'holidayOnly',
    'ot.rate': 1.5,
    'ot.weekendRate': 2,
    'pay.method': 'A',
    'pay.otHourlyDivisor': 'byMethod',
    'period.editPastMonths': 'untilLock',
    'period.editPastMonthsN': 2,
    'period.lateDeclaration': 'warn',
    'period.payDay': 10,
    'period.payDayMinGapDays': 0,
    'period.payDayOnHoliday': 'before',
    'period.reportDeadlineDay': 3,
    'request.type.approved.countsAbsent': true,
    'request.type.approved.pendingRule': 'unpaid',
    'request.type.approved.rejectedRule': 'unpaid',
    'request.type.holiday_work.countsAbsent': true,
    'request.type.holiday_work.pendingRule': 'drop',
    'request.type.holiday_work.rejectedRule': 'drop',
    'request.type.isat.countsAbsent': true,
    'request.type.isat.pendingRule': 'unpaid',
    'request.type.isat.rejectedRule': 'unpaid',
    'request.type.leave.countsAbsent': true,
    'request.type.leave.pendingRule': 'unpaid',
    'request.type.leave.rejectedRule': 'unpaid',
    'request.type.makeup_day.countsAbsent': true,
    'request.type.makeup_day.pendingRule': 'drop',
    'request.type.makeup_day.rejectedRule': 'drop',
    'request.type.makeup_hours.countsAbsent': true,
    'request.type.makeup_hours.pendingRule': 'strip',
    'request.type.makeup_hours.rejectedRule': 'strip',
    'request.type.ot.countsAbsent': true,
    'request.type.ot.pendingRule': 'strip',
    'request.type.ot.rejectedRule': 'strip',
    'request.type.willmakeup.countsAbsent': true,
    'request.type.willmakeup.pendingRule': 'unpaid',
    'request.type.willmakeup.rejectedRule': 'unpaid',
    'shift.allowance.basis': 'assigned',
    'shift.flex.bonus': 0.1,
    'shift.night.bonus': 0.3,
    'shift.preset.f1.in': '06:00',
    'shift.preset.f1.out': '15:00',
    'shift.preset.f2.in': '13:00',
    'shift.preset.f2.out': '22:00',
    'shift.preset.g1.in': '21:00',
    'shift.preset.g1.out': '06:00',
    'shift.preset.g2.in': '22:00',
    'shift.preset.g2.out': '07:00',
    'shift.preset.n1.in': '08:00',
    'shift.preset.n1.out': '17:00',
    'shift.preset.n2.in': '10:00',
    'shift.preset.n2.out': '19:00',
    'slip.staffVisibleFrom': 'afterPaid',
    'system.approval.maxDecideItems': 200,
    'system.attr.maxPerClass': 20,
    'system.audit.pageDefault': 50,
    'system.audit.pageMax': 200,
    'system.auth.adminPasswordMinProduction': 12,
    'system.auth.generatedPasswordBytes': 12,
    'system.auth.passMarkChars': 16,
    'system.auth.scryptKeyBytes': 64,
    'system.auth.scryptSaltBytes': 16,
    'system.auth.sessionSecretBytes': 32,
    'system.auth.trustProxyMaxHops': 10,
    'system.auth.usernameKeyChars': 80,
    'system.backup.keep': 30,
    'system.entries.labelMaxLength': 80,
    'system.entries.maxAmount': 100000000000,
    'system.entries.maxPerBatch': 200,
    'system.entries.requireApproval': true,
    'system.events.heartbeatSec': 25,
    'system.events.maxBacklogBytes': 262144,
    'system.events.maxPerUser': 5,
    'system.events.maxTotal': 3000,
    'system.events.retryMs': 3000,
    'system.http.maxBodyBytes': 1000000,
    'system.import.maxBytes': 5242880,
    'system.login.maxFailures': 5,
    'system.login.maxKeys': 5000,
    'system.login.sprayUsers': 30,
    'system.login.windowMin': 15,
    'system.page.approvals.default': 200,
    'system.page.approvals.max': 500,
    'system.page.corrections.default': 50,
    'system.page.corrections.max': 100,
    'system.page.payslips.default': 50,
    'system.page.payslips.max': 200,
    'system.params.maxChanges': 50,
    'system.params.previewMaxPeople': 50,
    'system.positions.max': 30,
    'system.positions.maxCopyKeys': 200,
    'system.reveal.maxPerHour': 30,
    'system.session.days': 14,
    'system.slipOverride.reasonRequired': false,
    'system.staff.bulkMax': 200,
    'tax.arise.mode': 'personalDeduction',
    'tax.brackets': [
      [10000000, 0.05],
      [30000000, 0.1],
      [60000000, 0.2],
      [100000000, 0.3],
      [null, 0.35]
    ],
    'tax.casual.rate': 0.1,
    'tax.casual.threshold': 5000000,
    'tax.casual.thresholdCompare': 'gte',
    'tax.contract.basis': 'tenure',
    'tax.deduction.dependant': 6200000,
    'tax.deduction.personal': 15500000,
    'tax.exempt.holidayRate': 3,
    'tax.exempt.nightPremium': 0.3,
    'tax.exempt.otMethod': 'byRate',
    'tax.exempt.otRate': 1.5,
    'tax.exempt.weekendRate': 2,
    'tax.insurance.capMultiple': 20,
    'tax.insurance.employee.bhtn': 0.01,
    'tax.insurance.employee.bhxh': 0.08,
    'tax.insurance.employee.bhyt': 0.015,
    'tax.insurance.employer.bhtn': 0.01,
    'tax.insurance.employer.bhxh': 0.175,
    'tax.insurance.employer.bhyt': 0.03,
    'tax.insurance.skipCompare': 'gte',
    'tax.insurance.skipDays': 14,
    'tax.longTermMonths': 3,
    'tax.method.long': 'progressive',
    'tax.method.short': 'flat',
    'tax.personalCompare': 'gt',
    'time.breakAfterWorkHours': 4,
    'time.breakHours': 1,
    'time.flexStartBeforeHour': 7,
    'time.maxSpanHours': 9,
    'time.nightEndHour': 6,
    'time.nightStartHour': 22,
    'time.workHoursPerDay': 8,
    'type.ctv.attendance': 0,
    'type.ctv.benefit.absenceDeclarable': true,
    'type.ctv.benefit.approvedLeave': false,
    'type.ctv.benefit.breakPay': true,
    'type.ctv.benefit.idorm': false,
    'type.ctv.benefit.isat': false,
    'type.ctv.benefit.kpi': true,
    'type.ctv.benefit.leaveAccount': true,
    'type.ctv.benefit.makeup': true,
    'type.ctv.benefit.makeupDay': true,
    'type.ctv.benefit.makeupHours': true,
    'type.ctv.benefit.ot': true,
    'type.ctv.benefit.paidHoliday': true,
    'type.ctv.benefit.paidLeave': true,
    'type.ctv.defaultContract': 'long',
    'type.ctv.dows': [1, 2, 3, 4, 5, 6],
    'type.ctv.flexBonus': 0.1,
    'type.ctv.kpiPass': 75,
    'type.ctv.probationPayPct': 1,
    'type.ctv.startDateRequired': true,
    'type.ctv.travel': 0,
    'type.ctv.workdays': 26,
    'type.ctv.workdaysMode': 'fixed',
    'type.nv.attendance': 0.25,
    'type.nv.benefit.absenceDeclarable': true,
    'type.nv.benefit.approvedLeave': true,
    'type.nv.benefit.breakPay': true,
    'type.nv.benefit.idorm': true,
    'type.nv.benefit.isat': true,
    'type.nv.benefit.kpi': true,
    'type.nv.benefit.leaveAccount': true,
    'type.nv.benefit.makeup': true,
    'type.nv.benefit.makeupDay': true,
    'type.nv.benefit.makeupHours': true,
    'type.nv.benefit.ot': true,
    'type.nv.benefit.paidHoliday': true,
    'type.nv.benefit.paidLeave': true,
    'type.nv.defaultContract': 'long',
    'type.nv.dows': [1, 2, 3, 4, 5, 6],
    'type.nv.flexBonus': 0.2,
    'type.nv.kpiPass': 75,
    'type.nv.maxAbsent': 3,
    'type.nv.nightOptions': [40, 60],
    'type.nv.probationPayPct': 1,
    'type.nv.startDateRequired': true,
    'type.nv.travel': 0.15,
    'type.nv.workdays': 26,
    'type.nv.workdaysMode': 'fixed',
    'type.tts.attendance': 0,
    'type.tts.benefit.absenceDeclarable': false,
    'type.tts.benefit.approvedLeave': false,
    'type.tts.benefit.breakPay': false,
    'type.tts.benefit.idorm': false,
    'type.tts.benefit.isat': false,
    'type.tts.benefit.kpi': false,
    'type.tts.benefit.leaveAccount': false,
    'type.tts.benefit.makeup': true,
    'type.tts.benefit.makeupDay': true,
    'type.tts.benefit.makeupHours': true,
    'type.tts.benefit.ot': false,
    'type.tts.benefit.paidHoliday': false,
    'type.tts.benefit.paidLeave': false,
    'type.tts.defaultContract': 'short',
    'type.tts.dows': [1, 2, 3, 4, 5],
    'type.tts.flexBonus': 0.1,
    'type.tts.probationPayPct': 1,
    'type.tts.startDateRequired': false,
    'type.tts.travel': 0,
    'type.tts.workdays': 22,
    'type.tts.workdaysMode': 'fixed',
    'unit.daysPerWeek': 7,
    'unit.minutesPerDay': 1440,
    'unit.minutesPerHour': 60,
    'unit.msPerDay': 86400000,
    'unit.msPerSecond': 1000,
    'unit.owedHoursEpsilon': 0.001,
    'unit.percent': 100,
    'unit.vnUtcOffsetMin': 420
  };
  /* GENERATED:END */

  /* ---------- thành phần giao diện (hợp đồng BE-UI: mỗi mục registry khai báo đúng một thành phần trong tập này) ---------- */
  // money: tiền (VND) · percent: phần trăm (có sàn, trần) · quantity: số lượng kèm đơn vị (phút, giờ, ngày, tháng, ngày dương lịch ...)
  // choice: chọn một trong các phương án (mỗi phương án có `available`) · toggle: bật/tắt, chỉ ở chỗ có lựa chọn Có/Không thật
  // table: lưới theo lược đồ cột · tierTable: bảng bậc (từ mức nào thì bao nhiêu) · conditions: điều kiện áp dụng (CHƯA bật)
  // formula: cây khối công thức (CHƯA bật) · fixed: chỉ đọc kèm lý do khoá · text: chữ, time: giờ HH:MM; cả hai chỉ dùng làm ô của bảng
  const UI_COMPONENTS = Object.freeze([
    'money',
    'percent',
    'quantity',
    'choice',
    'toggle',
    'table',
    'tierTable',
    'conditions',
    'formula',
    'fixed',
    'text',
    'time'
  ]);
  const UI_COMPONENTS_NOT_ENABLED = Object.freeze(['conditions', 'formula']);
  // Đơn vị hiển thị hợp lệ (ui.unit và cột của bảng)
  const UNITS = Object.freeze([
    'vnd',
    'ratio',
    'percentPoints',
    'minute',
    'hour',
    'day',
    'month',
    'yearMonth',
    'date',
    'times',
    'meter',
    'degree',
    'bytes',
    'count',
    'second',
    'millisecond'
  ]);
  const VALUE_TYPES = Object.freeze([
    'int',
    'number',
    'vnd',
    'bool',
    'enum',
    'month',
    'date',
    'intList',
    'stringList',
    'dateList',
    'brackets',
    'tiers',
    'table',
    'formula'
  ]);

  /* ---------- lớp tham số theo miền ---------- */
  const DOMAIN_CLASS = Object.freeze({
    period: 'PayParams',
    advance: 'PayParams',
    pay: 'PayParams',
    level: 'PayParams',
    type: 'PayParams',
    shift: 'PayParams',
    allowance: 'PayParams',
    formula: 'PayParams',
    position: 'PayParams', // định nghĩa chức vụ: position.def.<mã> (chức vụ là dữ liệu)
    block: 'PayParams', // định nghĩa khối phụ cấp: block.def.<mã>
    class: 'PayParams', // định nghĩa thuộc tính của lớp: class.level.attr.<mã>
    attendance: 'AttendanceParams',
    geofence: 'AttendanceParams',
    switch: 'AttendanceParams',
    time: 'AttendanceParams',
    leave: 'LeaveParams',
    isat: 'LeaveParams',
    holiday: 'LeaveParams',
    holidays: 'LeaveParams',
    ot: 'OtParams',
    night: 'OtParams',
    makeup: 'OtParams',
    kpi: 'KpiParams',
    tax: 'TaxParams',
    law: 'TaxParams',
    insurance: 'TaxParams',
    ai: 'AiParams',
    request: 'RequestParams',
    approval: 'RequestParams',
    employeeCode: 'ProfileParams',
    contract: 'ProfileParams',
    catalog: 'ProfileParams',
    slip: 'SlipParams',
    system: 'SystemParams',
    control: 'SystemParams',
    unit: 'InvariantParams',
    money: 'InvariantParams',
    net: 'InvariantParams'
  });
  const CLASS_NAMES = Object.freeze([
    'PayParams',
    'AttendanceParams',
    'LeaveParams',
    'OtParams',
    'KpiParams',
    'TaxParams',
    'AiParams',
    'RequestParams',
    'ProfileParams',
    'SlipParams',
    'SystemParams',
    'InvariantParams'
  ]);
  // Lớp của một khoá. Ngoại lệ: holiday.makeupRate thuộc OtParams; mọi `…Compare`, law.floor.*, law.ceiling.* là bất biến.
  function classOf(key?) {
    const parts = key.split('.');
    if (key === 'holiday.makeupRate') return 'OtParams';
    if (
      /Compare$/.test(parts[parts.length - 1]) ||
      (parts[0] === 'law' && (parts[1] === 'floor' || parts[1] === 'ceiling'))
    )
      return 'InvariantParams';
    return DOMAIN_CLASS[parts[0]] || null;
  }

  /* ---------- thuộc tính mở rộng của lớp ---------- */
  // Định nghĩa là khoá `class.level.attr.<mã>` mang { label, component, unit, min?, max?, default?, deprecated? }; giá trị theo hàng là
  // `level.<loại>.<bậc>.attr.<mã>`. Cả hai nằm trong bộ tham số của tháng như mọi khoá khác (không có mặc định trong DEFAULTS: chưa định nghĩa
  // thì không có gì). Một thuộc tính KHÔNG đổi tiền, trừ thuộc tính tiền mà `insurance.baseAttr` trỏ tới (nền bảo hiểm, src/engine/pay-tail-calc.ts).
  const ATTR_DEF_PREFIX = 'class.level.attr.';
  const ATTR_CODE_RE = /^[a-z][A-Za-z0-9]{0,31}$/;
  const ATTR_COMPONENTS = Object.freeze(['money', 'percent', 'quantity', 'toggle', 'text']);
  // Đơn vị chọn được cho kiểu "quantity"
  const ATTR_QUANTITY_UNITS = Object.freeze(['count', 'hour', 'day', 'minute', 'times', 'month']);
  // Các định nghĩa còn dùng trong một bộ tham số: [{ code, key, label, component, unit, min?, max?, default?, deprecated }] theo mã
  function attributeDefs(set?) {
    const out: any[] = [];
    for (const key of Object.keys(set || {})) {
      if (!key.startsWith(ATTR_DEF_PREFIX)) continue;
      const code = key.slice(ATTR_DEF_PREFIX.length);
      const def = set[key];
      if (ATTR_CODE_RE.test(code) && def && typeof def === 'object' && !Array.isArray(def))
        out.push({ ...def, code, key, deprecated: !!def.deprecated });
    }
    return out.sort((a: any, b: any) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  }
  // Giá trị của thuộc tính cho một hàng (loại, bậc): giá trị riêng nếu có, không thì mặc định của định nghĩa, không thì 0 / false / ''
  function attributeValue(set?, def?, type?, level?) {
    const own = set[`level.${type}.${level}.attr.${def.code}`];
    const value = own !== undefined && own !== null ? own : def.default;
    if (value !== undefined && value !== null) return value;
    return def.component === 'toggle' ? false : def.component === 'text' ? '' : 0;
  }

  /* ---------- quyền lợi của chức vụ ---------- */
  // Lỗi hồ sơ: mã chức vụ không có trong bảng tham số (shownType là mã đã rút gọn để đưa vào thông báo)
  const badType = (shownType?) =>
    Object.assign(new Error(`Loại nhân sự ${shownType} không có trong bảng tham số; sửa loại trong hồ sơ nhân sự`), {
      code: 'PAYROLL_BAD_TYPE',
      field: 'type'
    });
  // Mã chức vụ của một người trong bảng loại của bộ tham số (TYPES do bộ máy dựng); mã lạ hoặc sai kiểu ném PAYROLL_BAD_TYPE
  const typeKeyOf = (types?, staff?, shown?) => {
    if (staff && typeof staff.type === 'string' && Object.hasOwn(types, staff.type)) return staff.type;
    throw badType(shown(staff && staff.type));
  };
  // Ghi đè theo chức vụ của một tham số toàn cục: type.<mã>.<đuôi> → khoá toàn cục; null = kế thừa
  const OVERRIDES = Object.freeze({
    'ot.rate': 'ot.rate',
    'ot.weekendRate': 'ot.weekendRate',
    advanceRate: 'advance.rate',
    overLimitHours: 'attendance.overLimitHours'
  });
  // MỘT hàm đọc: ghi đè theo chức vụ type.<mã>.<đuôi> (khác null) → khoá toàn cục (đuôi, hoặc khoá của OVERRIDES) → mặc định của mã
  // (bộ tham số chụp trước khi có cờ mới vẫn đọc được vì ba chức vụ mặc định có mặc định trong DEFAULTS); không có gì thì undefined
  function entitlement(set?, type?, tail?) {
    const key = `type.${type}.${tail}`;
    if (Object.hasOwn(set, key) && set[key] !== null) return set[key];
    const global = OVERRIDES[tail] || tail;
    if (Object.hasOwn(set, global)) return set[global];
    return Object.hasOwn(DEFAULTS, key) ? DEFAULTS[key] : undefined;
  }
  // Bộ tham số của MỘT chức vụ: bộ tháng với các khoá toàn cục thay bằng ghi đè của chức vụ. Không có ghi đè nào thì trả đúng bộ tháng (cùng đối tượng,
  // nên tiền và nhân của bộ máy không đổi); có thì nhớ một bản cho mỗi chức vụ.
  const overlays = new WeakMap<any, any>();
  function overlay(set?, type?) {
    const patch: Record<string, any> = {};
    for (const [tail, key] of Object.entries(OVERRIDES)) {
      const own = `type.${type}.${tail}`;
      if (Object.hasOwn(set, own) && set[own] !== null) patch[key] = set[own];
    }
    if (!Object.keys(patch).length) return set;
    if (!overlays.has(set)) overlays.set(set, new Map());
    const byType = overlays.get(set);
    if (!byType.has(type)) byType.set(type, Object.freeze({ ...set, ...patch }));
    return byType.get(type);
  }

  /* ---------- bộ tham số chụp TRƯỚC khi có khoá mới (verify, tính lại kỳ cũ) ---------- */
  // Khoá thêm sau (phương án bảo hiểm và thuế, chức vụ, khối, lịch, tạm ứng và làm bù): `payroll_runs.params_json` chụp trước khi có chúng thì thiếu.
  // Khoá thiếu trong bản chụp cũ đọc bằng MẶC ĐỊNH (đúng hành vi lúc chụp), không ném PARAM_MISSING; bộ máy gọi fillLate lúc dựng nhân và lúc tính một tháng. Danh sách CHỈ thêm khi có khoá mới của một đợt phát hành; khoá của mọi đợt trước giữ nguyên là bắt buộc (thiếu là lỗi).
  const LATE_KEYS = Object.freeze(
    `
    insurance.baseAttr insurance.coverage.long
    insurance.coverage.short insurance.floorMode
    system.entries.labelMaxLength system.entries.maxAmount system.entries.maxPerBatch
    system.entries.requireApproval system.positions.max system.positions.maxCopyKeys tax.arise.mode
    tax.exempt.otMethod tax.method.long tax.method.short type.ctv.benefit.absenceDeclarable
    type.ctv.benefit.approvedLeave type.ctv.benefit.leaveAccount type.ctv.defaultContract
    type.ctv.startDateRequired type.ctv.workdaysMode type.nv.benefit.absenceDeclarable
    type.nv.benefit.approvedLeave type.nv.benefit.leaveAccount type.nv.defaultContract type.nv.startDateRequired
    type.nv.workdaysMode type.tts.benefit.absenceDeclarable type.tts.benefit.approvedLeave
    type.tts.benefit.leaveAccount type.tts.defaultContract type.tts.startDateRequired type.tts.workdaysMode
    type.tts.benefit.makeupHours type.tts.benefit.makeupDay type.ctv.benefit.makeupHours type.ctv.benefit.makeupDay type.nv.benefit.makeupHours type.nv.benefit.makeupDay type.tts.benefit.idorm type.ctv.benefit.idorm type.nv.benefit.idorm request.type.approved.countsAbsent request.type.holiday_work.countsAbsent request.type.isat.countsAbsent request.type.leave.countsAbsent request.type.makeup_day.countsAbsent request.type.makeup_hours.countsAbsent request.type.ot.countsAbsent request.type.willmakeup.countsAbsent request.type.willmakeup.pendingRule request.type.willmakeup.rejectedRule
    law.floor.weekendOtRate ot.weekendRate tax.exempt.weekendRate
  `
      .trim()
      .split(/\s+/)
  );
  const fills = new WeakMap<any, any>();
  function fillLate(set?) {
    if (!fills.has(set)) {
      const missing = LATE_KEYS.filter(key => !Object.hasOwn(set, key));
      fills.set(
        set,
        missing.length
          ? Object.freeze({
              ...set,
              ...Object.fromEntries(missing.map(key => [key, clone(DEFAULTS[key])]))
            })
          : set
      );
    }
    return fills.get(set);
  }

  /* ---------- tiện ích ---------- */
  const clone = (value?) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
  function deepFreeze(value?) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const item of Object.values(value)) deepFreeze(item);
    }
    return value;
  }
  // Chuỗi chuẩn hoá (khoá sắp xếp) để băm: máy chủ băm bằng node:crypto, ở đây không có thư viện băm
  function canonical(value?) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object')
      return (
        '{' +
        Object.keys(value)
          .sort()
          .map(k => JSON.stringify(k) + ':' + canonical(value[k]))
          .join(',') +
        '}'
      );
    return JSON.stringify(value === undefined ? null : value);
  }
  const month = (text?) => (typeof text === 'string' ? text.slice(0, 7) : '');

  /* ---------- hợp nhất theo tháng ---------- */
  // rows: [{ id, key, effectiveMonth, value }] (store.params.resolvedRows hoặc toàn bộ dòng). Giá trị hiệu lực của khoá k cho tháng M là dòng
  // có effectiveMonth <= M lớn nhất, hoà thì id lớn nhất; không có dòng thì mặc định. Trả bộ tham số phẳng đã đóng băng, cùng tập khoá với DEFAULTS
  // (cộng khoá có dòng nhưng chưa có mặc định, nếu người gọi đã lọc khoá hợp lệ ở registry).
  function resolveParamSet(rows?, forMonth?) {
    const target = month(forMonth);
    if (!/^\d{4}-\d{2}$/.test(target)) throw new TypeError('Tháng phải có dạng YYYY-MM');
    const best = new Map<any, any>();
    for (const row of rows || []) {
      if (!row || typeof row.key !== 'string' || month(row.effectiveMonth) > target) continue;
      const have = best.get(row.key);
      if (
        !have ||
        row.effectiveMonth > have.effectiveMonth ||
        (row.effectiveMonth === have.effectiveMonth && (row.id || 0) > (have.id || 0))
      )
        best.set(row.key, row);
    }
    const set = clone(DEFAULTS);
    for (const [key, row] of best) set[key] = clone(row.value);
    return deepFreeze(set);
  }

  /* ---------- lớp tham số có kiểu ---------- */
  function put(tree?, key?, value?) {
    const parts = key.split('.');
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) node[parts[i]] = {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = value;
  }
  // Giá trị dẫn xuất (trần đóng BH = 20 lần, miễn thuế giờ đêm ngày lễ): cùng giá trị với TAX_RULES.
  // Làm tròn theo unit.percent để 0,3 + 0,2 × 3 ra đúng 0,9 (không phải 0,8999999999999999).
  function derive(set?) {
    const percent = set['unit.percent'];
    const roundPct = (x?) => Math.round(x * percent) / percent;
    const multiple = set['tax.insurance.capMultiple'];
    const regionWage = set['law.regionMinWage.' + set['law.region']];
    return {
      insuranceCap: {
        bhxh: set['law.luongCoSo'] * multiple,
        bhyt: set['law.luongCoSo'] * multiple,
        bhtn: regionWage == null ? null : regionWage * multiple
      },
      // phụ trội giờ đêm ngày lễ của tiền công: night.otAddRate × ot.holidayRate (0,2 × 3 = 0,6)
      holidayNightRate: roundPct(set['night.otAddRate'] * set['ot.holidayRate']),
      holidayNightAdd: roundPct(
        roundPct(set['tax.exempt.nightPremium']) + roundPct(set['night.otAddRate']) * set['tax.exempt.holidayRate']
      )
    };
  }
  // Cây theo lớp: classes.PayParams.level.nv[2].base, classes.TaxParams.tax.insurance.employee.bhxh ...
  // Trần bậc thuế cuối lưu null được đổi lại thành Infinity ở đây.
  function buildParamClasses(set?) {
    const classes: Record<string, any> = {};
    for (const name of CLASS_NAMES) classes[name] = {};
    for (const [key, value] of Object.entries(set)) {
      const name = classOf(key);
      if (!name) throw new Error(`Khoá ${key} không thuộc lớp tham số nào`);
      put(
        classes[name],
        key,
        key === 'tax.brackets'
          ? (value as any[]).map(([cap, rate]: any) => [cap === null ? Infinity : cap, rate])
          : clone(value)
      );
    }
    const derived = derive(set);
    classes.TaxParams.tax.insurance.cap = derived.insuranceCap;
    classes.TaxParams.tax.exempt.holidayNightAdd = derived.holidayNightAdd;
    classes.derived = derived;
    return deepFreeze(classes);
  }

  return {
    DEFAULTS,
    UI_COMPONENTS,
    UI_COMPONENTS_NOT_ENABLED,
    UNITS,
    VALUE_TYPES,
    CLASS_NAMES,
    DOMAIN_CLASS,
    classOf,
    ATTR_DEF_PREFIX,
    ATTR_CODE_RE,
    ATTR_COMPONENTS,
    ATTR_QUANTITY_UNITS,
    attributeDefs,
    attributeValue,
    OVERRIDES,
    entitlement,
    fillLate,
    LATE_KEYS,
    overlay,
    typeKeyOf,
    resolveParamSet,
    buildParamClasses,
    derive,
    canonical,
    clone
  };
});
