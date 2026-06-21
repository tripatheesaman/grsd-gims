import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { rebuildNacInventoryState } from './issueInventoryService';

/** Clears receive_details.rrp_fk for all receives linked to an RRP number and rebuilds inventory. */
export async function releaseRrpReceives(
    connection: PoolConnection,
    rrpNumber: string
): Promise<string[]> {
    const [receiveRows] = await connection.execute<RowDataPacket[]>(
        `SELECT DISTINCT rd.nac_code
         FROM receive_details rd
         INNER JOIN rrp_details rrp ON rrp.receive_fk = rd.id
         WHERE rrp.rrp_number = ?
           AND rd.nac_code IS NOT NULL
           AND TRIM(rd.nac_code) <> ''`,
        [rrpNumber]
    );

    await connection.execute(
        `UPDATE receive_details rd
         SET rrp_fk = NULL
         WHERE EXISTS (
             SELECT 1 FROM rrp_details rrp
             WHERE rrp.receive_fk = rd.id
               AND rrp.rrp_number = ?
         )`,
        [rrpNumber]
    );

    const nacCodes = receiveRows.map((row) => String(row.nac_code));
    for (const nacCode of nacCodes) {
        await rebuildNacInventoryState(connection, nacCode);
    }

    return nacCodes;
}
