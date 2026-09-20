import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as api from '@/lib/api';
import type { SalonDetail } from '@/lib/types';
import Book from './Book';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    get: vi.fn(),
    post: vi.fn(),
  };
});

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

// Mock SlotPicker to keep Book test fast and focused
vi.mock('@/components/SlotPicker', () => ({
  SlotPicker: ({ onPick }: { onPick: (s: { startAt: string; time: string }) => void }) => (
    <div data-testid="slot-picker">
      <button onClick={() => onPick({ startAt: '2026-10-25T07:00:00Z', time: '10:00' })}>
        Pick 10:00 slot
      </button>
    </div>
  ),
}));

const mockSalonDetail: SalonDetail = {
  id: 'salon-1',
  slug: 'zewditu',
  name: 'Zewditu Hair Studio',
  description: 'Premier natural hair care and styling studio in Bole.',
  city: 'Addis Ababa',
  neighborhood: 'Bole',
  address: 'Bole Atlas',
  phone: '+251911223344',
  email: 'info@zewditu.com',
  instagram: '@zewditu',
  mapUrl: null,
  coverImage: '/images/salons/zewditu.jpg',
  images: [{ id: 'img-1', url: '/images/salons/zewditu.jpg', alt: 'Zewditu' }],
  avgRating: '4.9',
  reviewCount: 20,
  priceLevel: 2,
  isVerified: true,
  isDemo: false,
  bookingMode: 'INSTANT',
  cancellationHours: 24,
  cancellationPolicy: 'Free cancellation up to 24 hours prior',
  paymentMode: 'CASH',
  depositPercent: 0,
  isFavorite: false,
  hours: [
    { dayOfWeek: 1, openMinutes: 540, closeMinutes: 1140, isClosed: false },
    { dayOfWeek: 2, openMinutes: 540, closeMinutes: 1140, isClosed: false },
  ],
  services: [
    {
      id: 'svc-silk',
      name: 'Silk press & thermal style',
      description: 'Clarifying shampoo, deep conditioning mask and sleek silk press finish.',
      durationMinutes: 75,
      priceEtb: '650.00',
      originalPriceEtb: null,
      imageUrl: '/images/services/silk-press.jpg',
      category: { slug: 'hair-styling', name: 'Hair Styling' },
    },
    {
      id: 'svc-nails',
      name: 'Signature Gel Manicure',
      description: 'Cuticle care and high-gloss gel polish.',
      durationMinutes: 45,
      priceEtb: '400.00',
      originalPriceEtb: null,
      imageUrl: '/images/services/manicure.jpg',
      category: { slug: 'nails', name: 'Nails' },
    },
  ],
  staff: [
    {
      id: 'staff-hana',
      displayName: 'Hana Bekele',
      title: 'Master Stylist & Silk Press Specialist',
      bio: 'Over 8 years experience specializing in healthy natural hair.',
      avatarUrl: '/images/staff/staff-hana.jpg',
      specialties: ['Silk press', 'Hair health', 'Precision cuts'],
      serviceIds: ['svc-silk'],
    },
    {
      id: 'staff-selam',
      displayName: 'Selam Tesfaye',
      title: 'Senior Hair Stylist',
      bio: 'Creative colorist and styling expert.',
      avatarUrl: '/images/staff/staff-selam.jpg',
      specialties: ['Silk press', 'Balayage'],
      serviceIds: ['svc-silk'],
    },
  ],
  reviews: [],
};

function renderBook(initialEntry = '/book/zewditu') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/book/:slug" element={<Book />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Book page - Professional & Service Selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue(mockSalonDetail);
  });

  it('navigates from service selection to professional selection', async () => {
    renderBook();

    // Step 0: Choose a service
    expect(await screen.findByText('Choose a service')).toBeInTheDocument();
    const serviceButton = screen.getByRole('button', { name: /Silk press & thermal style/i });
    expect(serviceButton).toBeInTheDocument();
    expect(screen.getByText('ETB 650')).toBeInTheDocument();

    // Click service to advance to Step 1
    await userEvent.click(serviceButton);

    // Step 1: Choose a professional
    expect(await screen.findByText(/Who would you like for your silk press/i)).toBeInTheDocument();
    expect(screen.getByText('Any available professional')).toBeInTheDocument();
    expect(screen.getByText('Hana Bekele')).toBeInTheDocument();
    expect(screen.getByText('Selam Tesfaye')).toBeInTheDocument();
    expect(screen.getByText('Master Stylist & Silk Press Specialist')).toBeInTheDocument();
    expect(screen.getByText('Precision cuts')).toBeInTheDocument();
  });

  it('allows choosing a specific professional and displays them on the date step', async () => {
    // Arriving with service already chosen in query params
    renderBook('/book/zewditu?service=svc-silk');

    // Should open on Step 1 (Professional selection)
    expect(await screen.findByText('Hana Bekele')).toBeInTheDocument();

    // Click on Hana Bekele
    const hanaButton = screen.getByRole('button', { name: /Hana Bekele/i });
    await userEvent.click(hanaButton);

    // Step 2: Pick date and time
    expect(await screen.findByText('Pick a date and time')).toBeInTheDocument();
    expect(screen.getByText('Chosen Professional')).toBeInTheDocument();
    // Hana is listed as chosen professional in both the step banner and the sidebar summary
    expect(screen.getAllByText('Hana Bekele').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: /Change professional/i })).toBeInTheDocument();

    // Clicking "Change professional" takes user back to Step 1
    await userEvent.click(screen.getByRole('button', { name: /Change professional/i }));
    expect(await screen.findByText(/Who would you like for your silk press/i)).toBeInTheDocument();
  });

  it('allows choosing "Any available professional"', async () => {
    renderBook('/book/zewditu?service=svc-silk');

    expect(await screen.findByText('Any available professional')).toBeInTheDocument();
    const anyButton = screen.getByRole('button', { name: /Any available professional/i });
    await userEvent.click(anyButton);

    // Moves to Step 2 with "Any available professional"
    expect(await screen.findByText('Pick a date and time')).toBeInTheDocument();
    expect(screen.getAllByText('Any available professional').length).toBeGreaterThan(0);
  });
});
