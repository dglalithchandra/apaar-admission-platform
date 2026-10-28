ALTER TABLE verification_authorization_grants ADD CONSTRAINT verification_grant_payload_fields CHECK (payload ?& ARRAY['reference','kind','admissionReference','institutionReference','recipientOrganisation','purpose','claims','validFrom','expiresAt'] AND jsonb_typeof(payload->'claims')='array');

-- Serialize issuance and withdrawal on the same immutable grant row.
CREATE FUNCTION require_active_verification_grant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE grant_payload jsonb;
BEGIN
  SELECT payload INTO grant_payload FROM verification_authorization_grants
    WHERE reference=NEW.legal_basis_reference FOR SHARE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM verification_grant_withdrawals WHERE grant_reference=NEW.legal_basis_reference)
     OR grant_payload->>'recipientOrganisation' IS DISTINCT FROM NEW.requester_organisation
     OR grant_payload->>'purpose' IS DISTINCT FROM NEW.purpose
     OR NEW.issued_at < (grant_payload->>'validFrom')::timestamptz
     OR NEW.issued_at >= (grant_payload->>'expiresAt')::timestamptz
     OR NOT (grant_payload->'claims' ?& ARRAY(SELECT jsonb_object_keys(NEW.claims))) THEN
    RAISE EXCEPTION 'Verification authorization grant is inactive or out of scope'
      USING ERRCODE='23514', CONSTRAINT='verification_grant_active';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER require_active_verification_grant BEFORE INSERT ON verification_receipts
  FOR EACH ROW EXECUTE FUNCTION require_active_verification_grant();

CREATE FUNCTION serialize_verification_grant_withdrawal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM verification_authorization_grants WHERE reference=NEW.grant_reference FOR UPDATE;
  RETURN NEW;
END;
$$;
CREATE TRIGGER serialize_verification_grant_withdrawal BEFORE INSERT ON verification_grant_withdrawals
  FOR EACH ROW EXECUTE FUNCTION serialize_verification_grant_withdrawal();

CREATE FUNCTION revoke_withdrawn_grant_receipts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO verification_receipt_revocations(verification_reference,reason_code,actor_reference,revoked_at)
    SELECT verification_reference,'AUTHORIZATION_WITHDRAWN',NEW.actor_reference,NEW.withdrawn_at
    FROM verification_receipts WHERE legal_basis_reference=NEW.grant_reference
    ON CONFLICT(verification_reference) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER revoke_withdrawn_grant_receipts AFTER INSERT ON verification_grant_withdrawals
  FOR EACH ROW EXECUTE FUNCTION revoke_withdrawn_grant_receipts();
