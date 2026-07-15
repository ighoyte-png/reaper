-- Public read-only share links (org-level toggle + opaque token).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS share_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_token text;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_share_token_uidx
  ON organizations (share_token)
  WHERE share_token IS NOT NULL;
