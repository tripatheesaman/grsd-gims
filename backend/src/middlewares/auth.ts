import { Request, Response, NextFunction } from 'express';
export const checkPermissions = (requiredPermissions: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.permissions || !Array.isArray(req.permissions)) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'User permissions not found'
            });
            return;
        }
        const hasAllPermissions = requiredPermissions.every(permission => req.permissions!.includes(permission));
        if (!hasAllPermissions) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'Insufficient permissions'
            });
            return;
        }
        next();
    };
};

/** User must have at least one of the listed permissions */
export const checkAnyPermissions = (allowedPermissions: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.permissions || !Array.isArray(req.permissions)) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'User permissions not found'
            });
            return;
        }
        const hasAny = allowedPermissions.some((permission) => req.permissions!.includes(permission));
        if (!hasAny) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'Insufficient permissions'
            });
            return;
        }
        next();
    };
};
