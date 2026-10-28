-- Independent authorization evidence, not government consent or statutory approval.
CREATE TABLE verification_authorization_grants (
  reference text PRIMARY KEY,
  issuer_reference text NOT NULL CHECK (length(btrim(issuer_reference)) > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CHECK (payload->>'reference'=reference),
  CHECK (payload->>'kind' IN ('CONSENT','LEGAL_BASIS'))
);
CREATE TABLE verification_grant_withdrawals (
  grant_reference text PRIMARY KEY REFERENCES verification_authorization_grants(reference),
  actor_reference text NOT NULL CHECK (length(btrim(actor_reference)) > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  withdrawn_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);
CREATE TRIGGER verification_grants_are_immutable BEFORE UPDATE OR DELETE ON verification_authorization_grants
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER verification_grant_withdrawals_are_immutable BEFORE UPDATE OR DELETE ON verification_grant_withdrawals
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
