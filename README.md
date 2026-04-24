# Time-Off Microservice

Professional-grade time-off management service built with NestJS, TypeORM, and SQLite.

## Project Overview
This service was architected and implemented by Antigravity (AI coding assistant) following a strict Technical Requirements Document (TRD). The development lifecycle integrated CodeRabbit for automated code reviews.

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

## Key Technical Measures
- Optimistic Locking: Strict version-based concurrency control in BalanceService.
- Arithmetic Reconciliation: Strict verification of HCM balances after deductions.
- Circuit Breaker: Automated failover and retry queueing during HCM outages.
- Idempotency: Configurable TTL-based request deduplication.
- WAL Mode: SQLite Write-Ahead Logging for high-concurrency read/write performance.
