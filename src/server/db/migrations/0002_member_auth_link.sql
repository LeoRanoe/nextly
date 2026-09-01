ALTER TABLE "members" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "auth_user_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "members_auth_user_key" ON "members" USING btree ("auth_user_id");--> statement-breakpoint
-- RLS now keys off auth_user_id rather than the member's own primary key, so
-- an owner can hold capital in the ledger before ever signing in.
CREATE OR REPLACE FUNCTION private.is_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.members m WHERE m.auth_user_id = (SELECT auth.uid())); $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.member_role()
RETURNS public.member_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT m.role FROM public.members m WHERE m.auth_user_id = (SELECT auth.uid()); $$;--> statement-breakpoint

DROP POLICY IF EXISTS members_update_self ON public.members;--> statement-breakpoint
CREATE POLICY members_update_self ON public.members
  FOR UPDATE TO authenticated
  USING (auth_user_id = (SELECT auth.uid()) OR private.is_owner())
  WITH CHECK (auth_user_id = (SELECT auth.uid()) OR private.is_owner());
