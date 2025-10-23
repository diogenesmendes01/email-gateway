/**
 * Update Recipient DTO
 *
 * Validates input for updating a recipient
 * All fields are optional
 */

import { PartialType } from '@nestjs/swagger';
import { CreateRecipientDto } from './create-recipient.dto';

export class UpdateRecipientDto extends PartialType(CreateRecipientDto) {}
