# Time-Off Microservice

Professional-grade time-off management service built with NestJS, TypeORM, and SQLite.

## Project Overview
This service was Architected using an AI-augmented development workflow with a focus on high-integrity distributed systems. (AI coding assistant) following a strict Technical Requirements Document (TRD). The development lifecycle integrated CodeRabbit for automated code reviews.

## Development Workflow
1. Development was conducted primarily on the `dev` branch.
2. Code was pushed to the `dev` branch for automated review by CodeRabbit.
3. CodeRabbit suggestions regarding data integrity and concurrency were implemented.
4. Final hardened code was validated and prepared for merge into `main`.

## Setup and Installation

### 1. Install Dependencies
Run the following command in the project root to install all required packages:
```bash
npm install
```

### 2. Environment Configuration
The service requires specific environment variables to function correctly. Copy the example configuration to create your local environment file:
```bash
cp .env.example .env
```
*Note: Ensure the `HCM_BASE_URL` in your `.env` is set to `http://localhost:4000/hcm` to match the Mock HCM server.*

## Execution Guide
To run the full system with defensive verification and HCM simulation, utilize three separate terminal sessions:

### Terminal 1: Application Server
Start the main NestJS application:
```bash
npm install
npm run start:dev
```

### Terminal 2: Mock HCM Server
Start the stateful HCM simulation server:
```bash
node scripts/mock-hcm.js
```

### Terminal 3: Seed and Test
Reset the database and submit a test request:
```bash
# Optional: Seed or reset test data
node scripts/seed-db.js

# Submit a time-off request (PowerShell)
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/time-off" -Method Post -ContentType "application/json" -Body '{"employeeId": "employee-123", "locationId": "loc-1", "leaveType": "ANNUAL", "startDate": "2026-05-01", "endDate": "2026-05-05", "daysRequested": 5}'

# View request history
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/time-off/employee-123" -Method Get
```

## Testing Suite

The service includes a comprehensive testing suite to ensure data integrity and fault tolerance.

### 1. Unit Tests
Focuses on the optimistic locking logic and arithmetic reconciliation within the service layer.
```bash
# Run service unit tests
npm test src/services/balance.service.spec.js
```

### 2. End-to-End (E2E) Tests
Validates the full API lifecycle using a virtual test environment.
```bash
# Run all E2E tests
npm run test:e2e
```

### 3. Chaos Resilience Test
Automates the simulation of an HCM outage and verifies that the system correctly queues and recovers the request once HCM is restored.
**Prerequisite**: Ensure both the Main Service and Mock HCM are running.
```bash
# Execute recovery simulation
node scripts/chaos-test.js
```

#### What to expect in each terminal during the Chaos Test:

*   **Terminal 1 (Main App)**:
    *   Will log `HCM Sync failed... Moving to HCM_ERROR` when the request is first submitted.
    *   Will log `Enqueued Retry Job` for the failed request.
    *   After recovery, will log `Successfully retried HCM job` once the cron worker (30s interval) picks it up.
*   **Terminal 2 (Mock HCM)**:
    *   Will show `Outage mode flipped to: ON`.
    *   Will log `POST deduct rejected: Outage Enabled (503)`.
    *   Will show `Outage mode flipped to: OFF` followed by successful deduction logs.
*   **Terminal 3 (Chaos Script)**:
    *   Will display a step-by-step walkthrough: `Enabling Outage` -> `Submitting Request` -> `Disabling Outage` -> `Waiting for Cron` -> `✅ PASS`.

## Key Technical Measures
- **Optimistic Locking**: Strict version-based concurrency control in BalanceService.
- **Arithmetic Reconciliation**: Verification of HCM balances with 0.01 rounding tolerance.
- **Circuit Breaker**: Automated failover and retry queueing (max 4-hour window).
- **Idempotency**: SHA-256 redacted keys with configurable TTL.
- **WAL Mode**: SQLite Write-Ahead Logging for high-concurrency performance.
