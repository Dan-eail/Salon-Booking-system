import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PublicShell } from '@/components/layout/Shell';
import { RequireRole } from '@/components/layout/Dashboard';
import { Spinner } from '@/components/ui';
import Home from '@/pages/Home';
import { ForgotPassword, Login, Register, ResetPassword } from '@/pages/Auth';
import { ForSalons, NotFound, Unauthorized } from '@/pages/Misc';
import Salons from '@/pages/Salons';
import SalonDetail from '@/pages/SalonDetail';

// Booking and dashboards are split out so first paint on a slow phone stays small.
const Book = lazy(() => import('@/pages/Book'));
const Confirmed = lazy(() => import('@/pages/Confirmed'));
const TestCheckout = lazy(() => import('@/pages/TestCheckout'));
const CustomerArea = lazy(() => import('@/pages/dashboard/CustomerArea'));
const OwnerArea = lazy(() => import('@/pages/owner/OwnerArea'));
const AdminArea = lazy(() => import('@/pages/admin/AdminArea'));

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route element={<PublicShell />}>
            <Route index element={<Home />} />
            <Route path="salons" element={<Salons />} />
            <Route path="salons/:slug" element={<SalonDetail />} />
            <Route path="for-salons" element={<ForSalons />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password" element={<ResetPassword />} />
            <Route path="unauthorized" element={<Unauthorized />} />
            <Route path="book/:slug" element={<Book />} />
            <Route path="payment/test-checkout" element={<RequireRole><TestCheckout /></RequireRole>} />
            <Route path="booking/:id/confirmed" element={<RequireRole><Confirmed /></RequireRole>} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="dashboard/*" element={<RequireRole><CustomerArea /></RequireRole>} />
          <Route path="salon/*" element={<RequireRole roles={['OWNER', 'STAFF', 'ADMIN']}><OwnerArea /></RequireRole>} />
          <Route path="admin/*" element={<RequireRole roles={['ADMIN']}><AdminArea /></RequireRole>} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
