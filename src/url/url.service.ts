import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { Url } from '../url.entity';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';

@Injectable()
export class UrlService {
  private redis: Redis;

  constructor(
    @InjectRepository(Url)
    private urlRepository: Repository<Url>,
  ) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: process.env.REDIS_PORT
        ? parseInt(process.env.REDIS_PORT, 10)
        : 6379,
    });
  }

  async shortenUrl(originalUrl: string): Promise<string> {
    let url = await this.urlRepository.findOne({ where: { originalUrl } });
    if (url) {
      await this.redis.set(url.code, url.originalUrl);
      return url.code;
    }

    const hash = crypto
      .createHash('sha256')
      .update(originalUrl)
      .digest('base64url')
      .slice(0, 8);
    url = this.urlRepository.create({ code: hash, originalUrl });
    await this.urlRepository.save(url);
    await this.redis.set(hash, originalUrl);
    return hash;
  }

  async getOriginalUrlAndCountHit(code: string): Promise<string | null> {
    let originalUrl = await this.redis.get(code);
    if (!originalUrl) {
      const url = await this.urlRepository.findOne({ where: { code } });
      if (!url) return null;
      originalUrl = url.originalUrl;
      await this.redis.set(code, originalUrl);
    }
    await this.redis.incr(`${code}:hits`);
    return originalUrl;
  }

  async getStatus(
    code: string,
  ): Promise<{ originalUrl: string; hits: number } | null> {
    let originalUrl = await this.redis.get(code);
    if (!originalUrl) {
      const url = await this.urlRepository.findOne({ where: { code } });
      if (!url) return null;
      originalUrl = url.originalUrl;
      await this.redis.set(code, originalUrl);
    }
    const hits = parseInt((await this.redis.get(`${code}:hits`)) || '0', 10);
    return { originalUrl, hits };
  }
}
