import { DEFAULT_SETTINGS, defaultRules, type Goal, type RecurringItem } from '@finance/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { tx } from '../src/testing/factories.js';
import { clearDatabase, closeTestApp, createTestApp } from '../src/testing/test-app.js';
import { api } from './helpers.js';

/** Rules, settings, budgets, goals and bills. */
describe('catalog endpoints', () => {
  let app: NestExpressApplication;
  beforeAll(async () => (app = await createTestApp()));
  afterAll(() => closeTestApp(app));

  describe('seeding', () => {
    it('starts with the default rules and settings', async () => {
      expect((await api(app).get('/api/rules').expect(200)).body).toHaveLength(defaultRules().length);
      await api(app).get('/api/settings').expect(200, DEFAULT_SETTINGS);
    });
  });

  describe('/api/rules', () => {
    beforeEach(() => clearDatabase(app));

    it('adds a rule and re-categorises the automatic transactions it matches', async () => {
      await api(app).post('/api/transactions/bulk').send({
        transactions: [tx({ id: 'a', description: 'pizza', category: 'Outros' }), tx({ id: 'b', description: 'pizza', category: 'Casa', categorySource: 'manual' })],
      });
      const rule = { id: 'r1', keyword: 'pizza', category: 'Restaurante', priority: 50 };
      await api(app).post('/api/rules').send(rule).expect(201, { rule, updated: 1 });
      const txs = (await api(app).get('/api/transactions?year=2026')).body;
      expect(txs.find((t: { id: string }) => t.id === 'a').category).toBe('Restaurante');
      expect(txs.find((t: { id: string }) => t.id === 'b').category).toBe('Casa');
      await api(app).get('/api/rules').expect(200, [rule]);
    });

    it('validates and deletes rules', async () => {
      await api(app).post('/api/rules').send({ id: 'r', keyword: '', category: 'X', priority: 1 }).expect(400);
      await api(app).post('/api/rules').send({ id: 'r', keyword: 'k', category: 'X', priority: 1 }).expect(201);
      await api(app).delete('/api/rules/r').expect(204);
      await api(app).get('/api/rules').expect(200, []);
    });
  });

  describe('/api/settings', () => {
    beforeEach(() => clearDatabase(app));

    it('patches over the defaults', async () => {
      const res = await api(app).patch('/api/settings').send({ theme: 'dark', eurBrlRate: 6.1 }).expect(200);
      expect(res.body).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark', eurBrlRate: 6.1 });
      await api(app).get('/api/settings').expect(200, res.body);
    });

    it('rejects invalid values', async () => {
      await api(app).patch('/api/settings').send({ theme: 'pink' }).expect(400);
      await api(app).patch('/api/settings').send({ savingsRateTarget: 2 }).expect(400);
    });
  });

  describe('/api/budgets', () => {
    beforeEach(() => clearDatabase(app));

    it('saves, replaces, bulk-saves and removes limits', async () => {
      await api(app).put('/api/budgets/Sa%C3%BAde').send({ monthlyLimit: 80 }).expect(204);
      await api(app).put('/api/budgets/Sa%C3%BAde').send({ monthlyLimit: 90 }).expect(204);
      await api(app).get('/api/budgets').expect(200, [{ category: 'Saúde', monthlyLimit: 90 }]);

      await api(app).post('/api/budgets/bulk').send({ budgets: [{ category: 'Lazer', monthlyLimit: 50 }, { category: 'Saúde', monthlyLimit: 0 }] }).expect(204);
      await api(app).get('/api/budgets').expect(200, [{ category: 'Lazer', monthlyLimit: 50 }]);

      await api(app).post('/api/budgets/bulk-delete').send({ categories: ['Lazer'] }).expect(204);
      await api(app).get('/api/budgets').expect(200, []);
    });

    it('a zero limit removes the budget', async () => {
      await api(app).put('/api/budgets/Lazer').send({ monthlyLimit: 50 });
      await api(app).put('/api/budgets/Lazer').send({ monthlyLimit: 0 }).expect(204);
      await api(app).get('/api/budgets').expect(200, []);
    });

    it('requires a numeric limit', async () => {
      await api(app).put('/api/budgets/Lazer').send({ monthlyLimit: 'a lot' }).expect(400);
    });
  });

  describe('/api/goals', () => {
    beforeEach(() => clearDatabase(app));
    const goal: Goal = {
      id: 'g1',
      name: 'Viagem',
      target: 2000,
      currency: 'EUR',
      targetDate: '2027-06-01',
      source: 'manual',
      contributions: [{ date: '2026-10-01', amount: 100 }],
      createdAt: '2026-10-01T00:00:00.000Z',
    };

    it('saves, lists and deletes goals', async () => {
      await api(app).put('/api/goals/g1').send(goal).expect(204);
      await api(app).get('/api/goals').expect(200, [goal]);
      await api(app).delete('/api/goals/g1').expect(204);
      await api(app).get('/api/goals').expect(200, []);
    });

    it('validates goals', async () => {
      await api(app).put('/api/goals/g1').send({ ...goal, currency: 'USD' }).expect(400);
      await api(app).put('/api/goals/g1').send({ ...goal, contributions: [{ date: 'yesterday', amount: 1 }] }).expect(400);
      await api(app).put('/api/goals/other').send(goal).expect(400);
    });
  });

  describe('/api/recurring', () => {
    beforeEach(() => clearDatabase(app));
    const rent: RecurringItem = { key: 'fixed|Aluguel', type: 'fixed', description: 'Aluguel', dueDay: 5, expectedAmount: 900, active: true };
    const path = `/api/recurring/${encodeURIComponent(rent.key)}`;

    it('saves and lists lines', async () => {
      await api(app).put(path).send(rent).expect(204);
      await api(app).get('/api/recurring').expect(200, [rent]);
      await api(app).put(path).send({ ...rent, dueDay: 40 }).expect(400);
    });

    it('renames a line: the old key is tombstoned and the transactions re-labelled', async () => {
      await api(app).put(path).send(rent);
      const next = { ...rent, key: 'fixed|Renda', description: 'Renda' };
      const renamed = [tx({ id: 'a', type: 'fixed', description: 'Renda' })];
      await api(app).post('/api/recurring/update').send({ previous: rent, next, renamed }).expect(204);

      const items = (await api(app).get('/api/recurring')).body;
      expect(items).toEqual(
        expect.arrayContaining([
          { ...rent, removed: true, active: false },
          { ...next, removed: false },
        ]),
      );
      const txs = (await api(app).get('/api/transactions?year=2026')).body;
      expect(txs).toEqual([expect.objectContaining({ id: 'a', description: 'Renda', updatedAt: expect.any(String) })]);
    });

    it('removes a line by tombstoning it; unknown keys answer 404', async () => {
      await api(app).put(path).send(rent);
      await api(app).delete(path).expect(204);
      await api(app).get('/api/recurring').expect(200, [{ ...rent, removed: true, active: false }]);
      await api(app).delete('/api/recurring/nope').expect(404);
    });
  });
});
