-- Server-side sessions for the self-hosted auth system. The browser only
-- ever holds an opaque, random session id (in an HttpOnly cookie) — never a
-- JWT — so a session can be revoked immediately by deleting its row here.
CREATE TABLE sessions (
  id text PRIMARY KEY, -- random token, generated in session.server.ts
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
