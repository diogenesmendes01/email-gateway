/**
 * Update Recipient DTO
 *
 * Validates input for updating a recipient
 * All fields are optional
 */

import { IsOptional, IsString, IsEmail, Matches } from 'class-validator';

export class UpdateRecipientDto {
  @IsOptional()
  @IsEmail()
  email?: string;

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
