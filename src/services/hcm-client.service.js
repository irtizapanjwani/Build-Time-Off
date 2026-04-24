import { Injectable, Dependencies, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { CircuitBreakerOpenException } from '../common/exceptions/circuit-breaker.exception.js';

/**
 * @typedef {import('../common/enums/leave-type.enum').LeaveType} LeaveType
 */

const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

@Injectable()
@Dependencies(HttpService, ConfigService)
export class HcmClientService {
  /**
   * @param {HttpService} httpService 
   * @param {ConfigService} configService 
   */
  constructor(httpService, configService) {
    this.httpService = httpService;
    this.configService = configService;
    this.logger = new Logger(HcmClientService.name);

    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.nextAttemptMs = null;
    
    // TRD thresholds: configurable thresholds
    this.failureThreshold = this.configService.get('hcm.circuitThreshold') || 5;
    this.resetTimeoutMs = this.configService.get('hcm.circuitResetMs') || 60000;
  }

  _checkCircuitBreaker() {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() >= this.nextAttemptMs) {
        this.logger.log('Circuit Breaker transitioning from OPEN to HALF_OPEN');
        this.state = CircuitState.HALF_OPEN;
      } else {
        throw new CircuitBreakerOpenException('HCM Circuit Breaker is OPEN. Requests are temporarily halted.');
      }
    }
  }

  _handleSuccess() {
    if (this.state === CircuitState.HALF_OPEN) {
      this.logger.log('Circuit Breaker transitioning from HALF_OPEN to CLOSED');
      this.state = CircuitState.CLOSED;
      this.failureCount = 0;
      this.nextAttemptMs = null;
    } else if (this.state === CircuitState.CLOSED) {
      this.failureCount = 0;
    }
  }

  _handleFailure(error) {
    // Ignore client/business errors (4xx)
    if (error.response && error.response.status >= 400 && error.response.status < 500) {
      throw error;
    }
    this.failureCount++;
    this.logger.warn(`HCM request failed. Failure count: ${this.failureCount}/${this.failureThreshold}`);

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.nextAttemptMs = Date.now() + this.resetTimeoutMs;
      this.logger.error('Circuit Breaker returning to OPEN after HALF_OPEN failure.');
      throw error;
    }

    if (this.failureCount >= this.failureThreshold && this.state !== CircuitState.OPEN) {
      this.state = CircuitState.OPEN;
      this.nextAttemptMs = Date.now() + this.resetTimeoutMs;
      this.logger.error(`Circuit Breaker OPEN. Halting requests for ${this.resetTimeoutMs / 1000} seconds.`);
    }

    throw error;
  }

  /**
   * Deducts balance directly from HCM
   * @param {Object} payload 
   * @returns {Promise<any>}
   */
  async deductBalance(payload) {
    this._checkCircuitBreaker();
    const baseUrl = this.configService.get('hcm.baseUrl');
    const timeoutMs = this.configService.get('hcm.timeoutMs');

    try {
      // Note: Using a mock endpoint for local development testing
      const response = await firstValueFrom(
        this.httpService.post(`${baseUrl}/time-off/deduct`, payload, { timeout: timeoutMs })
      );
      this._handleSuccess();
      return response.data;
    } catch (error) {
      this._handleFailure(error);
    }
  }

  /**
   * Gets current balance from HCM
   * @param {string} employeeId 
   * @param {string} locationId 
   * @param {LeaveType} leaveType 
   * @returns {Promise<any>}
   */
  async getBalance(employeeId, locationId, leaveType) {
    this._checkCircuitBreaker();
    const baseUrl = this.configService.get('hcm.baseUrl');
    const timeoutMs = this.configService.get('hcm.timeoutMs');

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${baseUrl}/time-off/balance`, {
          params: { employeeId, locationId, leaveType },
          timeout: timeoutMs
        })
      );
      this._handleSuccess();
      return response.data;
    } catch (error) {
      this._handleFailure(error);
    }
  }
}
