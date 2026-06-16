-- Database-level guarantee against double-booking a staff member.
-- Active (PENDING/CONFIRMED) appointments for the same staff member may not overlap
-- in [start_at, blocked_until), where blocked_until includes service + salon buffer.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_staff_overlap"
  EXCLUDE USING gist (
    "staff_id" WITH =,
    tstzrange("start_at", "blocked_until", '[)') WITH &&
  ) WHERE ("status" IN ('PENDING', 'CONFIRMED'));
