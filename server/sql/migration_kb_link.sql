-- Lets a reply carry a link to a knowledge base article. Run ONCE as the postgres user:
--   psql -U postgres -d uoa_helpdesk -f server\sql\migration_kb_link.sql
-- Articles are never deleted (only archived), so the link can never point at nothing.
BEGIN;

ALTER TABLE comments ADD COLUMN linked_kb_id BIGINT REFERENCES articles(id);
CREATE INDEX comments_linked_kb_idx ON comments (linked_kb_id) WHERE linked_kb_id IS NOT NULL;

COMMIT;