import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { CreateRateLimitDto } from './dto/create-rate-limit.dto';
import { UpdateRateLimitDto } from './dto/update-rate-limit.dto';

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listRateLimits(scope?: Prisma.RateLimitWhereInput['scope']) {
    return this.prisma.rateLimit.findMany({
      where: scope ? { scope } : undefined,
      orderBy: [{ scope: 'asc' }, { target: 'asc' }],
    });
  }

  async getRateLimitById(id: string) {
    const rateLimit = await this.prisma.rateLimit.findUnique({ where: { id } });

    if (!rateLimit) {
      throw new NotFoundException(`Rate limit ${id} not found`);
    }

    return rateLimit;
  }

  async createRateLimit(dto: CreateRateLimitDto) {
    this.logger.log(`Creating rate limit ${dto.scope}:${dto.target}`);

    return this.prisma.rateLimit.create({
      data: {
        scope: dto.scope,
        target: dto.target,
        perMinute: dto.perMinute ?? null,
        perHour: dto.perHour ?? null,
        perDay: dto.perDay ?? null,
      },
    });
  }

  async updateRateLimit(id: string, dto: UpdateRateLimitDto) {
    await this.getRateLimitById(id);

    this.logger.log(`Updating rate limit ${id}`);

    return this.prisma.rateLimit.update({
      where: { id },
      data: {
        scope: dto.scope,
        target: dto.target,
        perMinute: dto.perMinute,
        perHour: dto.perHour,
        perDay: dto.perDay,
      },
    });
  }

  async deleteRateLimit(id: string) {
    await this.getRateLimitById(id);

    this.logger.log(`Deleting rate limit ${id}`);

    await this.prisma.rateLimit.delete({ where: { id } });

    return { success: true };
  }
}

