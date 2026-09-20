CREATE UNIQUE INDEX manual_topup_requests_one_pending_per_user_uidx
  ON manual_topup_requests (user_id)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION enforce_wallet_transaction_complete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  posting_count integer;
  total bigint;
BEGIN
  SELECT count(*)::integer, COALESCE(sum(amount_milli), 0)
    INTO posting_count, total
    FROM wallet_postings
   WHERE transaction_id = NEW.id;

  IF posting_count < 2 OR total <> 0 THEN
    RAISE EXCEPTION 'wallet transaction % must contain at least two balanced postings', NEW.id
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER wallet_transaction_must_be_complete
AFTER INSERT OR UPDATE ON wallet_transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_wallet_transaction_complete();
