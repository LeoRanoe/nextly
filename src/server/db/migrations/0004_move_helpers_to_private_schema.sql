-- ============================================================================
-- Historical record: on the deployed database this repo tracks, the RLS
-- helpers briefly lived in `public` (created by the file that is now
-- 0001_rls_views_functions.sql) before being moved to `private`, because
-- PostgREST exposes every function in `public` as /rest/v1/rpc/<name> and
-- next_document_number in particular was callable by any signed-in user.
--
-- That file was edited in place afterwards to create the helpers directly in
-- `private`, rather than being followed by a numbered migration recording the
-- move — so a fresh database built from this repo's files was always correct,
-- but the migration history did not say so. This file makes that move
-- explicit and numbered, matching what is actually applied.
--
-- Every statement is a no-op against the current schema, on this database and
-- on a fresh one: 0001 already creates these functions in `private`, and
-- nothing in `public` was ever created by this repo's files for it to drop.
-- Verified read-only against the live database (private.* function listing,
-- and members_update_self's policy body already referencing private.is_owner)
-- before writing this file; Supabase branching, which would have let this run
-- end-to-end against a disposable copy, is not available on this project's
-- plan.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;--> statement-breakpoint
GRANT USAGE ON SCHEMA private TO authenticated;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.is_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.members m WHERE m.auth_user_id = (SELECT auth.uid())); $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.member_role()
RETURNS public.member_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT m.role FROM public.members m WHERE m.auth_user_id = (SELECT auth.uid()); $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.can_write()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT COALESCE(private.member_role() IN ('owner', 'staff'), false); $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.is_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT COALESCE(private.member_role() = 'owner', false); $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.next_document_number(p_prefix text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_next    bigint;
  v_padding bigint;
BEGIN
  INSERT INTO public.document_sequences AS s (prefix, last_value)
       VALUES (p_prefix, 1)
  ON CONFLICT (prefix) DO UPDATE
          SET last_value = s.last_value + 1, updated_at = now()
    RETURNING s.last_value, s.padding INTO v_next, v_padding;
  RETURN p_prefix || lpad(v_next::text, v_padding::int, '0');
END;
$$;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION
  private.is_member(), private.member_role(), private.can_write(),
  private.is_owner(), private.next_document_number(text)
TO authenticated;--> statement-breakpoint

-- Nothing to drop from `public`: this repo's version of the RLS-and-views
-- migration never created a public-schema copy of these helpers, so there is
-- no `public.is_member()` etc. to remove. Included, guarded, for a database
-- that somehow does still have one.
DROP FUNCTION IF EXISTS public.next_document_number(text);--> statement-breakpoint
DROP FUNCTION IF EXISTS public.can_write();--> statement-breakpoint
DROP FUNCTION IF EXISTS public.is_owner();--> statement-breakpoint
DROP FUNCTION IF EXISTS public.member_role();--> statement-breakpoint
DROP FUNCTION IF EXISTS public.is_member();
