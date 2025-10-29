/**
 * @email-gateway/api - Company Controller
 *
 * TASK-036: Controller para registro de empresas
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CompanyService, CompanyRegistrationResponse } from '../services/company.service';
import { RegisterCompanyDto } from '../dto/register-company.dto';

@ApiTags('Company Registration')
@Controller('auth')
export class CompanyController {
  private readonly logger = new Logger(CompanyController.name);

  constructor(private readonly companyService: CompanyService) {}

  /**
   * POST /v1/auth/register
   * Registra uma nova empresa
   * TASK-036: Company registration endpoint
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @ApiOperation({ summary: 'Registrar nova empresa' })
  @ApiResponse({
    status: 201,
    description: 'Empresa registrada com sucesso',
  })
  @ApiResponse({
    status: 409,
    description: 'Email já cadastrado',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos',
  })
  async register(@Body() dto: RegisterCompanyDto): Promise<CompanyRegistrationResponse> {
    this.logger.log({
      message: 'Company registration attempt',
      email: dto.email,
      name: dto.name,
    });

    try {
      const result = await this.companyService.register(dto);

      this.logger.log({
        message: 'Company registered successfully',
        companyId: result.id,
        email: dto.email,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error({
        message: 'Company registration failed',
        email: dto.email,
        error: errorMessage,
      });

      throw error;
    }
  }
}
