CREATE TABLE admission_identity_bindings (
  admission_id text PRIMARY KEY REFERENCES admissions(id),
  canonical_identity_key text NOT NULL CHECK(length(btrim(canonical_identity_key))>0),
  provider_reference text NOT NULL CHECK(length(btrim(provider_reference))>0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);
CREATE INDEX admission_identity_binding_lookup ON admission_identity_bindings(canonical_identity_key);
CREATE TRIGGER admission_identity_bindings_are_immutable BEFORE UPDATE OR DELETE ON admission_identity_bindings
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
