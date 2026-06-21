/**
 * CLI: npx ts-node src/scripts/migratePartVariants.ts [--confirm]
 * Default is dry run.
 */
import { migrateInventoryPartVariants } from '../services/inventoryPartSplitMigration';
import { ensureAssetSpareSchema } from '../services/assetSpareSchema';

const dryRun = !process.argv.includes('--confirm');

async function main() {
    await ensureAssetSpareSchema();
    const result = await migrateInventoryPartVariants({ dryRun });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.errors.length ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
