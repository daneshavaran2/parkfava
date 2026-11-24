-- Sessions are now looked up by the SHA-256 of the cookie token
-- (src/lib/auth/session.server.ts), so the table never holds a value that can
-- be replayed as a cookie. Rewrites the rows that existed before in place, so
-- nobody is signed out by the change. Applied once, like every migration
-- (recorded in _migrations).
UPDATE sessions SET id = encode(sha256(convert_to(id, 'UTF8')), 'hex');
