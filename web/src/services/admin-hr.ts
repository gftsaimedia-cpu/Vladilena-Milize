// Dịch vụ màn Nhân sự trên dữ liệu giả (mock/staff.ts): chỉ đọc, không gọi máy chủ.
import { staffListView, staffProfile, type StaffListView, type StaffProfile } from '@/mock/staff';
import { respond } from '@/mock/respond';

/** Danh sách nhân sự: 4 thẻ chỉ số, tổng số hồ sơ và 10 dòng đầu. */
export const getStaffList = (): Promise<StaffListView> => respond(staffListView());

/** Hồ sơ một người theo id chữ không dấu nối gạch; null nếu không có người này. */
export const getStaffProfile = (id: string): Promise<StaffProfile | null> => respond(staffProfile(id));
