import { Controller, Post, Body, UseInterceptors, Dependencies, Bind, UsePipes, ValidationPipe } from '@nestjs/common';
import { RequestService } from '../services/request.service.js';
import { IdempotencyInterceptor } from '../common/interceptors/idempotency.interceptor.js';
import { CircuitBreakerInterceptor } from '../common/interceptors/circuit-breaker.interceptor.js';
import { CreateTimeOffRequestDto } from '../dtos/create-time-off-request.dto.js';

@Controller('time-off')
@Dependencies(RequestService)
export class TimeOffController {
  /**
   * @param {RequestService} requestService 
   */
  constructor(requestService) {
    this.requestService = requestService;
  }

  @Post()
  @UseInterceptors(IdempotencyInterceptor, CircuitBreakerInterceptor)
  @UsePipes(new ValidationPipe({ expectedType: CreateTimeOffRequestDto }))
  @Bind(Body())
  async createRequest(createRequestDto) {
    return await this.requestService.createTimeOffRequest(createRequestDto);
  }
}
