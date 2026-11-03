import { Module } from '@nestjs/common';
import { EmployeeV2Controller } from './employee-v2.controller';
import { EmployeeV2Service } from './employee-v2.service';

@Module({
  controllers: [EmployeeV2Controller],
  providers: [EmployeeV2Service],
  exports: [EmployeeV2Service]
})
export class EmployeeV2Module {}
