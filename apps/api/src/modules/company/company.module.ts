/**
 * @email-gateway/api - Company Module
 *
 * TASK-036: Module para gerenciamento de empresas
 */

import { Module } from '@nestjs/common';
import { CompanyController } from './controllers/company.controller';
import { CompanyService } from './services/company.service';

@Module({
  controllers: [CompanyController],
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
