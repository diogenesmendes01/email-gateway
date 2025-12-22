/**
 * @email-gateway/api - Update Profile DTO
 *
 * TASK-037: DTO para atualização de perfil
 * TASK-038: Removidos campos defaultFromAddress/defaultFromName - agora gerenciados via domínios
 */

import { IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Nome deve ter no mínimo 3 caracteres' })
  @MaxLength(100, { message: 'Nome deve ter no máximo 100 caracteres' })
  name?: string;

  // TASK-038: Removidos campos defaultFromAddress e defaultFromName
  // Estes campos agora são gerenciados exclusivamente via setDefaultDomain
  // com domínios verificados. Não podem ser editados diretamente no perfil.
}
