export class CircuitBreakerOpenException extends Error {
  constructor(message) {
    super(message);
    this.name = 'CircuitBreakerOpenException';
  }
}
