/**
 * Create Recipient DTO
 *
 * Validates input for creating a new recipient
 */

import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateRecipientDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$|^\d{14}$/, {
    message: 'CPF must be 11 digits or CNPJ must be 14 digits',
  })
  cpfCnpj?: string;
}
