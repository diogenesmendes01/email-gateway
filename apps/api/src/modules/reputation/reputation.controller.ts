import {
  Controller,
  Get,
  Param,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ReputationService } from './reputation.service';
import { ApiProtected, Company } from '../auth/decorators';

@ApiProtected()
@Controller('reputation')
export class ReputationController {
  private readonly logger = new Logger(ReputationController.name);

  constructor(private readonly reputationService: ReputationService) {}

  /**
   * GET /reputation
   * Get company reputation metrics
   */
  @Get()
  async getCompanyReputation(@Company() companyId: string) {
    try {
      const reputation = await this.reputationService.getCompanyReputation(companyId);

      return {
        companyId,
        reputation,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to get company reputation:', error);
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to retrieve company reputation',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /reputation/domain/:id
   * Get domain-specific reputation metrics
   */
  @Get('domain/:domainId')
  async getDomainReputation(
    @Param('domainId') domainId: string,
    @Company() companyId: string,
  ) {
    try {
      const reputation = await this.reputationService.getDomainReputation(companyId, domainId);

      return {
        domainId,
        reputation,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to get domain reputation for ${domainId}:`, error);
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to retrieve domain reputation',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /reputation/alerts
   * Get active reputation alerts
   */
  @Get('alerts')
  async getReputationAlerts(@Company() companyId: string) {
    try {
      const alerts = await this.reputationService.getActiveAlerts(companyId);

      return {
        companyId,
        alerts,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to get reputation alerts:', error);
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to retrieve reputation alerts',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /reputation/postmaster
   * Get Gmail Postmaster Tools data (if configured)
   */
  @Get('postmaster')
  async getPostmasterData(@Company() companyId: string) {
    try {
      const postmasterData = await this.reputationService.getPostmasterData(companyId);

      return {
        companyId,
        postmasterData,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to get postmaster data:', error);
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to retrieve postmaster data',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
