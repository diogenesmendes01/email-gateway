import { IsOptional, IsString } from 'class-validator';

export class StartOnboardingDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
