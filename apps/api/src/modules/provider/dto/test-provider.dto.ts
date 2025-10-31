import { IsEmail, IsString, IsOptional } from 'class-validator';

export class TestProviderDto {
  @IsEmail()
  to!: string;

  @IsString()
  subject!: string;

  @IsString()
  htmlContent!: string;

  @IsOptional()
  @IsString()
  textContent?: string;
}
