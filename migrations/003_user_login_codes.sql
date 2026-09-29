-- Permanent per-user login codes for the mobile app (used instead of a
-- WhatsApp OTP until WhatsApp delivery is set up), plus brute-force lockout.
-- Also creates auth_otp, which the WhatsApp OTP flow needs.
-- Idempotent: safe to re-run.

ALTER TABLE users ADD COLUMN IF NOT EXISTS login_code_hash    varchar(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_code_set_at  timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count int NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until       timestamptz;

CREATE TABLE IF NOT EXISTS auth_otp (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       varchar(64)  NOT NULL,
  code_hash   varchar(255) NOT NULL,
  channel     varchar(16),
  expires_at  timestamptz  NOT NULL,
  attempts    int          NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_otp_phone ON auth_otp (phone, created_at DESC);
