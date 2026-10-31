import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';

/** Đăng nhập, đăng xuất, hồ sơ phiên (/me), đổi mật khẩu của chính mình. */
@Module({ controllers: [AuthController] })
export class AuthModule {}
