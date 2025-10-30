import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SuppressionReason } from '@certshift/database';

export class AddSuppressionDto {
  @IsEmail()
  email: string;

  @IsEnum(SuppressionReason)
  reason: SuppressionReason;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  bounceType?: string;

  @IsOptional()
  @IsString()
  diagnosticCode?: string;

  @IsOptional()
  expiresAt?: Date;
}
