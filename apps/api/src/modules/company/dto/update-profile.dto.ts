/**
 * @email-gateway/api - Update Profile DTO
 *
 * TASK-037: DTO para atualização de perfil
 */

import { IsEmail, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Nome deve ter no mínimo 3 caracteres' })
  @MaxLength(100, { message: 'Nome deve ter no máximo 100 caracteres' })
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'From Address inválido' })
  defaultFromAddress?: string;

  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'From Name deve ter no mínimo 3 caracteres' })
  @MaxLength(100, { message: 'From Name deve ter no máximo 100 caracteres' })
  defaultFromName?: string;
}
