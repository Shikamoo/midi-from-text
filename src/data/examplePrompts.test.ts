import { describe, expect, it, vi } from 'vitest';
import {
  EXAMPLE_CATEGORIES,
  EXAMPLE_PROMPT_COUNT,
  getPromptsForCategory,
  pickRandomPromptFromCategory,
} from './examplePrompts';

describe('examplePrompts data', () => {
  it('exposes 13 categories and 38 prompts', () => {
    expect(EXAMPLE_CATEGORIES).toHaveLength(13);
    expect(EXAMPLE_PROMPT_COUNT).toBe(38);
  });

  it('returns prompts for a category id', () => {
    const technoPrompts = getPromptsForCategory('techno');
    expect(technoPrompts).toHaveLength(3);
    expect(technoPrompts[0]?.label).toBe('Industrial Techno');
  });

  it('pickRandomPromptFromCategory respects the active category', () => {
    const random = vi.fn().mockReturnValue(0);
    const pick = pickRandomPromptFromCategory('jazz', random);
    expect(pick?.label).toBe(EXAMPLE_CATEGORIES.find((c) => c.id === 'jazz')!.prompts[0].label);
  });
});
