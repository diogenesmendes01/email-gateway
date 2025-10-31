import { IsString, IsOptional, IsBoolean, IsInt, IsEnum, IsObject, Min } from 'class-validator';
import { EmailProvider } from '@prisma/client';

export class CreateProviderDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsEnum(EmailProvider)
  provider!: EmailProvider;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsObject()
  config!: Record<string, any>;

  @IsOptional()
  @IsString()
  ipPoolId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxPerSecond?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxPerMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxPerHour?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxPerDay?: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
