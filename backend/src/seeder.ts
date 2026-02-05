import * as dotenv from 'dotenv';
import { createPool } from 'mysql2/promise';
dotenv.config();
const dbName = process.env.DB_NAME || 'inventory_system';
async function ensureDatabaseExists(): Promise<void> {
    const pool = createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0
    });
    try {
        await pool.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    }
    catch (error) {
        process.exitCode = 1;
    }
    finally {
        await pool.end();
    }
}
ensureDatabaseExists();
