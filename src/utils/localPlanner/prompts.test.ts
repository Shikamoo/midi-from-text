import { describe, expect, it } from 'vitest';
import { buildRepairUserMessage } from './prompts';

describe('buildRepairUserMessage', () => {
  it('includes previous JSON, validation errors, and strict output instruction', () => {
    const message = buildRepairUserMessage(
      { prompt: 'test', style: '' },
      ['style: String must contain at least 1 character(s)'],
    );

    expect(message).toContain('PREVIOUS JSON:');
    expect(message).toContain('"style": ""');
    expect(message).toContain('VALIDATION ERRORS:');
    expect(message).toContain('style: String must contain at least 1 character(s)');
    expect(message).toMatch(/Return corrected JSON only\. No markdown\. No explanation\./);
  });
});
