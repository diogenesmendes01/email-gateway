import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProviderService } from './provider.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { TestProviderDto } from './dto/test-provider.dto';

@Controller('providers')
export class ProviderController {
  constructor(private readonly providerService: ProviderService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createProvider(@Body() dto: CreateProviderDto) {
    return this.providerService.createProvider(dto);
  }

  @Get()
  async getAllProviders(@Query('companyId') companyId?: string) {
    return this.providerService.getAllProviders(companyId);
  }

  @Get(':id')
  async getProviderById(@Param('id') id: string) {
    return this.providerService.getProviderById(id);
  }

  @Put(':id')
  async updateProvider(@Param('id') id: string, @Body() dto: UpdateProviderDto) {
    return this.providerService.updateProvider(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProvider(@Param('id') id: string) {
    await this.providerService.deleteProvider(id);
  }

  @Post(':id/test')
  async testProvider(@Param('id') id: string, @Body() dto: TestProviderDto) {
    return this.providerService.testProvider(id);
  }
}

