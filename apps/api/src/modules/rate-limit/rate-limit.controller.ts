import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';

import { CreateRateLimitDto } from './dto/create-rate-limit.dto';
import { UpdateRateLimitDto } from './dto/update-rate-limit.dto';
import { RateLimitService } from './rate-limit.service';

@Controller('rate-limits')
export class RateLimitController {
  constructor(private readonly rateLimitService: RateLimitService) {}

  @Get()
  async listRateLimits(@Query('scope') scope?: string) {
    const rateLimits = await this.rateLimitService.listRateLimits(scope as any);
    return {
      rateLimits,
      count: rateLimits.length,
      fetchedAt: new Date().toISOString(),
    };
  }

  @Post()
  async createRateLimit(@Body() body: CreateRateLimitDto) {
    const rateLimit = await this.rateLimitService.createRateLimit(body);
    return {
      rateLimit,
      createdAt: new Date().toISOString(),
    };
  }

  @Put(':id')
  async updateRateLimit(@Param('id') id: string, @Body() body: UpdateRateLimitDto) {
    const rateLimit = await this.rateLimitService.updateRateLimit(id, body);
    return {
      rateLimit,
      updatedAt: new Date().toISOString(),
    };
  }

  @Delete(':id')
  async deleteRateLimit(@Param('id') id: string) {
    const result = await this.rateLimitService.deleteRateLimit(id);
    return {
      ...result,
      deletedAt: new Date().toISOString(),
    };
  }
}

