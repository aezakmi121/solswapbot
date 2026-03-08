import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getReferralEarnings } from '../referrals';
import { prisma } from '../../client';

vi.mock('../../client', () => ({
    prisma: {
        swap: {
            aggregate: vi.fn(),
        }
    }
}));

describe('Referral Math Queries', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should mathematically calculate the custom % share correctly based on total fee sum', async () => {
        vi.mocked(prisma.swap.aggregate).mockResolvedValue({
            _sum: { 
                feeAmountUsd: { toNumber: () => 100 } 
            }
        } as any);

        const earnings = await getReferralEarnings('user-1', 25);
        expect(earnings).toBe(25); // 25% of $100
        
        expect(prisma.swap.aggregate).toHaveBeenCalledWith({
            where: {
                user: { referredById: 'user-1' },
                status: 'CONFIRMED',
                feeAmountUsd: { not: null }
            },
            _sum: { feeAmountUsd: true }
        });
    });

    it('should safely return $0.00 if referred users have made no swaps', async () => {
        vi.mocked(prisma.swap.aggregate).mockResolvedValue({
            _sum: { feeAmountUsd: undefined }
        } as any);

        const earnings = await getReferralEarnings('user-1', 25);
        expect(earnings).toBe(0);
    });
});
