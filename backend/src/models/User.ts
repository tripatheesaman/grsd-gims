import { RowDataPacket } from "mysql2";
import pool from "../config/db";

export interface User {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
    password: string;
    permissions: string;
    role_id: number;
    role: "superadmin" | "admin" | "manager" | "entrant" | "custom";
    can_reset_password?: number;
}

export const findUserByEmail = async (email: string): Promise<User | null> => {
    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT u.id, u.username, u.first_name, u.last_name, u.password, u.role_id,
                u.can_reset_password, r.role_name AS role
         FROM users u
         INNER JOIN roles r ON u.role_id = r.role_id
         WHERE u.username = ?
         LIMIT 1`,
        [email]
    );
    return (rows[0] as User | undefined) ?? null;
};
