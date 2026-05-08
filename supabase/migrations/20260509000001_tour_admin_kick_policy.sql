-- Allow tour admins and co-admins to remove any member from their tour.
-- The existing "Mitglied kann verlassen" policy already covers self-removal.

DROP POLICY IF EXISTS "Admin kann Mitglieder entfernen" ON public.tour_members;

CREATE POLICY "Admin kann Mitglieder entfernen" ON public.tour_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.tours
      WHERE tours.id = tour_members.tour_id
        AND (
          tours.admin_id = (SELECT auth.uid())
          OR (SELECT auth.uid()) = ANY(tours.co_admin_ids)
        )
    )
  );
