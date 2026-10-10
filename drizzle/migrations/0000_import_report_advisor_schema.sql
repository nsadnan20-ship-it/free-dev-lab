-- Imports the consolidated Report-Advisor schema (final state of the 319 original
-- migrations at GitHub main eb28b2f, validated locally). The bundle is fetched once
-- and executed only if its SHA-256 matches the audited file exactly.
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
DO $bootstrap$
DECLARE
  resp record;
  body text;
  digest text;
BEGIN
  SELECT * INTO resp FROM extensions.http_get('https://project--7f437630-036d-4492-818f-101cc66d3aa7-dev.lovable.app/__l5e/assets-v1/e53c6c48-e2bc-4936-968d-ad6d7594e6e8/report-advisor-schema-v2.sql');
  IF resp.status <> 200 THEN
    RAISE EXCEPTION 'schema bundle download failed: %', resp.status;
  END IF;
  body := resp.content;
  digest := encode(extensions.digest(convert_to(body, 'UTF8'), 'sha256'), 'hex');
  IF digest <> 'c5b1a9dd9888a06819be0c3c3b72aa5ca2464096ed077de59840a496b0ed7b4a' THEN
    RAISE EXCEPTION 'schema bundle hash mismatch: %', digest;
  END IF;
  EXECUTE body;
END
$bootstrap$;