import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import { Button, FormError, Input, StatusBadge } from './index';

describe('ui', () => {
  it('Button does not submit a surrounding form unless asked', async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(<form onSubmit={onSubmit}><Button>Plain</Button><Button type="submit">Send</Button></form>);
    await userEvent.click(screen.getByRole('button', { name: 'Plain' }));
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
  it('Input links its label and announces errors', () => {
    render(<Input label="Phone" error="Enter a valid phone" />);
    const input = screen.getByLabelText('Phone');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid phone');
  });
  it('FormError shows API messages and a safe fallback for unknown errors', () => {
    const { rerender } = render(<FormError error={new ApiError(409, 'SLOT_UNAVAILABLE', 'That time was just taken')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('That time was just taken');
    rerender(<FormError error={new Error('stack trace internals')} />);
    expect(screen.getByRole('alert')).not.toHaveTextContent('stack trace');
  });
  it('StatusBadge uses customer-friendly labels', () => {
    render(<MemoryRouter><StatusBadge status="NO_SHOW" /><StatusBadge status="PENDING" /></MemoryRouter>);
    expect(screen.getByText('No-show')).toBeInTheDocument();
    expect(screen.getByText('Awaiting approval')).toBeInTheDocument();
  });
});
