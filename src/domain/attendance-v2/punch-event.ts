import { randomUUID } from 'node:crypto';
import { GeoLocation, GeoLocationProps, GeoLocationDTO } from './geo-location';

export type PunchType = 'IN' | 'OUT';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface PunchEventProps {
  id: string;
  employeeId: string;
  punchedAt: Date | string;
  workDate: string;
  type: PunchType;
  userLocation: GeoLocation | GeoLocationProps;
  distanceMeters: number;
  isWithinOffice: boolean;
  note?: string | null;
}

export interface CreatePunchEventProps {
  id?: string;
  employeeId: string;
  punchedAt?: Date | string;
  workDate: string;
  type: PunchType;
  userLocation: GeoLocation | GeoLocationProps;
  officeLocation?: GeoLocation;
  allowedRadiusMeters?: number;
  distanceMeters?: number;
  isWithinOffice?: boolean;
  note?: string | null;
}

export interface PunchEventRow {
  id: string;
  employee_id: string;
  punched_at: string;
  work_date: string;
  type: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  distance_meters: number;
  is_within_office: boolean;
  note: string | null;
}

export interface PunchEventDTO {
  id: string;
  employeeId: string;
  punchedAt: string;
  workDate: string;
  type: PunchType;
  userLocation: GeoLocationDTO;
  distanceMeters: number;
  isWithinOffice: boolean;
  note: string | null;
}

export class PunchEvent {
  readonly id: string;
  readonly employeeId: string;
  readonly punchedAt: Date;
  readonly workDate: string;
  readonly type: PunchType;
  readonly userLocation: GeoLocation;
  readonly distanceMeters: number;
  readonly isWithinOffice: boolean;
  readonly note: string | null;

  constructor(props: PunchEventProps) {
    if (!props || typeof props !== 'object') {
      throw new Error('Thông số PunchEvent không được để trống');
    }

    if (!props.id || !UUID_REGEX.test(props.id)) {
      throw new Error(`Mã PunchEvent (id) không hợp lệ (cần UUID): ${props.id}`);
    }

    if (!props.employeeId || !UUID_REGEX.test(props.employeeId)) {
      throw new Error(`Mã nhân viên (employeeId) không hợp lệ (cần UUID): ${props.employeeId}`);
    }

    const punchedDate = props.punchedAt instanceof Date ? props.punchedAt : new Date(props.punchedAt);
    if (isNaN(punchedDate.getTime())) {
      throw new Error(`Thời điểm chấm công (punchedAt) không hợp lệ: ${props.punchedAt}`);
    }

    if (!props.workDate || !DATE_REGEX.test(props.workDate)) {
      throw new Error(`Ngày công (workDate) không hợp lệ (YYYY-MM-DD): ${props.workDate}`);
    }

    if (props.type !== 'IN' && props.type !== 'OUT') {
      throw new Error(`Loại chấm công (type) phải là 'IN' hoặc 'OUT': ${props.type}`);
    }

    if (!props.userLocation) {
      throw new Error('Toạ độ chấm công (userLocation) không được để trống');
    }

    const location =
      props.userLocation instanceof GeoLocation ? props.userLocation : new GeoLocation(props.userLocation);

    if (
      typeof props.distanceMeters !== 'number' ||
      !Number.isFinite(props.distanceMeters) ||
      props.distanceMeters < 0
    ) {
      throw new Error('Khoảng cách (distanceMeters) phải là số không âm');
    }

    this.id = props.id;
    this.employeeId = props.employeeId;
    this.punchedAt = punchedDate;
    this.workDate = props.workDate;
    this.type = props.type;
    this.userLocation = location;
    this.distanceMeters = props.distanceMeters;
    this.isWithinOffice = Boolean(props.isWithinOffice);
    this.note = props.note != null ? String(props.note).trim() || null : null;
  }

  static create(props: CreatePunchEventProps): PunchEvent {
    const id = props.id ?? randomUUID();
    const punchedAt = props.punchedAt
      ? props.punchedAt instanceof Date
        ? props.punchedAt
        : new Date(props.punchedAt)
      : new Date();
    const userLocation =
      props.userLocation instanceof GeoLocation ? props.userLocation : new GeoLocation(props.userLocation);

    let distanceMeters = props.distanceMeters;
    let isWithinOffice = props.isWithinOffice;

    if (props.officeLocation && props.allowedRadiusMeters !== undefined) {
      const dist = userLocation.calculateDistanceMeters(props.officeLocation);
      distanceMeters = Math.round(dist * 10) / 10;
      isWithinOffice = dist <= props.allowedRadiusMeters;
    }

    if (distanceMeters === undefined || isWithinOffice === undefined) {
      throw new Error('Cần cung cấp distanceMeters và isWithinOffice hoặc officeLocation và allowedRadiusMeters');
    }

    return new PunchEvent({
      id,
      employeeId: props.employeeId,
      punchedAt,
      workDate: props.workDate,
      type: props.type,
      userLocation,
      distanceMeters,
      isWithinOffice,
      note: props.note
    });
  }

  /**
   * Kiểm tra tính hợp lệ của sự kiện chấm công (nằm trong vùng văn phòng và toạ độ hợp lệ)
   */
  isValid(): boolean {
    return (
      this.isWithinOffice &&
      Number.isFinite(this.distanceMeters) &&
      this.distanceMeters >= 0 &&
      !isNaN(this.punchedAt.getTime())
    );
  }

  toRow(): PunchEventRow {
    return {
      id: this.id,
      employee_id: this.employeeId,
      punched_at: this.punchedAt.toISOString(),
      work_date: this.workDate,
      type: this.type,
      latitude: this.userLocation.latitude,
      longitude: this.userLocation.longitude,
      accuracy_meters: this.userLocation.accuracyMeters,
      distance_meters: this.distanceMeters,
      is_within_office: this.isWithinOffice,
      note: this.note
    };
  }

  static fromRow(row: PunchEventRow): PunchEvent {
    if (!row || typeof row !== 'object') {
      throw new Error('Dữ liệu row PunchEvent không hợp lệ');
    }

    return new PunchEvent({
      id: row.id,
      employeeId: row.employee_id,
      punchedAt: new Date(row.punched_at),
      workDate: row.work_date,
      type: row.type as PunchType,
      userLocation: new GeoLocation({
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        accuracyMeters: Number(row.accuracy_meters ?? 0)
      }),
      distanceMeters: Number(row.distance_meters),
      isWithinOffice: Boolean(row.is_within_office),
      note: row.note ?? null
    });
  }

  toJSON(): PunchEventDTO {
    return {
      id: this.id,
      employeeId: this.employeeId,
      punchedAt: this.punchedAt.toISOString(),
      workDate: this.workDate,
      type: this.type,
      userLocation: this.userLocation.toJSON(),
      distanceMeters: this.distanceMeters,
      isWithinOffice: this.isWithinOffice,
      note: this.note
    };
  }
}
