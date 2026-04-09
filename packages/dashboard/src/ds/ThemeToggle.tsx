import styles from './ThemeToggle.module.css';

type Theme = 'dark' | 'light';

interface ThemeToggleProps {
  theme?: Theme;
  onToggle?: () => void;
  className?: string;
}

/**
 * Theme toggle button. Accepts theme + onToggle props so the ds/ layer
 * stays decoupled from any specific store. Wire to useUiStore at the call site.
 *
 * Standalone usage (no store): reads/writes localStorage + data-theme directly.
 */
export function ThemeToggle({ theme: themeProp, onToggle, className }: ThemeToggleProps) {
  // Standalone fallback: read current theme from DOM if no prop provided
  const resolvedTheme: Theme =
    themeProp ?? ((document.documentElement.getAttribute('data-theme') as Theme) || 'dark');

  function handleClick() {
    if (onToggle) {
      onToggle();
      return;
    }
    // Standalone: toggle directly
    const next: Theme = resolvedTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('conitens-theme', next);
    } catch {
      // localStorage unavailable
    }
  }

  const classNames = [styles.toggle, className].filter(Boolean).join(' ');

  return (
    <button type="button" className={classNames} onClick={handleClick}>
      {resolvedTheme === 'dark' ? 'Dark' : 'Light'}
    </button>
  );
}
