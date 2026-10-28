-- Bind existing verified SYNTHETIC upload evidence without rewriting historical admissions.
-- Live provider identities require an authorised canonical-key resolver; do not hash real identifiers here.
INSERT INTO admission_identity_bindings(admission_id,canonical_identity_key,provider_reference)
SELECT DISTINCT ON (a.id) a.id,
  'SYNTH-CANONICAL-'||encode(sha256(convert_to('SYNTH-CANONICAL:'||(r.payload->>'academicIdentityReference'),'UTF8')),'hex'),
  'SYNTH-MIGRATION-VERIFIED-BATCH-BINDING'
FROM admissions a JOIN batch_rows r ON r.admission_id=a.id
JOIN identity_verifications v ON v.admission_command_id=a.admission_command_id
WHERE v.status='VERIFIED' AND r.payload->>'academicIdentityReference' LIKE 'SYNTH-%'
ORDER BY a.id,r.id
ON CONFLICT(admission_id) DO NOTHING;
