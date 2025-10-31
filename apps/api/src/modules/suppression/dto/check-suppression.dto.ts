import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckSuppressionDto {
  @ApiProperty({
    description: 'Email address to check',
    example: 'user@example.com',
  })
  @IsEmail()
  email!: string;
}

export class CheckSuppressionResponseDto {
  @ApiProperty({ description: 'Is email suppressed', example: false })
  suppressed!: boolean;

  @ApiProperty({
    description: 'Reason if suppressed',
    example: 'HARD_BOUNCE',
    nullable: true,
  })
  reason?: string;

  @ApiProperty({
    description: 'When suppression expires',
    example: '2025-11-30T00:00:00Z',
    nullable: true,
  })
  expiresAt?: Date;
}
