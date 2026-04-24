import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HcmClientService } from '../src/services/hcm-client.service';
import { DataSource } from 'typeorm';

describe('TimeOff (e2e)', () => {
  let app;
  let dataSource;

  // Mock HCM responses
  const hcmClientMock = {
    deductBalance: jest.fn().mockResolvedValue({ transactionId: 'test-tx-123' }),
    getBalance: jest.fn().mockResolvedValue({ balance: 15.0 }),
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
    .overrideProvider(HcmClientService)
    .useValue(hcmClientMock)
    .compile();

    app = moduleFixture.createNestApplication();
    dataSource = app.get(DataSource);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /time-off should create an APPROVED request when HCM sync succeeds', async () => {
    // Ensure we have a balance in the test DB
    // (Note: In a real E2E we might use a dedicated test DB, here we use the configured one)
    await dataSource.query('DELETE FROM leave_balance WHERE employeeId = ?', ['e2e-emp-1']);
    await dataSource.query(
      'INSERT INTO leave_balance (id, employeeId, locationId, leaveType, balance, pendingDeductions, version) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['e2e-uuid-1', 'e2e-emp-1', 'loc-1', 'ANNUAL', 20.0, 0, 1]
    );

    const payload = {
      employeeId: 'e2e-emp-1',
      locationId: 'loc-1',
      leaveType: 'ANNUAL',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      daysRequested: 5
    };

    const response = await request(app.getHttpServer())
      .post('/time-off')
      .set('x-idempotency-key', 'e2e-key-' + Date.now())
      .send(payload)
      .expect(201);

    expect(response.body.status).toBe('APPROVED');
    expect(response.body.hcmTransactionId).toBe('test-tx-123');
    
    // Verify local balance was committed
    const balance = await dataSource.query('SELECT * FROM leave_balance WHERE employeeId = ?', ['e2e-emp-1']);
    expect(Number(balance[0].balance)).toBe(15.0);
    expect(Number(balance[0].pendingDeductions)).toBe(0);
  });

  it('GET /time-off/:employeeId should return history', async () => {
    const response = await request(app.getHttpServer())
      .get('/time-off/e2e-emp-1')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0].employeeId).toBe('e2e-emp-1');
  });
});
