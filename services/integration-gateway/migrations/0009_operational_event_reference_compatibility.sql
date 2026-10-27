ALTER TABLE runtime_event_stream
  DROP CONSTRAINT runtime_event_stream_synthetic_reference;

ALTER TABLE runtime_event_stream
  ADD CONSTRAINT runtime_event_stream_synthetic_reference CHECK (
    event_reference LIKE 'SYNTH-%' OR event_reference LIKE 'OUTBOX-SYNTH-%'
  );
