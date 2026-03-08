import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../../server';
import { findUserByTelegramId } from '../../../db/queries/users';
import { getTransactions } from '../../../db/queries/transactions';

vi.mock('../../middleware/telegramAuth', () => ({
    telegramAuthMiddleware: (req: any, res: any, next: any) => {
        const auth = req.headers.authorization;
        if (auth && auth.startsWith('tma ')) {
            res.locals.telegramId = auth.split(' ')[1];
            return next();
        }
        res.status(401).json({ error: 'Auth failed' });
    }
}));

vi.mock('../../../db/queries/users', () => ({
    findUserByTelegramId: vi.fn(),
}));

vi.mock('../../../db/queries/transactions', () => ({
    getTransactions: vi.fn(),
}));

describe('GET /api/transactions', () => {
    const app = createApiServer();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(findUserByTelegramId).mockResolvedValue({ id: 'user-1' } as any);
        vi.mocked(getTransactions).mockResolvedValue({
            transactions: [],
            total: 0,
            hasMore: false
        });
    });

    it('should reject requests without auth header', async () => {
        const res = await request(app).get('/api/transactions');
        expect(res.status).toBe(401);
    });

    it('should return 400 for invalid type', async () => {
        const res = await request(app)
            .get('/api/transactions?type=unknown_type')
            .set('Authorization', 'tma 12345');
        
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid type');
    });

    it('should return 400 for invalid preset', async () => {
        const res = await request(app)
            .get('/api/transactions?preset=last_year')
            .set('Authorization', 'tma 12345');
        
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid preset');
    });

    it('should parse pagination params correctly', async () => {
        const res = await request(app)
            .get('/api/transactions?limit=15&offset=5')
            .set('Authorization', 'tma 12345');
        
        expect(res.status).toBe(200);
        expect(getTransactions).toHaveBeenCalledWith(expect.objectContaining({
            limit: 15,
            offset: 5,
            type: 'all'
        }));
    });

    it('should clamp limit to max 50', async () => {
        const res = await request(app)
            .get('/api/transactions?limit=1000')
            .set('Authorization', 'tma 12345');
        
        expect(res.status).toBe(200);
        expect(getTransactions).toHaveBeenCalledWith(expect.objectContaining({
            limit: 50
        }));
    });
});
