import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { SalonCard as SalonCardType } from '@/lib/types';
import { SalonCard } from './SalonCard';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: null,
    ready: true,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
  }),
}));

const mockSalon: SalonCardType = {
  id: 'salon-1',
  slug: 'zewditu-hair',
  name: 'Zewditu Hair Studio',
  city: 'Addis Ababa',
  neighborhood: 'Bole',
  address: 'Bole Atlas, House 124',
  image: '/images/salons/zewditu.jpg',
  avgRating: '4.8',
  reviewCount: 15,
  priceLevel: 2,
  isVerified: true,
  isDemo: false,
  bookingMode: 'INSTANT',
  minPriceEtb: '350.00',
  categories: [{ slug: 'hair-styling', name: 'Hair Styling' }],
  isFavorite: false,
};

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('SalonCard', () => {
  it('renders salon details, image, verified badge and price', () => {
    wrap(<SalonCard salon={mockSalon} />);

    expect(screen.getByText('Zewditu Hair Studio')).toBeInTheDocument();
    expect(screen.getByText(/Bole, Addis Ababa/)).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByText('(15)')).toBeInTheDocument();
    expect(screen.getByText('ETB 350')).toBeInTheDocument();

    const img = screen.getByRole('img', { name: /Zewditu Hair Studio salon/i });
    expect(img).toHaveAttribute('src', '/images/salons/zewditu.jpg');
  });

  it('renders demo badge and fallback when image is null', () => {
    const demoSalon: SalonCardType = {
      ...mockSalon,
      image: null,
      isVerified: false,
      isDemo: true,
      reviewCount: 0,
    };

    wrap(<SalonCard salon={demoSalon} />);
    expect(screen.getByText('Demo listing')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
