import { Request, Response } from 'express';
import {
    getHistoricalIssueStats,
    importHistoricalIssuesFromBuffer
} from '../services/historicalIssueService';
import {
    getHistoricalReceiveStats,
    importHistoricalReceivesFromBuffer
} from '../services/historicalReceiveService';
import { logEvents } from '../middlewares/logger';

export const getHistoricalIssueImportStatus = async (_req: Request, res: Response): Promise<void> => {
    try {
        const stats = await getHistoricalIssueStats();
        res.status(200).json({ stats });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Historical issue status failed: ${errorMessage}`, 'reportLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to load historical issue import status'
        });
    }
};

export const getHistoricalReceiveImportStatus = async (_req: Request, res: Response): Promise<void> => {
    try {
        const stats = await getHistoricalReceiveStats();
        res.status(200).json({ stats });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Historical receive status failed: ${errorMessage}`, 'reportLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to load historical receive import status'
        });
    }
};

export const importHistoricalReceives = async (req: Request, res: Response): Promise<void> => {
    try {
        const file = req.file;
        if (!file?.buffer?.length) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Excel file is required (field name: file)'
            });
            return;
        }

        const originalName = file.originalname?.toLowerCase() ?? '';
        if (!originalName.endsWith('.xlsx') && !originalName.endsWith('.xls')) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Only .xlsx or .xls files are supported'
            });
            return;
        }

        const result = await importHistoricalReceivesFromBuffer(file.buffer, {
            importedBy: req.user ?? 'unknown',
            sourceFile: file.originalname
        });

        res.status(200).json({
            message: 'Historical receives imported successfully',
            result
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Historical receive import failed: ${errorMessage}`, 'reportLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to import historical receives',
            details: process.env.NODE_ENV === 'production' ? undefined : errorMessage
        });
    }
};

export const importHistoricalIssues = async (req: Request, res: Response): Promise<void> => {
    try {
        const file = req.file;
        if (!file?.buffer?.length) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Excel file is required (field name: file)'
            });
            return;
        }

        const allowedExtensions = ['.xlsx', '.xls'];
        const originalName = file.originalname?.toLowerCase() ?? '';
        if (!allowedExtensions.some(ext => originalName.endsWith(ext))) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Only .xlsx or .xls files are supported'
            });
            return;
        }

        const result = await importHistoricalIssuesFromBuffer(file.buffer, {
            importedBy: req.user ?? 'unknown',
            sourceFile: file.originalname
        });

        res.status(200).json({
            message: 'Historical issues imported successfully',
            result
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Historical issue import failed: ${errorMessage}`, 'reportLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to import historical issues',
            details: process.env.NODE_ENV === 'production' ? undefined : errorMessage
        });
    }
};
