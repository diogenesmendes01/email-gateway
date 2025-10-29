/**
 * @email-gateway/api - Register Company DTO
 *
 * TASK-036: DTO para registro de empresas
 */

import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MinLength, MaxLength } from 'class-validator';

export class RegisterCompanyDto {
  @IsNotEmpty({ message: 'Nome da empresa é obrigatório' })
  @IsString()
  @MinLength(3, { message: 'Nome deve ter no mínimo 3 caracteres' })
  @MaxLength(100, { message: 'Nome deve ter no máximo 100 caracteres' })
  name: string;

  @IsNotEmpty({ message: 'Email é obrigatório' })
  @IsEmail({}, { message: 'Email inválido' })
  email: string;

  @IsNotEmpty({ message: 'Senha é obrigatória' })
  @MinLength(8, { message: 'Senha deve ter no mínimo 8 caracteres' })
  @Matches(/^(?=.*[A-Z])(?=.*\d)/, {
    message: 'Senha deve conter pelo menos 1 letra maiúscula e 1 número',
  })
  password: string;

  @IsOptional()
  @IsEmail({}, { message: 'From Address inválido' })
  fromAddress?: string;

  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'From Name deve ter no mínimo 3 caracteres' })
  @MaxLength(100, { message: 'From Name deve ter no máximo 100 caracteres' })
  fromName?: string;
}
