/**
 * @email-gateway/api - Domain Management DTOs
 *
 * DTOs para gerenciamento de domínios, DNS e configurações SES
 *
 * TASK 6.2 — SES, domínio e DNS (SPF/DKIM)
 */

import { IsString, IsNumber, IsOptional, IsBoolean, IsDateString, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Status de verificação de domínio
 */
export enum DomainVerificationStatus {
  PENDING = 'PendingVerification',
  SUCCESS = 'Success',
  FAILED = 'Failed',
  TEMPORARY_FAILURE = 'TemporaryFailure',
}

/**
 * Status de verificação de DKIM
 */
export enum DKIMVerificationStatus {
  NOT_STARTED = 'NotStarted',
  PENDING = 'Pending',
  SUCCESS = 'Success',
  FAILED = 'Failed',
}

/**
 * Registro DNS
 */
export class DNSRecord {
  @ApiProperty({ description: 'Tipo do registro DNS', example: 'TXT' })
  @IsString()
  type: 'TXT' | 'CNAME' | 'MX';

  @ApiProperty({ description: 'Nome do registro', example: '_amazonses.example.com' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Valor do registro', example: 'verification-token' })
  @IsString()
  value: string;

  @ApiPropertyOptional({ description: 'TTL do registro', example: 300 })
  @IsOptional()
  @IsNumber()
  ttl?: number;
}

/**
 * Request para adicionar domínio
 */
export class DomainVerificationRequest {
  @ApiProperty({ description: 'Nome do domínio', example: 'example.com' })
  @IsString()
  domain: string;

  @ApiPropertyOptional({ description: 'Habilitar DKIM automaticamente', example: true })
  @IsOptional()
  @IsBoolean()
  enableDKIM?: boolean;
}

/**
 * Response de verificação de domínio
 */
export class DomainVerificationResponse {
  @ApiProperty({ description: 'Nome do domínio', example: 'example.com' })
  domain: string;

  @ApiProperty({ description: 'Status de verificação', enum: DomainVerificationStatus })
  status: DomainVerificationStatus;

  @ApiPropertyOptional({ description: 'Token de verificação' })
  verificationToken?: string;

  @ApiProperty({ description: 'Registros DNS necessários', type: [DNSRecord] })
  dnsRecords: DNSRecord[];

  @ApiPropertyOptional({ description: 'Tokens DKIM' })
  dkimTokens?: string[];

  @ApiPropertyOptional({ description: 'Status DKIM', enum: DKIMVerificationStatus })
  dkimStatus?: DKIMVerificationStatus;

  @ApiPropertyOptional({ description: 'Data da última verificação' })
  lastChecked?: string;

  @ApiPropertyOptional({ description: 'Mensagem de erro' })
  errorMessage?: string;
}

/**
 * Response de registros DNS
 */
export class DNSRecordsResponse {
  @ApiProperty({ description: 'Nome do domínio', example: 'example.com' })
  domain: string;

  @ApiProperty({ description: 'Registros DNS necessários', type: [DNSRecord] })
  records: DNSRecord[];

  @ApiPropertyOptional({ description: 'Registros DNS ausentes', type: [DNSRecord] })
  missingRecords?: DNSRecord[];

  @ApiPropertyOptional({ description: 'Registros DNS incorretos', type: [DNSRecord] })
  incorrectRecords?: DNSRecord[];

  @ApiProperty({ description: 'Se os registros DNS estão válidos', example: false })
  isValid: boolean;

  @ApiPropertyOptional({ description: 'Mensagem de erro' })
  errorMessage?: string;
}

/**
 * Response de status da quota SES
 */
export class SESQuotaStatusResponse {
  @ApiProperty({ description: 'Quota máxima de envio em 24h', example: 200 })
  max24HourSend: number;

  @ApiProperty({ description: 'Taxa máxima de envio por segundo', example: 14 })
  maxSendRate: number;

  @ApiProperty({ description: 'Emails enviados nas últimas 24h', example: 150 })
  sentLast24Hours: number;

  @ApiProperty({ description: 'Percentual de quota usada', example: 75.0 })
  percentageUsed: number;

  @ApiProperty({ description: 'Se está próximo do limite', example: false })
  isNearLimit: boolean;

  @ApiProperty({ description: 'Região AWS', example: 'us-east-1' })
  region: string;

  @ApiPropertyOptional({ description: 'Espaço disponível restante', example: 50 })
  remainingQuota?: number;

  @ApiPropertyOptional({ description: 'Data da última atualização' })
  lastUpdated?: string;
}

/**
 * Request para configuração de warm-up
 */
export class WarmupConfigRequest {
  @ApiProperty({ description: 'Volume diário inicial', example: 100 })
  @IsNumber()
  @Min(1)
  @Max(10000)
  dailyVolume: number;

  @ApiProperty({ description: 'Data de início do warm-up' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'Duração do warm-up em dias', example: 30 })
  @IsNumber()
  @Min(1)
  @Max(90)
  durationDays: number;

  @ApiProperty({ description: 'Percentual de incremento diário', example: 20 })
  @IsNumber()
  @Min(5)
  @Max(100)
  incrementPercentage: number;
}

/**
 * Response de configuração de warm-up
 */
export class WarmupConfigResponse {
  @ApiProperty({ description: 'Nome do domínio', example: 'example.com' })
  domain: string;

  @ApiProperty({ description: 'Configuração de warm-up aplicada' })
  config: WarmupConfigRequest;

  @ApiProperty({ description: 'Se o warm-up foi configurado com sucesso', example: true })
  success: boolean;

  @ApiPropertyOptional({ description: 'Mensagem de erro' })
  errorMessage?: string;
}

/**
 * Item do checklist
 */
export class ChecklistItem {
  @ApiProperty({ description: 'ID do item', example: 'domain-verification' })
  id: string;

  @ApiProperty({ description: 'Descrição do item', example: 'Verificar se todos os domínios estão verificados' })
  description: string;

  @ApiProperty({ description: 'Status do item', example: 'pending' })
  status: 'pending' | 'completed' | 'failed';

  @ApiProperty({ description: 'Prioridade do item', example: 'high' })
  priority: 'high' | 'medium' | 'low';

  @ApiPropertyOptional({ description: 'Data de conclusão' })
  completedAt?: string;

  @ApiPropertyOptional({ description: 'Observações' })
  notes?: string;
}

/**
 * Response do checklist de sandbox para produção
 */
export class SandboxChecklistResponse {
  @ApiProperty({ description: 'Itens do checklist', type: [ChecklistItem] })
  items: ChecklistItem[];

  @ApiProperty({ description: 'Percentual de conclusão', example: 25.0 })
  completionPercentage: number;

  @ApiProperty({ description: 'Itens pendentes', example: 6 })
  pendingItems: number;

  @ApiProperty({ description: 'Itens concluídos', example: 2 })
  completedItems: number;

  @ApiProperty({ description: 'Itens com falha', example: 0 })
  failedItems: number;
}

/**
 * Response de validação de região
 */
export class RegionValidationResponse {
  @ApiProperty({ description: 'Região validada', example: 'us-east-1' })
  region: string;

  @ApiProperty({ description: 'Se a região é válida', example: true })
  isValid: boolean;

  @ApiProperty({ description: 'Se a região é recomendada', example: true })
  isRecommended: boolean;

  @ApiPropertyOptional({ description: 'Informações de quota da região' })
  quotaInfo?: SESQuotaStatusResponse;

  @ApiPropertyOptional({ description: 'Mensagem de erro' })
  errorMessage?: string;
}

/**
 * Response de lista de domínios
 */
export class DomainListResponse {
  @ApiProperty({ description: 'Lista de domínios', type: [DomainVerificationResponse] })
  domains: DomainVerificationResponse[];

  @ApiProperty({ description: 'Total de domínios', example: 5 })
  total: number;

  @ApiProperty({ description: 'Domínios verificados', example: 3 })
  verified: number;

  @ApiProperty({ description: 'Domínios pendentes', example: 2 })
  pending: number;

  @ApiProperty({ description: 'Domínios com falha', example: 0 })
  failed: number;
}
