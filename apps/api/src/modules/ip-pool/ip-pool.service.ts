import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { CreateIpPoolDto } from './dto/create-ip-pool.dto';
import { UpdateIpPoolDto } from './dto/update-ip-pool.dto';

@Injectable()
export class IpPoolService {
  private readonly logger = new Logger(IpPoolService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listIpPools(params?: { type?: Prisma.IPPoolWhereInput['type']; isActive?: boolean }) {
    const where: Prisma.IPPoolWhereInput = {};

    if (typeof params?.type !== 'undefined') {
      where.type = params.type;
    }

    if (typeof params?.isActive !== 'undefined') {
      where.isActive = params.isActive;
    }

    return this.prisma.iPPool.findMany({
      where,
      orderBy: [{ reputation: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async getIpPoolById(id: string) {
    const pool = await this.prisma.iPPool.findUnique({ where: { id } });

    if (!pool) {
      throw new NotFoundException(`IP Pool ${id} not found`);
    }

    return pool;
  }

  async createIpPool(dto: CreateIpPoolDto) {
    this.logger.log(`Creating IP Pool ${dto.name}`);

    return this.prisma.iPPool.create({
      data: {
        name: dto.name,
        type: dto.type,
        ipAddresses: dto.ipAddresses,
        isActive: dto.isActive ?? true,
        dailyLimit: dto.dailyLimit ?? null,
        hourlyLimit: dto.hourlyLimit ?? null,
        warmupEnabled: dto.warmupEnabled ?? false,
        warmupConfig: dto.warmupConfig ? (dto.warmupConfig as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }

  async updateIpPool(id: string, dto: UpdateIpPoolDto) {
    await this.getIpPoolById(id);

    this.logger.log(`Updating IP Pool ${id}`);

    const updateData: Prisma.IPPoolUpdateInput = {};
    
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.ipAddresses !== undefined) updateData.ipAddresses = dto.ipAddresses;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.dailyLimit !== undefined) updateData.dailyLimit = dto.dailyLimit;
    if (dto.hourlyLimit !== undefined) updateData.hourlyLimit = dto.hourlyLimit;
    if (dto.warmupEnabled !== undefined) updateData.warmupEnabled = dto.warmupEnabled;
    if (dto.warmupConfig !== undefined) {
      updateData.warmupConfig = dto.warmupConfig ? (dto.warmupConfig as Prisma.InputJsonValue) : Prisma.JsonNull;
    }

    return this.prisma.iPPool.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteIpPool(id: string) {
    await this.getIpPoolById(id);

    this.logger.log(`Deleting IP Pool ${id}`);

    await this.prisma.iPPool.delete({ where: { id } });

    return { success: true };
  }
}

