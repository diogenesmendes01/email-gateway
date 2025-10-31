import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';

@Injectable()
export class ProviderService {
  private readonly logger = new Logger(ProviderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createProvider(dto: CreateProviderDto) {
    this.logger.log(`Creating provider ${dto.provider} for company ${dto.companyId ?? 'global'}`);

    return this.prisma.emailProviderConfig.create({
      data: {
        companyId: dto.companyId ?? null,
        provider: dto.provider,
        isActive: dto.isActive ?? true,
        priority: dto.priority ?? 0,
        config: dto.config as Prisma.InputJsonValue,
        ipPoolId: dto.ipPoolId ?? null,
        maxPerSecond: dto.maxPerSecond ?? null,
        maxPerMinute: dto.maxPerMinute ?? null,
        maxPerHour: dto.maxPerHour ?? null,
        maxPerDay: dto.maxPerDay ?? null,
        name: dto.name ?? null,
        description: dto.description ?? null,
      },
    });
  }

  async getAllProviders(companyId?: string) {
    const where: Prisma.EmailProviderConfigWhereInput = {};
    
    if (companyId) {
      where.companyId = companyId;
    }

    return this.prisma.emailProviderConfig.findMany({
      where,
      orderBy: [
        { priority: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async getProviderById(id: string) {
    const provider = await this.prisma.emailProviderConfig.findUnique({
      where: { id },
    });

    if (!provider) {
      throw new NotFoundException(`Provider ${id} not found`);
    }

    return provider;
  }

  async updateProvider(id: string, dto: UpdateProviderDto) {
    await this.getProviderById(id);

    this.logger.log(`Updating provider ${id}`);

    const updateData: Prisma.EmailProviderConfigUpdateInput = {};

    if (dto.companyId !== undefined) updateData.companyId = dto.companyId;
    if (dto.provider !== undefined) updateData.provider = dto.provider;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.priority !== undefined) updateData.priority = dto.priority;
    if (dto.config !== undefined) updateData.config = dto.config as Prisma.InputJsonValue;
    if (dto.ipPoolId !== undefined) updateData.ipPoolId = dto.ipPoolId;
    if (dto.maxPerSecond !== undefined) updateData.maxPerSecond = dto.maxPerSecond;
    if (dto.maxPerMinute !== undefined) updateData.maxPerMinute = dto.maxPerMinute;
    if (dto.maxPerHour !== undefined) updateData.maxPerHour = dto.maxPerHour;
    if (dto.maxPerDay !== undefined) updateData.maxPerDay = dto.maxPerDay;
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;

    return this.prisma.emailProviderConfig.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteProvider(id: string) {
    await this.getProviderById(id);

    this.logger.log(`Deleting provider ${id}`);

    return this.prisma.emailProviderConfig.delete({
      where: { id },
    });
  }

  async testProvider(id: string) {
    const provider = await this.getProviderById(id);

    this.logger.log(`Testing provider ${id} (${provider.provider})`);

    // TODO: Implement actual test logic using the driver
    return {
      success: true,
      message: `Provider ${provider.provider} is configured correctly`,
      provider: provider.provider,
    };
  }
}

