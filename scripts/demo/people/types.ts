// Kiểu dữ liệu của danh sách người trong DB demo. Module thuần: test Playwright cũng import được.

export type Area = 'staff' | 'attendance' | 'requests' | 'payroll';
export type PersonArea = Area | 'smoke';

/** Thứ tự seed: staff → attendance → requests → payroll. */
export const AREAS: Area[] = ['staff', 'attendance', 'requests', 'payroll'];

/** Tiền tố username của mỗi mảng, để các phiên không đặt trùng tên nhau. */
export const AREA_PREFIX: Record<PersonArea, string> = {
  smoke: 'smoke-',
  staff: 'ns-',
  attendance: 'cc-',
  requests: 'dt-',
  payroll: 'lg-'
};

export interface DemoPerson {
  /** Viết thường, có tiền tố của mảng, ví dụ `cc-binh`. */
  username: string;
  familyName: string;
  givenName: string;
  /** Mảng sở hữu người này: chỉ seed và test của mảng đó được sửa dữ liệu của họ. */
  area: PersonArea;
  /** Ngày vào làm: ngày `day` của tháng (tháng này + `monthOffset`), ví dụ { monthOffset: -2, day: 1 }. */
  start: { monthOffset: number; day: number };
  /** Phần `contract` gửi lên POST /api/v2/employees, chưa có `effectiveFrom` (phần nền tự điền từ `start`). */
  contract: Record<string, unknown> & { status: string; position: { type: string; level: number } };
  /** Trường thêm vào thân POST /api/v2/employees (ghi đè lên bản mặc định), nếu mảng cần. */
  extra?: Record<string, unknown>;
  /** Người này dùng để thử điều gì; hiện trong tài liệu của mảng. */
  note: string;
}
