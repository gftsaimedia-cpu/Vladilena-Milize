'use strict';
const CalendarRules = require('../engine/payroll-calendar');

const NOTE_MAX = 300; // lý do duyệt / từ chối
const USERNAME_RE = /^[a-z0-9._-]{2,40}$/;
const validMonth = CalendarRules.isValidMonth; // kiểm dạng tháng, ngày: không có số nào đến từ tham số
const validDate = CalendarRules.isValidDate;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const positiveId = (value?) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export = { validMonth, validDate, USERNAME_RE, TIME_RE, NOTE_MAX, positiveId };
