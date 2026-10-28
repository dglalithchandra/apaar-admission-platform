-- Bound independently issued receipt validity by its authorizing grant.
CREATE OR REPLACE FUNCTION require_active_verification_grant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE grant_payload jsonb;
BEGIN
  SELECT payload INTO grant_payload FROM verification_authorization_grants
    WHERE reference=NEW.legal_basis_reference FOR SHARE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM verification_grant_withdrawals WHERE grant_reference=NEW.legal_basis_reference)
     OR grant_payload->>'recipientOrganisation' IS DISTINCT FROM NEW.requester_organisation
     OR grant_payload->>'purpose' IS DISTINCT FROM NEW.purpose
     OR NEW.issued_at < (grant_payload->>'validFrom')::timestamptz
     OR NEW.issued_at >= (grant_payload->>'expiresAt')::timestamptz
     OR NEW.expires_at > (grant_payload->>'expiresAt')::timestamptz
     OR NOT (grant_payload->'claims' ?& ARRAY(SELECT jsonb_object_keys(NEW.claims))) THEN
    RAISE EXCEPTION 'Verification authorization grant is inactive or out of scope'
      USING ERRCODE='23514', CONSTRAINT='verification_grant_active';
  END IF;
  RETURN NEW;
END;
$$;
