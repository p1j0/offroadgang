DROP POLICY IF EXISTS "Admin bearbeitet Termin" ON public.plan_dates;
CREATE POLICY "Admin bearbeitet Termin" ON public.plan_dates
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM tours WHERE tours.id = plan_dates.tour_id AND tours.admin_id = (select auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM tours WHERE tours.id = plan_dates.tour_id AND tours.admin_id = (select auth.uid()))
  );
