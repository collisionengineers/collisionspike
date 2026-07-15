-- Durable provider API request identity (ADR-0020).
BEGIN;

CREATE TABLE provider_intake_operation (
  work_provider_id uuid NOT NULL,
  idempotency_key varchar(128) NOT NULL,
  request_hash char(64) NOT NULL CONSTRAINT ck_provider_intake_request_hash
    CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  case_id uuid,
  case_po varchar(80),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (work_provider_id, idempotency_key)
);

CREATE INDEX ix_provider_intake_operation_case ON provider_intake_operation (case_id);

COMMIT;
