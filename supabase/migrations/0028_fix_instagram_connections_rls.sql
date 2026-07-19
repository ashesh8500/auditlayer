-- Fix instagram_connections RLS privilege escalation from 0007.
--
-- The 0007 "Service role can manage connections" policy had no TO clause, so
-- it applied to PUBLIC. Permissive policies are OR'd, so any authenticated
-- user could SELECT/INSERT/UPDATE/DELETE every row — including
-- long_lived_token. Recreate the policy scoped TO service_role. (The
-- service-role key bypasses RLS entirely; this policy documents intent and
-- keeps the door closed for every other role.)

DROP POLICY IF EXISTS "Service role can manage connections" ON public.instagram_connections;

CREATE POLICY "Service role can manage connections"
    ON public.instagram_connections FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Rollback (restores the 0007 policy — NOT recommended; it re-opens the token leak):
--
-- DROP POLICY IF EXISTS "Service role can manage connections" ON public.instagram_connections;
--
-- CREATE POLICY "Service role can manage connections"
--     ON public.instagram_connections FOR ALL
--     USING (true)
--     WITH CHECK (true);
