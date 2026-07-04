import { useState } from 'react';
import {
  DEFAULT_EXAMPLE_CATEGORY_ID,
  EXAMPLE_CATEGORIES,
  pickRandomPromptFromCategory,
} from '../data/examplePrompts';

// ── Shared panel content ──────────────────────────────────────────────────────

interface PanelProps {
  activeCategory: string;
  onCategoryChange: (categoryId: string) => void;
  onSelect: (text: string) => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onClose?: () => void;
  showCollapseControl?: boolean;
}

function ExamplesPanel({
  activeCategory,
  onCategoryChange,
  onSelect,
  collapsed = false,
  onCollapsedChange,
  onClose,
  showCollapseControl = false,
}: PanelProps) {
  const active = EXAMPLE_CATEGORIES.find((category) => category.id === activeCategory);
  const prompts = active?.prompts ?? [];

  function handleSurpriseMe() {
    const pick = pickRandomPromptFromCategory(activeCategory);
    if (pick) onSelect(pick.text);
  }

  if (collapsed) {
    return (
      <div className="examples-panel examples-panel--collapsed">
        <button
          type="button"
          className="examples-collapse-btn"
          onClick={() => onCollapsedChange?.(false)}
          aria-label="Expand examples sidebar"
          title="Expand examples"
        >
          ‹
        </button>
        <span className="examples-collapsed-label" aria-hidden="true">
          Examples
        </span>
      </div>
    );
  }

  return (
    <div className="examples-panel">
      <header className="examples-panel-header">
        <div className="examples-panel-title-row">
          <h2 className="examples-panel-title">Examples</h2>
          <div className="examples-panel-actions">
            <button
              type="button"
              className="examples-surprise-btn"
              onClick={handleSurpriseMe}
              disabled={prompts.length === 0}
              title="Load a random prompt from the selected genre"
            >
              Surprise me
            </button>
            {showCollapseControl && (
              <button
                type="button"
                className="examples-collapse-btn"
                onClick={() => onCollapsedChange?.(true)}
                aria-label="Collapse examples sidebar"
                title="Collapse"
              >
                ›
              </button>
            )}
            {onClose && (
              <button
                type="button"
                className="examples-close-btn"
                onClick={onClose}
                aria-label="Close examples"
              >
                ×
              </button>
            )}
          </div>
        </div>
        <p className="examples-panel-subtitle">
          {active ? `${active.label} · ${prompts.length} prompts` : 'Pick a genre to browse'}
        </p>
      </header>

      <nav className="examples-category-nav" aria-label="Example genres">
        {EXAMPLE_CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            className={`examples-category-btn${
              category.id === activeCategory ? ' examples-category-btn--active' : ''
            }`}
            onClick={() => onCategoryChange(category.id)}
            aria-current={category.id === activeCategory ? 'true' : undefined}
          >
            {category.label}
          </button>
        ))}
      </nav>

      <div className="examples-prompt-list" aria-label={`${active?.label ?? 'Genre'} examples`}>
        {prompts.length === 0 ? (
          <p className="examples-empty-state">Pick a genre to browse examples</p>
        ) : (
          prompts.map((prompt) => (
            <button
              key={prompt.label}
              type="button"
              className="examples-prompt-card"
              onClick={() => onSelect(prompt.text)}
              title={prompt.text}
              aria-label={prompt.label}
            >
              <span className="examples-prompt-card-label">{prompt.label}</span>
              <span className="examples-prompt-card-text">{prompt.text}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ExamplesLibraryProps {
  onSelect: (text: string) => void;
  drawerOpen: boolean;
  onDrawerOpenChange: (open: boolean) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

export function ExamplesMobileTrigger({
  onClick,
  expanded = false,
}: {
  onClick: () => void;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      className="examples-mobile-trigger"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={expanded}
    >
      Examples
    </button>
  );
}

export function ExamplesLibrary({
  onSelect,
  drawerOpen,
  onDrawerOpenChange,
  collapsed,
  onCollapsedChange,
}: ExamplesLibraryProps) {
  const [activeCategory, setActiveCategory] = useState(DEFAULT_EXAMPLE_CATEGORY_ID);

  function handleSelect(text: string) {
    onSelect(text);
  }

  function handleDrawerSelect(text: string) {
    onSelect(text);
    onDrawerOpenChange(false);
  }

  const sharedPanelProps = {
    activeCategory,
    onCategoryChange: setActiveCategory,
  };

  return (
    <>
      <aside
        className="examples-sidebar examples-sidebar--desktop"
        aria-label="Example prompts"
        data-collapsed={collapsed ? 'true' : 'false'}
      >
        <ExamplesPanel
          {...sharedPanelProps}
          onSelect={handleSelect}
          collapsed={collapsed}
          onCollapsedChange={onCollapsedChange}
          showCollapseControl
        />
      </aside>

      {drawerOpen && (
        <div className="examples-drawer-root" role="presentation">
          <button
            type="button"
            className="examples-drawer-backdrop"
            onClick={() => onDrawerOpenChange(false)}
            aria-label="Close examples"
          />
          <aside
            className="examples-sidebar examples-sidebar--drawer"
            role="dialog"
            aria-label="Example prompts"
            aria-modal="true"
          >
            <ExamplesPanel
              {...sharedPanelProps}
              onSelect={handleDrawerSelect}
              onClose={() => onDrawerOpenChange(false)}
            />
          </aside>
        </div>
      )}
    </>
  );
}

// Re-export counts for any existing imports
export { EXAMPLE_PROMPT_COUNT } from '../data/examplePrompts';
