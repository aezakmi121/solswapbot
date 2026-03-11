import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../../server';
import { findUserByTelegramId } from '../../../db/queries/users';
import { analyzeToken } from '../../../scanner/analyze';
import { prisma } from '../../../db/client';

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

vi.mock('../../../scanner/analyze', () => ({
    analyzeToken: vi.fn(),
}));

vi.mock('../../../db/client', () => ({
    prisma: {
        tokenScan: {
            count: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
        },
        subscription: {
            findUnique: vi.fn(),
        }
    }
}));

describe('GET /api/scan', () => {
    const app = createApiServer();
    const VALID_MINT = 'So11111111111111111111111111111111111111112';

    beforeEach(() => {
        vi.clearAllMocks();
        
        vi.mocked(findUserByTelegramId).mockResolvedValue({ id: 'user-1' } as any);
        vi.mocked(analyzeToken).mockResolvedValue({
            tokenInfo: { name: 'Solana', symbol: 'SOL' },
            riskScore: 10,
            riskLevel: 'LOW',
            checks: []
        } as any);
        
        // Default to under limit
        vi.mocked(prisma.tokenScan.count).mockResolvedValue(2);
        vi.mocked(prisma.subscription.findUnique).mockResolvedValue({ tier: 'FREE' } as any);
    });

    it('should reject without valid mint parameter', async () => {
        const res = await request(app)
            .get('/api/scan')
            .set('Authorization', 'tma 12345');
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Missing');
    });

    it('should reject invalid mint format', async () => {
        const res = await request(app)
            .get('/api/scan?mint=not_a_valid_solana_address_because_length')
            .set('Authorization', 'tma 12345');
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid Solana address');
    });

    it('should allow successful scan if under limit', async () => {
        const res = await request(app)
            .get(`/api/scan?mint=${VALID_MINT}`)
            .set('Authorization', 'tma 12345');
            
        expect(res.status).toBe(200);
        expect(res.body.riskScore).toBe(10);
        expect(prisma.tokenScan.create).toHaveBeenCalled(); // Should log history
    });

    it('should return 429 when FREE user hits 10 scans', async () => {
        // Mock that the user has reached 10 scans today
        vi.mocked(prisma.tokenScan.count).mockResolvedValue(10);
        
        const res = await request(app)
            .get(`/api/scan?mint=${VALID_MINT}`)
            .set('Authorization', 'tma 12345');
            
        expect(res.status).toBe(429);
        expect(res.body.error).toContain('Daily scan limit reached');
    });

    it('should bypass limit if user has PRO subscription', async () => {
        vi.mocked(prisma.tokenScan.count).mockResolvedValue(15); // Over limit
        vi.mocked(prisma.subscription.findUnique).mockResolvedValue({ tier: 'PRO' } as any);
        
        const res = await request(app)
            .get(`/api/scan?mint=${VALID_MINT}`)
            .set('Authorization', 'tma 12345');
            
        expect(res.status).toBe(200); // Should be allowed through
        expect(analyzeToken).toHaveBeenCalled();
    });
});
