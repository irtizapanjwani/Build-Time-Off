import { Injectable, CallHandler, ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { catchError } from 'rxjs/operators';
import { CircuitBreakerOpenException } from '../exceptions/circuit-breaker.exception.js';

@Injectable()
export class CircuitBreakerInterceptor {
  intercept(context, next) {
    return next.handle().pipe(
      catchError(error => {
        if (error instanceof CircuitBreakerOpenException) {
          throw new ServiceUnavailableException('Service is temporarily unavailable due to upstream failure.');
        }
        throw error;
      }),
    );
  }
}
