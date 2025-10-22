import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  let guard: AdminGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminGuard],
    }).compile();

    guard = module.get<AdminGuard>(AdminGuard);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    let mockContext: ExecutionContext;
    let mockRequest: any;

    beforeEach(() => {
      mockRequest = {
        user: null,
      };

      mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
        getHandler: jest.fn(),
        getClass: jest.fn(),
      } as unknown as ExecutionContext;
    });

    it('should throw ForbiddenException when user is not authenticated', () => {
      mockRequest.user = null;

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user is undefined', () => {
      mockRequest.user = undefined;

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user role is not admin', () => {
      mockRequest.user = {
        username: 'readonly',
        type: 'basic_auth',
        role: 'readonly',
      };

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should return true when user role is admin', () => {
      mockRequest.user = {
        username: 'admin',
        type: 'basic_auth',
        role: 'admin',
      };

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should throw ForbiddenException when user role is undefined', () => {
      mockRequest.user = {
        username: 'user',
        type: 'basic_auth',
        // role is undefined
      };

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user role is null', () => {
      mockRequest.user = {
        username: 'user',
        type: 'basic_auth',
        role: null,
      };

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user role is empty string', () => {
      mockRequest.user = {
        username: 'user',
        type: 'basic_auth',
        role: '',
      };

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });
  });

  describe('error messages', () => {
    let mockContext: ExecutionContext;
    let mockRequest: any;

    beforeEach(() => {
      mockRequest = {
        user: null,
      };

      mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
        getHandler: jest.fn(),
        getClass: jest.fn(),
      } as unknown as ExecutionContext;
    });

    it('should throw ForbiddenException with correct message when user not authenticated', () => {
      mockRequest.user = null;

      try {
        guard.canActivate(mockContext);
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as Error).message).toBe('User not authenticated');
      }
    });

    it('should throw ForbiddenException with correct message when user role is not admin', () => {
      mockRequest.user = {
        username: 'readonly',
        type: 'basic_auth',
        role: 'readonly',
      };

      try {
        guard.canActivate(mockContext);
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as Error).message).toBe('Admin privileges required');
      }
    });
  });
});