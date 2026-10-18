import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ShieldCheck, Smartphone, Building, CreditCard, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { post } from '@/lib/api';
import { money } from '@/lib/format';

export default function TestCheckout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const txRef = params.get('tx_ref') || `belle-test-${Date.now()}`;
  const appointmentId = params.get('appointment_id') || '';
  const amount = params.get('amount') || '250.00';

  const [method, setMethod] = useState<'telebirr' | 'cbe_birr' | 'card'>('telebirr');
  const [phoneNumber, setPhoneNumber] = useState('0911234567');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handlePay = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      await post('/me/appointments/simulate-payment', {
        appointmentId,
        txRef,
        method: method === 'telebirr' ? 'Telebirr' : method === 'cbe_birr' ? 'CBE Birr' : 'Card',
      });

      setIsSuccess(true);
      setTimeout(() => {
        navigate(`/booking/${appointmentId}/confirmed?tx_ref=${encodeURIComponent(txRef)}&payment=success`, {
          replace: true,
        });
      }, 1200);
    } catch (err: unknown) {
      setIsProcessing(false);
      setErrorMessage(err instanceof Error ? err.message : 'Payment simulation failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7FA] py-10 px-4 sm:px-6">
      <div className="mx-auto max-w-lg">
        {/* Brand Bar */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 font-bold text-white shadow-sm">
              C
            </span>
            <div>
              <span className="text-lg font-bold text-gray-900">chapa</span>
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                Sandbox Test Mode
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>256-bit Encrypted</span>
          </div>
        </div>

        {/* Card */}
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
          {/* Header */}
          <div className="border-b border-gray-100 bg-gradient-to-b from-gray-50/80 to-white p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Pay To</p>
            <h2 className="mt-1 text-xl font-bold text-gray-900">Belle Ethiopia Salons</h2>
            <p className="text-sm text-gray-500">50% Booking Deposit</p>

            <div className="mt-4 flex items-baseline justify-between rounded-xl bg-emerald-50/60 border border-emerald-100 p-4">
              <span className="text-sm font-medium text-emerald-900">Deposit Amount Due (50%)</span>
              <span className="text-2xl font-extrabold text-emerald-700">{money(amount)}</span>
            </div>
          </div>

          {/* Form */}
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                Select Payment Method
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {/* Telebirr */}
                <button
                  type="button"
                  onClick={() => setMethod('telebirr')}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3.5 transition-all ${
                    method === 'telebirr'
                      ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900 ring-2 ring-emerald-600/20'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <Smartphone className="h-6 w-6 text-emerald-600 mb-1" />
                  <span className="text-xs font-bold">Telebirr</span>
                  <span className="text-[10px] text-gray-500 mt-0.5">Ethio Telecom</span>
                </button>

                {/* CBE Birr */}
                <button
                  type="button"
                  onClick={() => setMethod('cbe_birr')}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3.5 transition-all ${
                    method === 'cbe_birr'
                      ? 'border-purple-600 bg-purple-50/50 text-purple-900 ring-2 ring-purple-600/20'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <Building className="h-6 w-6 text-purple-600 mb-1" />
                  <span className="text-xs font-bold">CBE Birr</span>
                  <span className="text-[10px] text-gray-500 mt-0.5">Commercial Bank</span>
                </button>

                {/* Card */}
                <button
                  type="button"
                  onClick={() => setMethod('card')}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3.5 transition-all ${
                    method === 'card'
                      ? 'border-blue-600 bg-blue-50/50 text-blue-900 ring-2 ring-blue-600/20'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <CreditCard className="h-6 w-6 text-blue-600 mb-1" />
                  <span className="text-xs font-bold">Card</span>
                  <span className="text-[10px] text-gray-500 mt-0.5">Visa / Mastercard</span>
                </button>
              </div>
            </div>

            {/* Input Details */}
            {method === 'telebirr' && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-900">Telebirr Phone Number</span>
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">Instant</span>
                </div>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="0911234567"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                />
                <p className="text-xs text-gray-500">
                  You will receive an USSD push confirmation on your phone to complete payment.
                </p>
              </div>
            )}

            {method === 'cbe_birr' && (
              <div className="rounded-xl border border-purple-100 bg-purple-50/30 p-4 space-y-3">
                <span className="text-xs font-semibold text-purple-900">CBE Birr Account / Phone</span>
                <input
                  type="tel"
                  defaultValue="0922334455"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-900 focus:border-purple-600 focus:outline-none"
                />
                <p className="text-xs text-gray-500">Enter your CBE Birr mobile number to authorize payment.</p>
              </div>
            )}

            {method === 'card' && (
              <div className="rounded-xl border border-blue-100 bg-blue-50/30 p-4 space-y-3">
                <span className="text-xs font-semibold text-blue-900">Debit / Credit Card</span>
                <input
                  type="text"
                  defaultValue="4111 2222 3333 4444"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-900 focus:border-blue-600 focus:outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    defaultValue="12/28"
                    placeholder="MM/YY"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  />
                  <input
                    type="text"
                    defaultValue="123"
                    placeholder="CVV"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  />
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            {isSuccess ? (
              <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-white font-semibold shadow-md">
                <CheckCircle2 className="h-5 w-5" />
                <span>50% Deposit Paid! Redirecting...</span>
              </div>
            ) : (
              <Button
                size="lg"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 text-base shadow-md transition-all"
                disabled={isProcessing}
                onClick={handlePay}
              >
                {isProcessing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Processing {method === 'telebirr' ? 'Telebirr' : 'Chapa'}...</span>
                  </span>
                ) : (
                  `Pay ${money(amount)} Deposit with ${method === 'telebirr' ? 'Telebirr' : method === 'cbe_birr' ? 'CBE Birr' : 'Card'}`
                )}
              </Button>
            )}

            <div className="border-t border-gray-100 pt-4 text-center">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Cancel and return to booking
              </button>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Powered by Chapa Financial Technologies · Supporting Telebirr & CBE Birr in Ethiopia
        </p>
      </div>
    </div>
  );
}
