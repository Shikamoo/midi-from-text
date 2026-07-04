// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ExamplesLibrary,
  ExamplesMobileTrigger,
} from './ExamplesLibrary';
import { EXAMPLE_CATEGORIES } from '../data/examplePrompts';

afterEach(() => {
  cleanup();
});

function getDesktopSidebar() {
  const sidebar = document.querySelector('.examples-sidebar--desktop');
  if (!sidebar) throw new Error('Desktop examples sidebar not found');
  return sidebar as HTMLElement;
}

function renderLibrary(overrides: Partial<Parameters<typeof ExamplesLibrary>[0]> = {}) {
  const onSelect = vi.fn();
  const onDrawerOpenChange = vi.fn();
  const onCollapsedChange = vi.fn();

  const props = {
    onSelect,
    drawerOpen: false,
    onDrawerOpenChange,
    collapsed: false,
    onCollapsedChange,
    ...overrides,
  };

  const view = render(<ExamplesLibrary {...props} />);
  return { ...view, onSelect, onDrawerOpenChange, onCollapsedChange };
}

describe('ExamplesLibrary — desktop sidebar', () => {
  it('renders all category buttons and default category prompts', () => {
    renderLibrary();
    const desktop = within(getDesktopSidebar());

    for (const category of EXAMPLE_CATEGORIES) {
      expect(desktop.getByRole('button', { name: category.label })).toBeInTheDocument();
    }

    const defaultCategory = EXAMPLE_CATEGORIES[0];
    for (const prompt of defaultCategory.prompts) {
      expect(desktop.getByRole('button', { name: prompt.label })).toBeInTheDocument();
    }
  });

  it('filters prompts when a category is selected', async () => {
    const user = userEvent.setup();
    renderLibrary();
    const desktop = within(getDesktopSidebar());

    const techno = EXAMPLE_CATEGORIES.find((category) => category.id === 'techno')!;
    await user.click(desktop.getByRole('button', { name: techno.label }));

    expect(desktop.getByRole('button', { name: 'Industrial Techno' })).toBeInTheDocument();
    expect(desktop.queryByRole('button', { name: 'Deep House Chords' })).not.toBeInTheDocument();
  });

  it('inserts prompt text when a prompt card is clicked', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderLibrary();
    const desktop = within(getDesktopSidebar());

    const housePrompt = EXAMPLE_CATEGORIES[0].prompts[0];
    await user.click(desktop.getByRole('button', { name: housePrompt.label }));

    expect(onSelect).toHaveBeenCalledWith(housePrompt.text);
  });
});

describe('ExamplesLibrary — mobile drawer', () => {
  it('opens the drawer when the mobile trigger is used', async () => {
    const user = userEvent.setup();
    const onDrawerOpenChange = vi.fn();

    render(
      <>
        <ExamplesMobileTrigger onClick={() => onDrawerOpenChange(true)} />
        <ExamplesLibrary
          onSelect={vi.fn()}
          drawerOpen={false}
          onDrawerOpenChange={onDrawerOpenChange}
          collapsed={false}
          onCollapsedChange={vi.fn()}
        />
      </>,
    );

    expect(screen.queryByRole('dialog', { name: 'Example prompts' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Examples' }));
    expect(onDrawerOpenChange).toHaveBeenCalledWith(true);
  });

  it('shows drawer content when drawerOpen is true', () => {
    renderLibrary({ drawerOpen: true });

    const drawer = screen.getByRole('dialog', { name: 'Example prompts' });
    expect(drawer).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Deep House Chords' })).toBeInTheDocument();
  });
});

describe('ExamplesLibrary — Surprise me', () => {
  it('chooses a prompt from the active category', async () => {
    const user = userEvent.setup();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { onSelect } = renderLibrary();
    const desktop = within(getDesktopSidebar());

    const trap = EXAMPLE_CATEGORIES.find((category) => category.id === 'trap')!;
    await user.click(desktop.getByRole('button', { name: trap.label }));
    await user.click(desktop.getByRole('button', { name: 'Surprise me' }));

    const expected = trap.prompts[trap.prompts.length - 1];
    expect(onSelect).toHaveBeenCalledWith(expected.text);

    randomSpy.mockRestore();
  });
});
