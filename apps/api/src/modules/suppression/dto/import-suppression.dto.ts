import { IsArray, IsEnum, IsOptional, IsString, MaxLength, ArrayMinSize } from 'class-validator';
import { SuppressionReason } from '@email-gateway/database';

export class ImportSuppressionDto {
  @IsArray()
  @ArrayMinSize(1)
  emails!: string[];
  
  @IsEnum(SuppressionReason)
  reason!: SuppressionReason;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;
}
