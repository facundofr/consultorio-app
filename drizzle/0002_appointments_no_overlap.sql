-- Anti double-booking: a professional can never have two active appointments
-- whose time ranges overlap, regardless of location. Ranges are half-open
-- '[)', so back-to-back appointments (10:00-10:30, 10:30-11:00) are allowed.
-- Cancelled appointments are excluded, so cancelling frees the slot at once.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist ("professional_id" WITH =, "during" WITH &&)
  WHERE ("status" IN ('confirmed', 'completed', 'no_show'));
