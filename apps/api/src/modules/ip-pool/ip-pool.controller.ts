import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';

import { CreateIpPoolDto } from './dto/create-ip-pool.dto';
import { UpdateIpPoolDto } from './dto/update-ip-pool.dto';
import { IpPoolService } from './ip-pool.service';

@Controller('ip-pools')
export class IpPoolController {
  constructor(private readonly ipPoolService: IpPoolService) {}

  @Get()
  async listIpPools(@Query('type') type?: string, @Query('isActive') isActive?: string) {
    const pools = await this.ipPoolService.listIpPools({
      type: type as any,
      isActive: typeof isActive === 'string' ? isActive.toLowerCase() !== 'false' : undefined,
    });

    return {
      pools,
      count: pools.length,
      fetchedAt: new Date().toISOString(),
    };
  }

  @Post()
  async createIpPool(@Body() body: CreateIpPoolDto) {
    const pool = await this.ipPoolService.createIpPool(body);
    return {
      pool,
      createdAt: new Date().toISOString(),
    };
  }

  @Put(':id')
  async updateIpPool(@Param('id') id: string, @Body() body: UpdateIpPoolDto) {
    const pool = await this.ipPoolService.updateIpPool(id, body);
    return {
      pool,
      updatedAt: new Date().toISOString(),
    };
  }

  @Delete(':id')
  async deleteIpPool(@Param('id') id: string) {
    const result = await this.ipPoolService.deleteIpPool(id);
    return {
      ...result,
      deletedAt: new Date().toISOString(),
    };
  }
}

