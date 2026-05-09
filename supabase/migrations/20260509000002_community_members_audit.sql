-- Audit log for community_members so we can tell who triggered a join/leave/kick
-- and reconstruct mysterious disappearances after the fact.

CREATE TABLE IF NOT EXISTS public.community_member_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL,
  user_id      uuid NOT NULL,                 -- the affected member
  actor_id     uuid,                          -- auth.uid() at the time, may be null for system ops
  action       text NOT NULL CHECK (action IN ('join','leave_self','kicked')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_member_audit_community_idx
  ON public.community_member_audit (community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS community_member_audit_user_idx
  ON public.community_member_audit (user_id, created_at DESC);

ALTER TABLE public.community_member_audit ENABLE ROW LEVEL SECURITY;

-- Read access: community admin and co-admins can read their community's audit log
DROP POLICY IF EXISTS "Audit lesbar für Community Admins" ON public.community_member_audit;
CREATE POLICY "Audit lesbar für Community Admins" ON public.community_member_audit
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_member_audit.community_id
        AND (
          c.admin_id = (SELECT auth.uid())
          OR (SELECT auth.uid()) = ANY(c.co_admin_ids)
        )
    )
  );

-- Trigger function: classify the operation
CREATE OR REPLACE FUNCTION public.log_community_member_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_action text;
  v_community uuid;
  v_user uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'join';
    v_community := NEW.community_id;
    v_user := NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    -- Self-leave vs kick: actor matches affected user => left themselves
    IF v_actor IS NOT DISTINCT FROM OLD.user_id THEN
      v_action := 'leave_self';
    ELSE
      v_action := 'kicked';
    END IF;
    v_community := OLD.community_id;
    v_user := OLD.user_id;
  END IF;

  INSERT INTO public.community_member_audit
    (community_id, user_id, actor_id, action)
  VALUES
    (v_community, v_user, v_actor, v_action);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_community_member_audit ON public.community_members;
CREATE TRIGGER trg_community_member_audit
AFTER INSERT OR DELETE ON public.community_members
FOR EACH ROW EXECUTE FUNCTION public.log_community_member_change();
