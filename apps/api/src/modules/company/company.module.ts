/**
 * @email-gateway/api - Company Module
 *
 * TASK-036: Module para gerenciamento de empresas
 * TASK-037: Added profile management
 */

import { Module } from '@nestjs/common';
import { CompanyController } from './controllers/company.controller';
import { ProfileController } from './controllers/profile.controller'; // TASK-037
import { CompanyService } from './services/company.service';
import { AuthModule } from '../auth/auth.module'; // TASK-037: Required for ApiKeyGuard

@Module({
  imports: [AuthModule], // TASK-037: Import AuthModule for authentication guards
  controllers: [CompanyController, ProfileController], // TASK-037: Added ProfileController
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
