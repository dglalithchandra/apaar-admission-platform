ALTER TABLE integration_notification_deliveries
  DROP CONSTRAINT integration_notification_deliveries_state_check;

ALTER TABLE integration_notification_deliveries
  ADD COLUMN lease_until timestamptz,
  ADD CONSTRAINT integration_notification_deliveries_state_check
    CHECK (state IN ('PENDING','IN_FLIGHT','DELIVERED','RETRYABLE','DEAD_LETTER')),
  ADD CONSTRAINT integration_notification_lease_required
    CHECK ((state='IN_FLIGHT' AND lease_until IS NOT NULL) OR state<>'IN_FLIGHT');

CREATE INDEX integration_notification_claimable
  ON integration_notification_deliveries(available_at,created_at,id)
  WHERE state IN ('PENDING','RETRYABLE','IN_FLIGHT');
