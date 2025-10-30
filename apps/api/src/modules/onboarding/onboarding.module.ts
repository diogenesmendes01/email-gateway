import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { DKIMGeneratorService } from './dkim-generator.service';
import { DNSVerifierService } from './dns-verifier.service';
import { DNSCheckerService } from './dns-checker.service';
import { ChecklistGeneratorService } from './checklist-generator.service';
import { ProductionReadinessService } from './production-readiness.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [OnboardingController],
  providers: [
    DKIMGeneratorService,
    DNSVerifierService,
    DNSCheckerService,
    ChecklistGeneratorService,
    ProductionReadinessService,
  ],
  exports: [
    DKIMGeneratorService,
    DNSVerifierService,
    DNSCheckerService,
    ChecklistGeneratorService,
    ProductionReadinessService,
  ],
})
export class OnboardingModule {}
