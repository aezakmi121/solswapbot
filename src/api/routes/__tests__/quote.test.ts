import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../../server';
import { getQuote } from '../../../jupiter/quote';
import { getTokenPriceUsd, estimateFeeUsd } from '../../../jupiter/price';
import { getTokenDecimals } from '../../../jupiter/tokens';

// Mock auth middleware to let us pass telegramId via header easily
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

// Mock Jupiter utilities
vi.mock('../../../jupiter/quote', () => ({
    getQuote: vi.fn(),
}));
vi.mock('../../../jupiter/price', () => ({
    getTokenPriceUsd: vi.fn(),
    estimateFeeUsd: vi.fn(),
}));
vi.mock('../../../jupiter/tokens', () => ({
    getTokenDecimals: vi.fn(),
}));

describe('GET /api/quote', () => {
    const app = createApiServer();
    const VALID_MINT_1 = 'So11111111111111111111111111111111111111112';
    const VALID_MINT_2 = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getTokenDecimals).mockResolvedValue(6);
        vi.mocked(getTokenPriceUsd).mockResolvedValue(1.0);
        vi.mocked(estimateFeeUsd).mockResolvedValue(0.05);
        vi.mocked(getQuote).mockResolvedValue({
            outAmount: '1500000',
            priceImpactPct: '0.1',
            slippageBps: 50,
            platformFee: { amount: '50000' }
        } as any);
    });

    it('should reject requests without auth header', async () => {
        const res = await request(app).get('/api/quote');
        expect(res.status).toBe(401);
    });

    it('should reject missing params', async () => {
        const res = await request(app)
            .get('/api/quote')
            .set('Authorization', 'tma 12345');
        
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Missing required params');
    });

    it('should validate mint addresses', async () => {
        const res = await request(app)
            .get('/api/quote?inputMint=bad&outputMint=bad&humanAmount=1')
            .set('Authorization', 'tma 12345');
            
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Invalid mint address');
    });

    it('should process humanAmount correctly and return full quote object', async () => {
        const res = await request(app)
            .get(`/api/quote?inputMint=${VALID_MINT_1}&outputMint=${VALID_MINT_2}&humanAmount=1.5`)
            .set('Authorization', 'tma 12345');

        expect(res.status).toBe(200);
        // humanAmount of 1.5 with 6 decimals = "1500000" in smallest units
        expect(getQuote).toHaveBeenCalledWith(expect.objectContaining({
            inputMint: VALID_MINT_1,
            outputMint: VALID_MINT_2,
            amount: '1500000'
        }));
        
        expect(res.body.display).toBeDefined();
        expect(res.body.display.inputAmount).toBe(1.5);
    });
});
