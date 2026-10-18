import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { payments } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { applyPaymentSuccess, verifyChapaWebhookSignature } from '../services/payments.js';

const r = Router();

r.post('/:provider', async (req, res) => {
  const provider = String(req.params.provider).toLowerCase();

  if (provider === 'chapa' || provider === 'telebirr') {
    const rawBuffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
    const signature = req.headers['x-chapa-signature'] as string | undefined;

    if (!verifyChapaWebhookSignature(rawBuffer, signature)) {
      logger.warn({ provider, signature }, 'Invalid webhook signature');
      return res.status(400).json({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed.' } });
    }

    try {
      const payload = JSON.parse(rawBuffer.toString('utf8')) as {
        status?: string;
        event?: string;
        tx_ref?: string;
        amount?: string | number;
        currency?: string;
        method?: string;
      };

      const isSuccess = payload.status === 'success' || payload.event === 'charge.success';
      const txRef = payload.tx_ref;

      if (!txRef) {
        return res.status(400).json({ success: false, error: { code: 'MISSING_TX_REF', message: 'Missing tx_ref in webhook payload.' } });
      }

      if (isSuccess) {
        // Find appointment associated with this payment transaction
        const [payment] = await db
          .select({ appointmentId: payments.appointmentId, amountEtb: payments.amountEtb })
          .from(payments)
          .where(eq(payments.externalRef, txRef))
          .limit(1);

        if (payment) {
          const amount = payload.amount ? String(payload.amount) : payment.amountEtb;
          await applyPaymentSuccess({
            appointmentId: payment.appointmentId,
            txRef,
            amountEtb: amount,
            methodName: payload.method || 'Telebirr',
          });
          logger.info({ txRef, appointmentId: payment.appointmentId }, 'Chapa webhook payment successfully applied');
        } else {
          logger.warn({ txRef }, 'No payment record found for webhook txRef');
        }
      }

      return res.status(200).json({ success: true, message: 'Webhook processed' });
    } catch (err) {
      logger.error({ err }, 'Error processing Chapa webhook');
      return res.status(500).json({ success: false, error: { code: 'PROCESSING_ERROR', message: 'Failed to process webhook' } });
    }
  }

  logger.warn({ provider: req.params.provider }, 'payment webhook received but no adapter is implemented');
  return res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'No payment provider adapter is configured.' } });
});

export default r;
