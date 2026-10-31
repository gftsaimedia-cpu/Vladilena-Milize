import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller';

/** Hồ sơ nhân sự: danh sách, nhóm, tạo/sửa, vai trò gán cho tài khoản, đặt lại mật khẩu của người khác. */
@Module({ controllers: [StaffController] })
export class StaffModule {}
