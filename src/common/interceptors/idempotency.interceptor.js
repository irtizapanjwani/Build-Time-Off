import { Injectable, Dependencies } from '@nestjs/common';
import { IdempotencyService } from '../../services/idempotency.service.js';
import { of } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
@Dependencies(IdempotencyService)
export class IdempotencyInterceptor {
  /**
   * @param {IdempotencyService} idempotencyService 
   */
  constructor(idempotencyService) {
    this.idempotencyService = idempotencyService;
  }

  async intercept(context, next) {
    const request = context.switchToHttp().getRequest();
    const idempotencyKey = request.headers['idempotency-key'];

    if (!idempotencyKey) {
      return next.handle();
    }

    const existingRecord = await this.idempotencyService.getRecord(idempotencyKey);

    if (existingRecord) {
      const response = context.switchToHttp().getResponse();
      response.status(existingRecord.statusCode);
      // Return cached response wrapped in Observable
      try {
        const cachedBody = JSON.parse(existingRecord.responseBody);
        return of({ ...cachedBody, cachedIdempotencyKey: true });
      } catch (parseError) {
        // Corrupted cache entry - proceed with fresh request
        return next.handle();
      }
    }

    return next.handle().pipe(
      tap(async (responseBody) => {
        const response = context.switchToHttp().getResponse();
        await this.idempotencyService.saveRecord(
          idempotencyKey,
          request.body?.employeeId,
          response.statusCode || 201,
          responseBody
        );
      }),
    );
  }
}
