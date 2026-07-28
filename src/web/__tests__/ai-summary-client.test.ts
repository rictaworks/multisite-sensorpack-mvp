import { AiSummaryQuotaExceededError, createMockAiSummaryClient } from '../components/summary/aiSummaryClient';

describe('createMockAiSummaryClient (stub for the not-yet-deployed Issue #13 backend)', () => {
  it('reports no existing summary before the first generation of the day', async () => {
    const client = createMockAiSummaryClient();

    await expect(client.fetchTodaySummary()).resolves.toBeNull();
  });

  it('generates a data-sufficient summary and stores it for the current quota date', async () => {
    const client = createMockAiSummaryClient();

    const generated = await client.generateSummary();

    expect(generated.dataSufficient).toBe(true);
    expect(generated.summaryText.length).toBeGreaterThan(0);
    expect(generated.quotaDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await expect(client.fetchTodaySummary()).resolves.toEqual(generated);
  });

  it('rejects a second same-day generation with AiSummaryQuotaExceededError carrying the existing summary (requirements.md F7-1)', async () => {
    const client = createMockAiSummaryClient();

    const first = await client.generateSummary();

    await expect(client.generateSummary()).rejects.toBeInstanceOf(AiSummaryQuotaExceededError);

    try {
      await client.generateSummary();
      throw new Error('expected generateSummary to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(AiSummaryQuotaExceededError);
      expect((error as AiSummaryQuotaExceededError).existingSummary).toEqual(first);
    }
  });

  it('keeps state isolated between separate client instances (no shared/global state)', async () => {
    const clientA = createMockAiSummaryClient();
    const clientB = createMockAiSummaryClient();

    await clientA.generateSummary();

    await expect(clientB.fetchTodaySummary()).resolves.toBeNull();
    await expect(clientB.generateSummary()).resolves.toBeTruthy();
  });
});
