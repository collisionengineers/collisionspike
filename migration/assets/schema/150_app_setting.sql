-- 150_app_setting.sql — runtime-writable app preferences (plan 10 §1.3).
--
-- The ONE setting the running app can UPDATE at runtime (every other gate is a Function
-- app-setting). Backed by this table so setHoldNewCasesDefault (Admin) can persist it and
-- getHoldNewCasesDefault can read it. Was specified inline in migration/10 but never folded
-- into the numbered schema assets that provision.sh applies — so the live DB lacked the table
-- and the PUT 500'd / the GET was permanently false (sweep wl7jxif9e finding A4/C2).

CREATE TABLE IF NOT EXISTS app_setting (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

-- Seed the default-off hold preference (idempotent).
INSERT INTO app_setting (key, value)
VALUES ('hold_new_cases_by_default', 'false')
ON CONFLICT (key) DO NOTHING;
