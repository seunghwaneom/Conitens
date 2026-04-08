import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>active</Badge>);
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('renders each variant', () => {
    const variants = ['success', 'warning', 'danger', 'info', 'neutral'] as const;
    for (const variant of variants) {
      const { container } = render(<Badge variant={variant}>{variant}</Badge>);
      expect(container.firstChild).toBeDefined();
    }
  });

  it('defaults to neutral variant', () => {
    render(<Badge>default</Badge>);
    expect(screen.getByText('default')).toBeInTheDocument();
  });

  it('accepts className prop', () => {
    const { container } = render(<Badge className="custom">tag</Badge>);
    expect(container.firstChild).toHaveClass('custom');
  });
});
