import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { getDataSourceToken } from '@nestjs/typeorm';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    // Close TypeORM connection
    const dataSource = app.get(getDataSourceToken());
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
    // Attempt to close Redis connection if accessible
    try {
      const urlService = app.get('UrlService');
      if (
        urlService &&
        urlService.redis &&
        typeof urlService.redis.quit === 'function'
      ) {
        await urlService.redis.quit();
      }
    } catch (e) {
      // ignore if not found
    }
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/url/shorten (POST) should return a shortUrl', async () => {
    const response = await request(app.getHttpServer())
      .post('/url/shorten')
      .send({ url: 'https://www.google.com' })
      .expect(201); // or .expect(200) if your controller returns 200

    expect(response.body.shortUrl).toBeDefined();
    expect(typeof response.body.shortUrl).toBe('string');
  });

  it('/url/:code (GET) should redirect to the original URL', async () => {
    // First, shorten a URL to get the code
    const res = await request(app.getHttpServer())
      .post('/url/shorten')
      .send({ url: 'https://www.google.com' });

    const shortUrl = res.body.shortUrl;
    const code = shortUrl.split('/').pop();

    // Now, test the redirect
    const redirectRes = await request(app.getHttpServer())
      .get(`/url/${code}`)
      .expect(302);

    expect(redirectRes.header.location).toBe('https://www.google.com');
  });

  it('/url/stats/:code (GET) should return stats', async () => {
    // First, shorten a URL to get the code
    const res = await request(app.getHttpServer())
      .post('/url/shorten')
      .send({ url: 'https://www.google.com' });

    const shortUrl = res.body.shortUrl;
    const code = shortUrl.split('/').pop();

    // Call the redirect endpoint to increment hits
    await request(app.getHttpServer()).get(`/url/${code}`);

    // Now, test the stats endpoint
    const statsRes = await request(app.getHttpServer())
      .get(`/url/stats/${code}`)
      .expect(200);

    expect(statsRes.body.originalUrl).toBe('https://www.google.com');
    expect(typeof statsRes.body.hits).toBe('number');
    expect(statsRes.body.hits).toBeGreaterThan(0);
  });
});
