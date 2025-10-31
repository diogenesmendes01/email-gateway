import { MXRateLimiterService } from '../mx-rate-limiter.service';
import Redis from 'ioredis';

// Mock do Redis
jest.mock('ioredis');

describe('MXRateLimiterService', () => {
  let service: MXRateLimiterService;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    mockRedis = {
      pipeline: jest.fn().mockReturnValue({
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn(),
      }),
    } as any;

    service = new MXRateLimiterService(mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkLimit', () => {
    it('deve permitir envio se dentro dos limites', async () => {
      const pipeline = mockRedis.pipeline();
      (pipeline.exec as jest.Mock).mockResolvedValueOnce([
        [null, 5],  // secondCount
        [null, 'OK'],
        [null, 50], // minuteCount
        [null, 'OK'],
      ]);

      const result = await service.checkLimit('user@gmail.com');

      expect(result.allowed).toBe(true);
      expect(result.domain).toBe('gmail.com');
    });

    it('deve bloquear se exceder limite por segundo', async () => {
      const pipeline = mockRedis.pipeline();
      (pipeline.exec as jest.Mock).mockResolvedValueOnce([
        [null, 15],  // secondCount > 10 (limite padrão para Gmail)
        [null, 'OK'],
        [null, 50],
        [null, 'OK'],
      ]);

      const result = await service.checkLimit('user@gmail.com');

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBe(1000);
      expect(result.domain).toBe('gmail.com');
    });

    it('deve bloquear se exceder limite por minuto', async () => {
      const pipeline = mockRedis.pipeline();
      (pipeline.exec as jest.Mock).mockResolvedValueOnce([
        [null, 5],
        [null, 'OK'],
        [null, 601], // minuteCount > 600 (limite padrão para Gmail)
        [null, 'OK'],
      ]);

      const result = await service.checkLimit('user@gmail.com');

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(60000);
      expect(result.domain).toBe('gmail.com');
    });

    it('deve extrair domínio corretamente', async () => {
      const pipeline = mockRedis.pipeline();
      (pipeline.exec as jest.Mock).mockResolvedValue([
        [null, 1],
        [null, 'OK'],
        [null, 1],
        [null, 'OK'],
      ]);

      const result = await service.checkLimit('test@example.com');

      expect(result.domain).toBe('example.com');
    });

    it('deve permitir se Redis falhar', async () => {
      const pipeline = mockRedis.pipeline();
      (pipeline.exec as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.checkLimit('user@gmail.com');

      expect(result.allowed).toBe(true);
    });

    it('deve usar limites diferentes para domínios diferentes', async () => {
      const pipeline = mockRedis.pipeline();
      (pipeline.exec as jest.Mock).mockResolvedValue([
        [null, 3],
        [null, 'OK'],
        [null, 100],
        [null, 'OK'],
      ]);

      // Gmail tem limites mais baixos que domínios desconhecidos
      const gmailResult = await service.checkLimit('user@gmail.com');
      expect(gmailResult.allowed).toBe(true);

      const unknownResult = await service.checkLimit('user@unknown-domain.com');
      expect(unknownResult.allowed).toBe(true);
    });
  });

  describe('extractDomain', () => {
    it('deve extrair domínio de email válido', () => {
      const domain = (service as any).extractDomain('user@example.com');
      expect(domain).toBe('example.com');
    });

    it('deve retornar "unknown" para email inválido', () => {
      const domain = (service as any).extractDomain('invalid-email');
      expect(domain).toBe('unknown');
    });

    it('deve lidar com emails com subdomínios', () => {
      const domain = (service as any).extractDomain('user@mail.example.com');
      expect(domain).toBe('mail.example.com');
    });
  });
});

