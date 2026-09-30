import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello() {
    return {
      success: true,
      data: {
        message: this.appService.getHello(),
      },
      meta: {},
    };
  }

  @Get('health')
  getHealth() {
    return {
      success: true,
      data: {
        status: 'OK',
        timestamp: new Date().toISOString(),
      },
      meta: {},
    };
  }
}
