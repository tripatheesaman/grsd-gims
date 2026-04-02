-- Backfill diesel fuel unit prices in `fuel_records.fuel_price`
-- Derived from authoritative ledger: `issue_details.issue_cost / issue_details.issue_quantity`
--
-- Safety notes:
-- 1) This updates existing historical rows.
-- 2) It targets diesel issues only by `issue_details.nac_code = 'GT 07986'`.
-- 3) It applies only where stored `fuel_price` differs by more than a tiny tolerance.

-- Preview counts
SELECT
  COUNT(*) AS total_diesel_linked_rows,
  SUM(
    CASE
      WHEN fr.fuel_price IS NULL THEN 1
      WHEN ABS(
        fr.fuel_price - COALESCE(i.issue_cost / NULLIF(i.issue_quantity, 0), 0)
      ) > 0.00001 THEN 1
      ELSE 0
    END
  ) AS mismatched_rows
FROM fuel_records fr
INNER JOIN issue_details i ON fr.issue_fk = i.id
WHERE TRIM(i.nac_code) = 'GT 07986';

-- Preview latest 5 mismatches
SELECT
  fr.id AS fuel_record_id,
  fr.fuel_price AS stored_price,
  i.id AS issue_id,
  i.issue_quantity,
  i.issue_cost,
  COALESCE(i.issue_cost / NULLIF(i.issue_quantity, 0), 0) AS derived_price
FROM fuel_records fr
INNER JOIN issue_details i ON fr.issue_fk = i.id
WHERE TRIM(i.nac_code) = 'GT 07986'
  AND (
    fr.fuel_price IS NULL
    OR ABS(fr.fuel_price - COALESCE(i.issue_cost / NULLIF(i.issue_quantity, 0), 0)) > 0.00001
  )
ORDER BY fr.id DESC
LIMIT 5;

-- Perform backfill
START TRANSACTION;

UPDATE fuel_records fr
INNER JOIN issue_details i ON fr.issue_fk = i.id
SET fr.fuel_price = COALESCE(i.issue_cost / NULLIF(i.issue_quantity, 0), 0)
WHERE TRIM(i.nac_code) = 'GT 07986'
  AND (
    fr.fuel_price IS NULL
    OR ABS(fr.fuel_price - COALESCE(i.issue_cost / NULLIF(i.issue_quantity, 0), 0)) > 0.00001
  );

SELECT ROW_COUNT() AS updated_rows;

-- If results look good, run COMMIT; otherwise use ROLLBACK.
COMMIT;

