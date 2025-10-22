import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  let guard: AdminGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<AdminGuard>(AdminGuard);
    reflector = module.get<Reflector>(Reflector);
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

    it('should return true when requireAdmin is false', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should return true when requireAdmin is undefined', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should throw ForbiddenException when user is not authenticated', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
      mockRequest.user = null;

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user is undefined', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
      mockRequest.user = undefined;

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user role is not admin', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
      mockRequest.user = {
        username: 'readonly',
        type: 'basic_auth',
        role: 'readonly',
      };

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should return true when user role is admin', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
      mockRequest.user = {
        username: 'admin',
        type: 'basic_auth',
        role: 'admin',
      };

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should throw ForbiddenException when user role is undefined', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
      mockRequest.user = {
        username: 'user',
        type: 'basic_auth',
        // role is undefined
      };

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user role is null', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
      mockRequest.user = {
        username: 'user',
        type: 'basic_auth',
        role: null,
      };

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when user role is empty string', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
      mockRequest.user = {
        username: 'user',
        type: 'basic_auth',
        role: '',
      };

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should handle case-insensitive role comparison', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
      mockRequest.user = {
        username: 'admin',
        type: 'basic_auth',
        role: 'ADMIN', // uppercase
      };

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
    });

    it('should handle mixed case role', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
      mockRequest.user = {
        username: 'admin',
        type: 'basic_auth',
        role: 'Admin', // mixed case
      };

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
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
      } as ExecutionContext;
    });

    it('should throw ForbiddenException with correct message when user not authenticated', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
      mockRequest.user = null;

      try {
        guard.canActivate(mockContext);
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as Error).message).toBe('User not authenticated');
      }
    });

    it('should throw ForbiddenException with correct message when user role is not admin', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
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

  describe('reflector integration', () => {
    let mockContext: ExecutionContext;
    let mockRequest: any;

    beforeEach(() => {
      mockRequest = {
        user: {
          username: 'admin',
          type: 'basic_auth',
          role: 'admin',
        },
      };

      mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as ExecutionContext;
    });

    it('should call reflector with correct parameters', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);

      guard.canActivate(mockContext);

      expect(reflector.getAllAndOverride).toHaveBeenCalledWith('requireAdmin', [
        mockContext.getHandler(),
        mockContext.getClass(),
      ]);
    });

    it('should call reflector even when requireAdmin is false', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

      guard.canActivate(mockContext);

      expect(reflector.getAllAndOverride).toHaveBeenCalledWith('requireAdmin', [
        mockContext.getHandler(),
        mockContext.getClass(),
      ]);
    });
  });
});
