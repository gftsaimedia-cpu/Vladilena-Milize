import { Module } from '@nestjs/common';
import { DepartmentsController } from './departments.controller';
import { DepartmentsRepository } from './departments.repository';
import { DepartmentsService } from './departments.service';
import { StaffDirectory } from './staff-directory';

@Module({
  controllers: [DepartmentsController],
  providers: [DepartmentsService, DepartmentsRepository, StaffDirectory],
  exports: [DepartmentsService, StaffDirectory]
})
export class DepartmentsModule {}
