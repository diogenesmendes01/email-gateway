import { MXRateLimiterService } from '../mx-rate-limiter.service';
import Redis from 'ioredis';

// Mock do Redis
jest.mock('ioredis');

describe('MXRateLimiterService', () => {
  let service: MXRateLimiterService;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    const mockPipeline = {
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn(),
    };

    mockRedis = {
      multi: jest.fn().mockReturnValue(mockPipeline),
      pipeline: jest.fn().mockReturnValue(mockPipeline),
    } as any;

    service = new MXRateLimiterService(mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkLimit', () => {
    it('deve permitir envio se dentro dos limites', async () => {
      const pipeline = mockRedis.multi();
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
      const pipeline = mockRedis.multi();
      (pipeline.exec as jest.Mock).mockResolvedValueOnce([
        [null, 25],  // secondCount > 20 (limite para Gmail é 20/s)
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
      const pipeline = mockRedis.multi();
      (pipeline.exec as jest.Mock).mockResolvedValueOnce([
        [null, 5],
        [null, 'OK'],
        [null, 1001], // minuteCount > 1000 (limite para Gmail é 1000/min)
        [null, 'OK'],
      ]);

      const result = await service.checkLimit('user@gmail.com');

      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(60000);
      expect(result.domain).toBe('gmail.com');
    });

    it('deve extrair domínio corretamente', async () => {
      const pipeline = mockRedis.multi();
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
      const pipeline = mockRedis.multi();
      (pipeline.exec as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.checkLimit('user@gmail.com');

      expect(result.allowed).toBe(true);
    });

    it('deve usar limites diferentes para domínios diferentes', async () => {
      // Mock para Gmail (limites altos: 20/s, 1000/min)
      let pipeline = mockRedis.multi();
      (pipeline.exec as jest.Mock).mockResolvedValueOnce([
        [null, 10],  // Dentro do limite de 20/s
        [null, 'OK'],
        [null, 500], // Dentro do limite de 1000/min
        [null, 'OK'],
      ]);

      const gmailResult = await service.checkLimit('user@gmail.com');
      expect(gmailResult.allowed).toBe(true);

      // Mock para domínio desconhecido (limites baixos: 1/s, 120/min)
      pipeline = mockRedis.multi();
      (pipeline.exec as jest.Mock).mockResolvedValueOnce([
        [null, 0.5], // Dentro do limite de 1/s
        [null, 'OK'],
        [null, 50],  // Dentro do limite de 120/min
        [null, 'OK'],
      ]);

      const unknownResult = await service.checkLimit('user@unknown-domain.com');
      expect(unknownResult.allowed).toBe(true);
    });
  });

  describe('extractDomain', () => {
    it('deve extrair domínio de email válido', () => {
      const domain = (service as any).extractDomain('user@example.com');
      expect(domain).toBe('example.com');
    });

    it('deve retornar "default" para email inválido', () => {
      const domain = (service as any).extractDomain('invalid-email');
      expect(domain).toBe('default');
    });

    it('deve lidar com emails com subdomínios', () => {
      const domain = (service as any).extractDomain('user@mail.example.com');
      expect(domain).toBe('mail.example.com');
    });
  });
});

