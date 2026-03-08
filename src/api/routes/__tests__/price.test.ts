import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../../server';
import { getTokenPriceUsd } from '../../../jupiter/price';

// Mock the external Jupiter price call
vi.mock('../../../jupiter/price', () => ({
  getTokenPriceUsd: vi.fn(),
}));

describe('GET /api/price/:mint', () => {
  const app = createApiServer();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 for invalid Solana address (not ed25519)', async () => {
    const res = await request(app).get('/api/price/invalid_string_not_ed25519');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid mint address' });
  });

  it('should return 400 for empty mint address', async () => {
    // Express maps /api/price/ to a different route but checking parameter handling
    // We can simulate an empty string that passes routing
    const res = await request(app).get('/api/price/123'); // too short
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid mint address' });
  });

  it('should return 404 if price not found for valid token', async () => {
    vi.mocked(getTokenPriceUsd).mockResolvedValue(null);
    const validAddress = 'So11111111111111111111111111111111111111112'; // Valid format
    const res = await request(app).get(`/api/price/${validAddress}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Price not found for this token' });
    expect(getTokenPriceUsd).toHaveBeenCalledWith(validAddress);
  });

  it('should return 200 and the correct price', async () => {
    vi.mocked(getTokenPriceUsd).mockResolvedValue(123.45);
    const validAddress = 'So11111111111111111111111111111111111111112';
    const res = await request(app).get(`/api/price/${validAddress}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mint: validAddress, priceUsd: 123.45 });
    expect(getTokenPriceUsd).toHaveBeenCalledWith(validAddress);
  });
});
