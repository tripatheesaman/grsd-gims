import { Response } from 'express';

export const setNoCacheHeaders = (res: Response): void => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
};

export const sendAlreadyProcessed = (res: Response, entityLabel = 'This item'): void => {
    res.status(409).json({
        error: 'Conflict',
        message: `${entityLabel} has already been processed.`,
    });
};
