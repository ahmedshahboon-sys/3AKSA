CREATE UNIQUE INDEX wallet_postings_transaction_account_uidx
  ON wallet_postings (transaction_id, account_id);

CREATE OR REPLACE FUNCTION enforce_wallet_postings_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tx_id uuid;
  old_tx_id uuid;
  total bigint;
BEGIN
  tx_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.transaction_id ELSE NEW.transaction_id END;
  old_tx_id := CASE WHEN TG_OP = 'UPDATE' THEN OLD.transaction_id ELSE NULL END;

  SELECT COALESCE(sum(amount_milli), 0)
    INTO total
    FROM wallet_postings
   WHERE transaction_id = tx_id;

  IF total <> 0 THEN
    RAISE EXCEPTION 'wallet transaction % is unbalanced by % milli-LYD', tx_id, total
      USING ERRCODE = '23514';
  END IF;

  IF old_tx_id IS NOT NULL AND old_tx_id <> tx_id THEN
    SELECT COALESCE(sum(amount_milli), 0)
      INTO total
      FROM wallet_postings
     WHERE transaction_id = old_tx_id;

    IF total <> 0 THEN
      RAISE EXCEPTION 'wallet transaction % is unbalanced by % milli-LYD', old_tx_id, total
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER wallet_postings_must_balance
AFTER INSERT OR UPDATE OR DELETE ON wallet_postings
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_wallet_postings_balance();
