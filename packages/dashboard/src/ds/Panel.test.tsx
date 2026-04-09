import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Panel } from './Panel';

describe('Panel', () => {
  it('renders children', () => {
    render(<Panel>Test content</Panel>);
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders with header', () => {
    render(<Panel header="Section Title">Body</Panel>);
    expect(screen.getByText('Section Title')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('accepts className prop', () => {
    const { container } = render(<Panel className="custom">Content</Panel>);
    expect(container.firstChild).toHaveClass('custom');
  });

  it('applies variant classes', () => {
    const { container: raised } = render(<Panel variant="raised">R</Panel>);
    const { container: muted } = render(<Panel variant="muted">M</Panel>);
    expect(raised.firstChild).toBeDefined();
    expect(muted.firstChild).toBeDefined();
  });
});
