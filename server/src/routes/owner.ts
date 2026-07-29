import { Router } from 'express';
import * as c from '../controllers/owner.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { salonAccess } from '../middleware/salonAccess.js';
import { validate } from '../middleware/validate.js';
import { imageUpload } from '../lib/uploads.js';
import {
  cashPaymentSchema, exportQuery, hoursSchema, imagePatchSchema, manualAppointmentSchema, ownerAppointmentsQuery, ownerNotesSchema, ownerRescheduleSchema,
  ownerReviewsQuery, rangeQuery, replySchema, salonChild, salonProfileSchema, salonScope, serviceCreateSchema, serviceUpdateSchema, staffCreateSchema,
  staffScheduleSchema, staffUpdateSchema, statusSchema, timeOffSchema,
} from '../validators/owner.js';
import { z } from 'zod';
import { uuid } from '../validators/common.js';

const r = Router();
r.use(requireAuth, requireRole('OWNER', 'STAFF', 'ADMIN'));

r.get('/salons', c.mySalons);

const staffLevel = salonAccess('staff');
const ownerLevel = salonAccess('owner');
const S = '/salons/:salonId';

type Schemas = { params: z.ZodTypeAny; body?: z.ZodTypeAny; query?: z.ZodTypeAny };
/** params (so ids are valid UUIDs) -> access check -> body/query. Unauthorised users never see validation details. */
const guard = (level: ReturnType<typeof salonAccess>, { params, body, query }: Schemas) => [
  validate({ params }),
  level,
  ...(body || query ? [validate({ body, query })] : []),
];

// Available to staff (read + day-to-day work on their own diary)
r.get(`${S}/overview`, ...guard(staffLevel, { params: salonScope }), c.overview);
r.get(`${S}/appointments`, ...guard(staffLevel, { params: salonScope, query: ownerAppointmentsQuery }), c.listAppointments);
r.post(`${S}/appointments`, ...guard(staffLevel, { params: salonScope, body: manualAppointmentSchema }), c.createManualAppointment);
r.get(`${S}/appointments/:id`, ...guard(staffLevel, { params: salonChild }), c.getAppointment);
r.patch(`${S}/appointments/:id/status`, ...guard(staffLevel, { params: salonChild, body: statusSchema }), c.setStatus);
r.post(`${S}/appointments/:id/reschedule`, ...guard(staffLevel, { params: salonChild, body: ownerRescheduleSchema }), c.reschedule);
r.patch(`${S}/appointments/:id/notes`, ...guard(staffLevel, { params: salonChild, body: ownerNotesSchema }), c.setOwnerNotes);
r.post(`${S}/appointments/:id/payments`, ...guard(staffLevel, { params: salonChild, body: cashPaymentSchema }), c.recordPayment);
r.get(`${S}/staff`, ...guard(staffLevel, { params: salonScope }), c.listStaff);
r.get(`${S}/services`, ...guard(staffLevel, { params: salonScope }), c.listServices);

// Owner only
r.get(`${S}/profile`, ...guard(ownerLevel, { params: salonScope }), c.getProfile);
r.patch(`${S}/profile`, ...guard(ownerLevel, { params: salonScope, body: salonProfileSchema }), c.updateProfile);
r.put(`${S}/hours`, ...guard(ownerLevel, { params: salonScope, body: hoursSchema }), c.updateHours);
r.post(`${S}/images`, ...guard(ownerLevel, { params: salonScope }), imageUpload.single('image'), c.uploadImage);
r.patch(`${S}/images/:id`, ...guard(ownerLevel, { params: salonChild, body: imagePatchSchema }), c.updateImage);
r.delete(`${S}/images/:id`, ...guard(ownerLevel, { params: salonChild }), c.deleteImage);

r.post(`${S}/services`, ...guard(ownerLevel, { params: salonScope, body: serviceCreateSchema }), c.createService);
r.patch(`${S}/services/:id`, ...guard(ownerLevel, { params: salonChild, body: serviceUpdateSchema }), c.updateService);
r.delete(`${S}/services/:id`, ...guard(ownerLevel, { params: salonChild }), c.deleteService);

r.post(`${S}/staff`, ...guard(ownerLevel, { params: salonScope, body: staffCreateSchema }), c.createStaff);
r.patch(`${S}/staff/:id`, ...guard(ownerLevel, { params: salonChild, body: staffUpdateSchema }), c.updateStaff);
r.put(`${S}/staff/:id/schedule`, ...guard(ownerLevel, { params: salonChild, body: staffScheduleSchema }), c.setStaffSchedule);
r.post(`${S}/staff/:id/time-off`, ...guard(ownerLevel, { params: salonChild, body: timeOffSchema }), c.addTimeOff);
r.delete(`${S}/staff/:id/time-off/:offId`, validate({ params: z.object({ salonId: uuid, id: uuid, offId: uuid }) }), ownerLevel, c.removeTimeOff);

r.get(`${S}/reports/summary`, ...guard(ownerLevel, { params: salonScope, query: rangeQuery }), c.reportSummary);
r.get(`${S}/reports/export.csv`, ...guard(ownerLevel, { params: salonScope, query: exportQuery }), c.reportCsv);
r.get(`${S}/reviews`, ...guard(ownerLevel, { params: salonScope, query: ownerReviewsQuery }), c.listReviews);
r.patch(`${S}/reviews/:id/reply`, ...guard(ownerLevel, { params: salonChild, body: replySchema }), c.replyToReview);
export default r;
