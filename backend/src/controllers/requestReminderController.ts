import { Request, Response } from 'express';
import { sendUrgentRequestReminder } from '../services/requestReminderService';

export const sendUrgentReminder = async (req: Request, res: Response): Promise<void> => {
    const requestDetailId = Number(req.params.id);
    if (!Number.isFinite(requestDetailId) || requestDetailId <= 0) {
        res.status(400).json({ sent: false, message: 'Invalid request detail id' });
        return;
    }
    const result = await sendUrgentRequestReminder(requestDetailId);
    res.status(200).json(result);
};

