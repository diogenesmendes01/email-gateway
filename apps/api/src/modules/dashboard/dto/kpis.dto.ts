import { IsOptional, IsString, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

export class GetKPIsDto {
  @IsOptional()
  @IsString()
  @IsIn(['hour', 'day', 'week', 'month', 'today'], {
    message: 'Period must be one of: hour, day, week, month, today'
  })
  period?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  companyId?: string;
}

export class GetEmailsDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  externalId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  emailHash?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  cpfCnpjHash?: string;

  @IsOptional()
  @IsString()
  @IsIn(['SENT', 'FAILED', 'PENDING'], {
    message: 'Status must be one of: SENT, FAILED, PENDING'
  })
  status?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  dateFrom?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  dateTo?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  companyId?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number;

  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'sentAt', 'status', 'attempts', 'durationMs'], {
    message: 'Sort by must be one of: createdAt, sentAt, status, attempts, durationMs'
  })
  sortBy?: string;

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'], {
    message: 'Sort order must be one of: asc, desc'
  })
  sortOrder?: string;
}

export class GetErrorBreakdownDto {
  @IsOptional()
  @IsString()
  @IsIn(['hour', 'day', 'week', 'month', 'today'], {
    message: 'Period must be one of: hour, day, week, month, today'
  })
  period?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  companyId?: string;
}

export class ExportEmailsDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  externalId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  emailHash?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  cpfCnpjHash?: string;

  @IsOptional()
  @IsString()
  @IsIn(['SENT', 'FAILED', 'PENDING'], {
    message: 'Status must be one of: SENT, FAILED, PENDING'
  })
  status?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  dateFrom?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  dateTo?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  companyId?: string;
}
