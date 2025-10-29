/**
 * @email-gateway/api - Regenerate API Key DTO
 *
 * TASK-037: DTO para regeneração de API Key
 */

import { IsNotEmpty, IsString } from 'class-validator';

export class RegenerateApiKeyDto {
  @IsNotEmpty({ message: 'Senha atual é obrigatória' })
  @IsString()
  currentPassword!: string;
}
