import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { SuppressionService } from './suppression.service';

@Controller('suppressions')
export class SuppressionController {
  private readonly logger = new Logger(SuppressionController.name);

  constructor(private readonly suppressionService: SuppressionService) {}

  /**
   * POST /suppressions
   * Add email to suppression list
   */
  @Post()
  async addSuppression(@Body() body: {
    email: string;
    reason: string;
    source?: string;
    notes?: string;
  }) {
    try {
      this.logger.log(`Adding email to suppression: ${body.email}`);

      // TODO: Get company ID from authenticated user
      const companyId = 'placeholder-company-id';

      await this.suppressionService.addToSuppression({
        companyId,
        email: body.email,
        reason: body.reason as any,
        source: body.source || 'manual',
      });

      return {
        success: true,
        message: `Email ${body.email} added to suppression list`,
        email: body.email,
        reason: body.reason,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to add suppression for ${body.email}:`, error);
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to add email to suppression list',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /suppressions
   * List suppression entries
   */
  @Get()
  async listSuppressions(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
    @Query('reason') reason?: string,
    @Query('search') search?: string,
  ) {
    try {
      // TODO: Get company ID from authenticated user
      const companyId = 'placeholder-company-id';

      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);

      const result = await this.suppressionService.listSuppressions(companyId, {
        page: pageNum,
        limit: limitNum,
        reason: reason as any,
        search,
      });

      return {
        suppressions: result.suppressions,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: result.total,
          totalPages: Math.ceil(result.total / limitNum),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to list suppressions:', error);
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to retrieve suppression list',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * DELETE /suppressions/:id
   * Remove email from suppression list
   */
  @Delete(':id')
  async removeSuppression(@Param('id') id: string) {
    try {
      this.logger.log(`Removing suppression entry: ${id}`);

      await this.suppressionService.removeFromSuppression(id);

      return {
        success: true,
        message: 'Email removed from suppression list',
        id,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to remove suppression ${id}:`, error);
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to remove email from suppression list',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /suppressions/check
   * Check if email is suppressed
   */
  @Post('check')
  async checkSuppression(@Body() body: { email: string }) {
    try {
      // TODO: Get company ID from authenticated user
      const companyId = 'placeholder-company-id';

      const result = await this.suppressionService.checkSuppression(companyId, body.email);

      return {
        email: body.email,
        suppressed: result.suppressed,
        reason: result.reason,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to check suppression for ${body.email}:`, error);
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to check email suppression status',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /suppressions/import
   * Import suppression list from CSV
   */
  @Post('import')
  async importSuppressions(@Body() body: {
    emails: string[];
    reason: string;
    source?: string;
  }) {
    try {
      this.logger.log('Importing suppression list from CSV');

      // TODO: Get company ID from authenticated user
      const companyId = 'placeholder-company-id';

      const result = await this.suppressionService.importSuppressions(companyId, {
        emails: body.emails,
        reason: body.reason as any,
        source: body.source || 'import',
      });

      return {
        success: true,
        imported: result.imported,
        duplicates: result.duplicates,
        errors: result.errors,
        message: `Imported ${result.imported} emails to suppression list`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to import suppressions:', error);
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to import suppression list',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
