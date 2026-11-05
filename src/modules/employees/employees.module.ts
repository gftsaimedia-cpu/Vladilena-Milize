import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance';
import { EmployeesRepository } from './employees.repository';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';

@Module({
  imports: [AttendanceModule],
  controllers: [EmployeesController],
  providers: [EmployeesRepository, EmployeesService],
  exports: [EmployeesService, EmployeesRepository],
})
export class EmployeesModule {}
