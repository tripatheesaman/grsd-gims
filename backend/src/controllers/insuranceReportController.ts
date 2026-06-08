import { Request, Response } from 'express';
import { logEvents } from '../middlewares/logger';
import {
    buildInsuranceReport,
    fetchInsuranceReportForExport,
    writeInsuranceReportExcel,
} from '../services/insuranceReportService';

export const getInsuranceReport = async (req: Request, res: Response): Promise<void> => {
    try {
        const {
            fiscalYear,
            asset_type_id,
            search,
            equipment_code,
            sortBy,
            sortOrder,
            page = '1',
            pageSize = '20',
        } = req.query;

        if (!fiscalYear || typeof fiscalYear !== 'string') {
            res.status(400).json({ error: 'Bad Request', message: 'fiscalYear is required' });
            return;
        }

        const report = await buildInsuranceReport({
            fiscalYear,
            asset_type_id: asset_type_id ? Number(asset_type_id) : undefined,
            search: typeof search === 'string' ? search : undefined,
            equipment_code: typeof equipment_code === 'string' ? equipment_code : undefined,
            sortBy: typeof sortBy === 'string' ? sortBy : undefined,
            sortOrder: sortOrder === 'DESC' || sortOrder === 'ASC' ? sortOrder : undefined,
            page: parseInt(String(page), 10) || 1,
            pageSize: parseInt(String(pageSize), 10) || 20,
        });

        res.status(200).json(report);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in getInsuranceReport: ${message}`, 'reportLog.log');
        res.status(error instanceof Error && message.includes('fiscal year') ? 400 : 500).json({
            error: message.includes('fiscal year') ? 'Bad Request' : 'Internal Server Error',
            message,
        });
    }
};

export const exportInsuranceReport = async (req: Request, res: Response): Promise<void> => {
    try {
        const {
            fiscalYear,
            exportType = 'all',
            asset_type_id,
            search,
            equipment_code,
            sortBy,
            sortOrder,
            page,
            pageSize,
        } = req.body;

        if (!fiscalYear || typeof fiscalYear !== 'string') {
            res.status(400).json({ error: 'Bad Request', message: 'fiscalYear is required' });
            return;
        }

        const report = await fetchInsuranceReportForExport(
            {
                fiscalYear,
                asset_type_id: asset_type_id ? Number(asset_type_id) : undefined,
                search: typeof search === 'string' ? search : undefined,
                equipment_code: typeof equipment_code === 'string' ? equipment_code : undefined,
                sortBy: typeof sortBy === 'string' ? sortBy : undefined,
                sortOrder: sortOrder === 'DESC' || sortOrder === 'ASC' ? sortOrder : undefined,
            },
            exportType === 'currentPage' ? 'currentPage' : 'all',
            page ? Number(page) : undefined,
            pageSize ? Number(pageSize) : undefined
        );

        await writeInsuranceReportExcel(report, res);
        logEvents(
            `Exported insurance report for FY ${fiscalYear}: ${report.data.length} rows`,
            'reportLog.log'
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error in exportInsuranceReport: ${message}`, 'reportLog.log');
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Internal Server Error',
                message: 'Failed to export insurance report',
            });
        }
    }
};
