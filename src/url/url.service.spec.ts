import { Test, TestingModule } from '@nestjs/testing';
import { UrlService } from './url.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Url } from '../url.entity';
import { Repository } from 'typeorm';

// Mock Redis
jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      get: jest.fn(),
      set: jest.fn(),
      incr: jest.fn(),
    })),
  };
});

const mockUrlRepository = () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

describe('UrlService', () => {
  let service: UrlService;
  let urlRepository: ReturnType<typeof mockUrlRepository>;
  let redisMock: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UrlService,
        {
          provide: getRepositoryToken(Url),
          useFactory: mockUrlRepository,
        },
      ],
    }).compile();

    service = module.get<UrlService>(UrlService);
    urlRepository = module.get(getRepositoryToken(Url));
    redisMock = (service as any).redis;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('shortenUrl returns same code for same URL', async () => {
    const url = 'https://test.com';
    const code = 'abc12345';
    urlRepository.findOne.mockResolvedValue({ code, originalUrl: url });
    redisMock.set.mockResolvedValue('OK');
    const result = await service.shortenUrl(url);
    expect(result).toBe(code);
    expect(redisMock.set).toHaveBeenCalledWith(code, url);
  });

  it('shortenUrl generates new code for new URL', async () => {
    const url = 'https://new.com';
    urlRepository.findOne.mockResolvedValue(null);
    urlRepository.create.mockImplementation((obj) => obj);
    urlRepository.save.mockImplementation(async (obj) => obj);
    redisMock.set.mockResolvedValue('OK');
    const result = await service.shortenUrl(url);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(redisMock.set).toHaveBeenCalledWith(result, url);
  });

  it('getOriginalUrlAndCountHit returns originalUrl from Redis', async () => {
    redisMock.get.mockResolvedValueOnce('https://fromredis.com');
    redisMock.incr.mockResolvedValue(1);
    const result = await service.getOriginalUrlAndCountHit('code1');
    expect(result).toBe('https://fromredis.com');
    expect(redisMock.incr).toHaveBeenCalledWith('code1:hits');
  });

  it('getOriginalUrlAndCountHit falls back to DB and caches', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    urlRepository.findOne.mockResolvedValue({
      code: 'code2',
      originalUrl: 'https://fromdb.com',
    });
    redisMock.set.mockResolvedValue('OK');
    redisMock.incr.mockResolvedValue(1);
    const result = await service.getOriginalUrlAndCountHit('code2');
    expect(result).toBe('https://fromdb.com');
    expect(redisMock.set).toHaveBeenCalledWith('code2', 'https://fromdb.com');
    expect(redisMock.incr).toHaveBeenCalledWith('code2:hits');
  });

  it('getOriginalUrlAndCountHit returns null if not found', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    urlRepository.findOne.mockResolvedValue(null);
    const result = await service.getOriginalUrlAndCountHit('notfound');
    expect(result).toBeNull();
  });

  it('getStatus returns correct stats', async () => {
    redisMock.get.mockImplementation((key: string) => {
      if (key === 'code3') return Promise.resolve('https://stats.com');
      if (key === 'code3:hits') return Promise.resolve('5');
      return Promise.resolve(null);
    });
    const result = await service.getStatus('code3');
    expect(result).toEqual({ originalUrl: 'https://stats.com', hits: 5 });
  });

  it('getStats falls back to DB and returns 0 hits if not in Redis', async () => {
    redisMock.get.mockResolvedValueOnce(null); // originalUrl
    urlRepository.findOne.mockResolvedValue({
      code: 'code4',
      originalUrl: 'https://statsdb.com',
    });
    redisMock.set.mockResolvedValue('OK');
    redisMock.get.mockResolvedValueOnce(null); // hits
    const result = await service.getStatus('code4');
    expect(result).toEqual({ originalUrl: 'https://statsdb.com', hits: 0 });
  });

  it('getStats returns null if not found', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    urlRepository.findOne.mockResolvedValue(null);
    const result = await service.getStatus('notfound');
    expect(result).toBeNull();
  });
});
