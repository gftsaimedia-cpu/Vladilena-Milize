import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';

/** Tra nhân viên theo uuid và truy vết nhật ký. */
@Module({ controllers: [EmployeesController] })
export class EmployeesModule {}
