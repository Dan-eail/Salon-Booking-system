import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { SlotPicker } from './SlotPicker';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    get: vi.fn(),
  };
});

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('SlotPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders notice when no service is selected', () => {
    wrap(
      <SlotPicker
        slug="test-salon"
        serviceId=""
        date=""
        onDate={() => {}}
        startAt={null}
        onPick={() => {}}
      />
    );
    expect(screen.getByText('Choose a service to see open times.')).toBeInTheDocument();
  });

  it('renders available dates and slot buttons, and triggers onPick', async () => {
    const onDate = vi.fn();
    const onPick = vi.fn();

    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path.includes('availability-range')) {
        return [
          { date: '2026-10-25', slots: 3 },
          { date: '2026-10-26', slots: 0 },
        ];
      }
      if (path.includes('availability')) {
        return {
          slots: [
            { time: '09:00', startAt: '2026-10-25T06:00:00Z', staffIds: ['staff-1'] },
            { time: '10:00', startAt: '2026-10-25T07:00:00Z', staffIds: ['staff-1', 'staff-2'] },
          ],
        };
      }
      return null;
    });

    wrap(
      <SlotPicker
        slug="test-salon"
        serviceId="svc-1"
        staffId="staff-1"
        date="2026-10-25"
        onDate={onDate}
        startAt={null}
        onPick={onPick}
      />
    );

    // Wait for slot buttons to render
    const slot09 = await screen.findByRole('button', { name: '9:00 AM' });
    const slot10 = screen.getByRole('button', { name: '10:00 AM' });
    expect(slot09).toBeInTheDocument();
    expect(slot10).toBeInTheDocument();

    await userEvent.click(slot09);
    expect(onPick).toHaveBeenCalledWith({
      time: '09:00',
      startAt: '2026-10-25T06:00:00Z',
      staffIds: ['staff-1'],
    });
  });

  it('shows message when salon is fully booked on the selected day', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path.includes('availability-range')) {
        return [{ date: '2026-10-25', slots: 0 }];
      }
      if (path.includes('availability')) {
        return { slots: [] };
      }
      return null;
    });

    wrap(
      <SlotPicker
        slug="test-salon"
        serviceId="svc-1"
        date="2026-10-25"
        onDate={() => {}}
        startAt={null}
        onPick={() => {}}
      />
    );

    expect(await screen.findByText('Fully booked on this day.')).toBeInTheDocument();
  });
});
