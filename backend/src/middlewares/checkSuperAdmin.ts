import { Request, Response, NextFunction } from 'express';

export const checkSuperAdmin = (req: Request, res: Response, next: NextFunction): void => {
    const role = req.role?.toLowerCase();
    if (role !== 'superadmin') {
        res.status(403).json({
            error: 'Forbidden',
            message: 'This action is restricted to superadmin users only'
        });
        return;
    }
    next();
};
