CREATE TABLE IF NOT EXISTS lti_records (
    kind TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    expires INTEGER NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS lti_records_expiry ON lti_records(expires);
