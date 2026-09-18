CREATE TABLE blocked_installations (
  installation_id varchar(128) PRIMARY KEY,
  reason varchar(240),
  blocked_at timestamptz NOT NULL DEFAULT now(),
  blocked_by uuid REFERENCES users(id) ON DELETE SET NULL
);
