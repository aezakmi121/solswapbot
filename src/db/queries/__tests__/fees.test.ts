import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTotalFeesEarned } from '../fees';
import { prisma } from '../../client';

vi.mock('../../client', () => ({
    prisma: {
        swap: {
            aggregate: vi.fn(),
        }
    }
}));

describe('Fee Queries', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should aggregate total protocol fees properly', async () => {
        vi.mocked(prisma.swap.aggregate).mockResolvedValue({
            _sum: { feeAmountUsd: 150.5 }
        } as any);

        const total = await getTotalFeesEarned();
        expect(total).toBe(150.5);
        expect(prisma.swap.aggregate).toHaveBeenCalledWith({
            where: { status: 'CONFIRMED', feeAmountUsd: { not: null } },
            _sum: { feeAmountUsd: true }
        });
    });

    it('should safely return 0 when the DB query returns null sums (no trades yet)', async () => {
        vi.mocked(prisma.swap.aggregate).mockResolvedValue({
            _sum: { feeAmountUsd: null }
        } as any);

        const total = await getTotalFeesEarned();
        expect(total).toBe(0);
    });
});
