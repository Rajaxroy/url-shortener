import {
  Controller,
  Param,
  Post,
  Res,
  ValidationPipe,
  Get,
} from '@nestjs/common';
import { Response } from 'express';
import { Body } from '@nestjs/common';
import { UrlService } from './url.service';
import { CreateUrlDto } from './create-url.dto';

@Controller('url')
export class UrlController {
  constructor(private readonly urlService: UrlService) {}

  @Post('shorten')
  async shorten(
    @Body(new ValidationPipe()) createUrlDto: CreateUrlDto,
  ): Promise<{ shortUrl: string }> {
    const code = await this.urlService.shortenUrl(createUrlDto.url);
    return { shortUrl: `http://localhost:3000/${code}` };
  }

  @Get(':code')
  async redirect(@Param('code') code: string, @Res() res: Response) {
    const originalUrl = await this.urlService.getOriginalUrlAndCountHit(code);
    if (originalUrl) {
      return res.redirect(originalUrl);
    }
    return res.status(404).json({ message: 'URL not found' });
  }

  @Get('stats/:code')
  async stats(@Param('code') code: string) {
    const stats = await this.urlService.getStatus(code);
    if (stats) {
      return stats;
    }
    return { message: 'URL not found' };
  }
}
