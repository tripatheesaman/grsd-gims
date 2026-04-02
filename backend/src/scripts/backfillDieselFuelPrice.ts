import pool from '../config/db';

// `process` typings may be missing in the current TS config for scripts.
// This script doesn't rely on any Node-specific APIs beyond `process.argv`.
declare const process: any;

const NAC_DIESEL = 'GT 07986';

function getArg(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const dryRun = getArg('--dry-run');
  const confirm = getArg('--confirm');

  if (dryRun && confirm) {
    throw new Error('Use only one of --dry-run or --confirm');
  }

  if (!dryRun && !confirm) {
    // Default to dry-run to be safe.
    console.log('No flag provided. Running in --dry-run mode.');
  }

  const shouldDryRun = dryRun || !confirm;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Avoid strict generic typing here: mysql2 typings can reject the
    // custom aggregate row shape during `tsc`.
    const [counts] = await (connection.query as any)(
      `SELECT
         COUNT(*) as total,
         SUM(
           CASE
             WHEN fr.fuel_price IS NULL THEN 1
             WHEN ABS(fr.fuel_price - COALESCE(i.issue_cost / NULLIF(i.issue_quantity, 0), 0)) > 0.00001 THEN 1
             ELSE 0
           END
         ) as mismatched
       FROM fuel_records fr
       INNER JOIN issue_details i ON fr.issue_fk = i.id
       WHERE TRIM(i.nac_code) = ?
      `,
      [NAC_DIESEL]
    );

    const total = Number((counts as any)[0]?.total) || 0;
    const mismatched = Number((counts as any)[0]?.mismatched) || 0;

    console.log(`[Diesel backfill] Rows with diesel linkage: ${total}`);
    console.log(`[Diesel backfill] Rows detected mismatched: ${mismatched}`);

    const [sample] = await (connection.query as any)(
      `SELECT
         fr.id as fuel_record_id,
         fr.fuel_price as stored_price,
         i.issue_quantity,
         i.issue_cost,
         COALESCE(i.issue_cost / NULLIF(i.issue_quantity, 0), 0) as derived_price,
         i.id as issue_id
       FROM fuel_records fr
       INNER JOIN issue_details i ON fr.issue_fk = i.id
       WHERE TRIM(i.nac_code) = ?
       ORDER BY fr.id DESC
       LIMIT 5
      `,
      [NAC_DIESEL]
    );

    if (sample && sample.length > 0) {
      console.log('[Diesel backfill] Sample (latest 5):');
      for (const row of sample) {
        console.log(
          `  fuel_record_id=${row.fuel_record_id}, stored=${row.stored_price}, derived=${row.derived_price}, issue_cost=${row.issue_cost}, issue_qty=${row.issue_quantity}`
        );
      }
    }

    if (shouldDryRun) {
      console.log('Dry-run enabled. No data will be changed.');
      await connection.rollback();
      return;
    }

    if (!confirm) {
      throw new Error('Refusing to write without --confirm');
    }

    const [result] = await connection.query<any>(
      `UPDATE fuel_records fr
       INNER JOIN issue_details i ON fr.issue_fk = i.id
       SET fr.fuel_price = COALESCE(i.issue_cost / NULLIF(i.issue_quantity, 0), 0)
       WHERE TRIM(i.nac_code) = ?
         AND (fr.fuel_price IS NULL
              OR ABS(fr.fuel_price - COALESCE(i.issue_cost / NULLIF(i.issue_quantity, 0), 0)) > 0.00001)
      `,
      [NAC_DIESEL]
    );

    console.log(
      `[Diesel backfill] Update complete. affectedRows=${result?.affectedRows ?? 'unknown'}`
    );

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Diesel backfill] Failed: ${message}`);
    process.exitCode = 1;
  } finally {
    connection.release();
  }
}

main();

