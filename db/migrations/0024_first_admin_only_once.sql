-- Only the first account ever created becomes admin automatically.
--
-- 0001 granted admin to any new account whenever no admin role existed at
-- that moment. Once the site is live that state is reachable: two admins
-- revoking each other at the same moment, or an operator removing the last
-- admin role, left no admin, and the next self-registered account (sign-up is
-- open) became admin (docs/Security Report.md, SEC-053). The documented rule
-- (README, docs/Security And Auth.md) is "the first user who ever signs up";
-- this makes the trigger do exactly that.
--
-- The advisory lock, taken only while the table still looks empty, stops two
-- simultaneous first sign-ups from both becoming admin: the second waits
-- until the first has committed and then sees it.
CREATE OR REPLACE FUNCTION assign_first_user_admin()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id <> NEW.id) THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(7302, 0);
  IF NOT EXISTS (SELECT 1 FROM users WHERE id <> NEW.id)
     AND NOT EXISTS (SELECT 1 FROM user_roles WHERE role = 'admin') THEN
    INSERT INTO user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;
