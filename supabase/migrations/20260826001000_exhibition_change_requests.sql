-- Owners of an ALREADY-APPROVED company can now always edit their profile,
-- products, and gallery (previously the page went fully read-only once
-- status = 'approved' — every one of the currently-provisioned owner
-- accounts hit this in production; see src/routes/my-company.tsx). Edits to
-- a company that has never been approved yet (draft/pending/rejected) still
-- write straight to the live tables, exactly as before — see
-- src/lib/exhibition-api.functions.ts. Only edits to an *approved* company
-- are staged here and must be approved by an admin before they reach the
-- public exhibition tables.
CREATE TABLE exhibition_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL REFERENCES exhibition_companies(company_id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('company', 'product', 'image')),
  -- NULL for company-level edits and for brand-new product/image proposals
  -- that don't exist in the live table yet; the id of the live row being
  -- edited/deleted otherwise. No FK here on purpose — it's polymorphic
  -- across exhibition_products/exhibition_images, and a dangling entity_id
  -- (target deleted directly by an admin while a request was pending) is
  -- handled defensively when a request is approved, not prevented here.
  entity_id uuid NULL,
  action text NOT NULL CHECK (action IN ('update', 'create', 'delete')),
  -- Proposed column values — a subset of exhibition_companies/_products/
  -- _images' own columns. For 'update' this is a diff (only the columns
  -- that actually differ from the live row at submit time); for 'create'
  -- it's the full new row; for 'delete' it's '{}'. Already validated at
  -- submit time — approving a request is a direct, unvalidated write of
  -- this object.
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES users(id),
  rejection_note text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_exh_change_requests_company ON exhibition_change_requests(company_id);
CREATE INDEX idx_exh_change_requests_status ON exhibition_change_requests(status);

-- Upsert targets for the "propose a change" write path (see
-- src/lib/exhibition-api.functions.ts): at most one PENDING request per
-- company-level edit, and at most one PENDING request per existing
-- product/image being edited or deleted — a repeat save while one is still
-- pending replaces it instead of piling up duplicates. Brand-new (not yet
-- created) product/image proposals have entity_id NULL and are
-- intentionally excluded from this constraint, so an owner can queue up
-- several new-product drafts at once.
CREATE UNIQUE INDEX uq_exh_cr_pending_company
  ON exhibition_change_requests (company_id)
  WHERE status = 'pending' AND entity_type = 'company';

CREATE UNIQUE INDEX uq_exh_cr_pending_entity
  ON exhibition_change_requests (entity_type, entity_id)
  WHERE status = 'pending' AND entity_id IS NOT NULL;

CREATE TRIGGER trg_exh_change_requests_updated BEFORE UPDATE ON exhibition_change_requests
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
