import { Injectable, Logger, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { DNSCheckerService } from './dns-checker.service';
import { DKIMGeneratorService } from './dkim-generator.service';
import { PrismaService } from '../../database/prisma.service';
import { DomainOnboardingStatus } from '@certshift/database';
