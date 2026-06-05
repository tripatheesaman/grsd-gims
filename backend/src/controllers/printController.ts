import { Request, Response } from 'express';
import { generateRequestExcel, generateRRPExcel } from '../services/excelService';
import { generateCapitalRRPExcel } from '../services/capitalRrpExcelService';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2';
import { logEvents } from '../middlewares/logger';
export const printRequest = async (req: Request, res: Response): Promise<void> => {
    try {
        const { requestNumber } = req.params;
        if (!requestNumber) {
            logEvents(`Failed to print request - Missing request number`, "printLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'Request number is required'
            });
            return;
        }
        const excelBuffer = await generateRequestExcel(requestNumber);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=request_${requestNumber}.xlsx`);
        logEvents(`Successfully generated Excel for request: ${requestNumber}`, "printLog.log");
        res.send(excelBuffer);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error generating Excel for request ${req.params.requestNumber}: ${errorMessage}`, "printLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while generating the Excel file'
        });
    }
};
export const printRRP = async (req: Request, res: Response): Promise<void> => {
    try {
        const { rrpNumber } = req.params;
        if (!rrpNumber) {
            logEvents(`Failed to print RRP - Missing RRP number`, "printLog.log");
            res.status(400).json({
                error: 'Bad Request',
                message: 'RRP number is required'
            });
            return;
        }
        const [metaRows] = await pool.query<RowDataPacket[]>(
            'SELECT rrp_category FROM rrp_details WHERE rrp_number = ? LIMIT 1',
            [rrpNumber]
        );
        const isCapital =
            metaRows[0]?.rrp_category === 'capital' || /^C/i.test(rrpNumber);
        const excelBuffer = isCapital
            ? await generateCapitalRRPExcel(rrpNumber)
            : await generateRRPExcel(rrpNumber);
        const filename = isCapital ? `RRCP_${rrpNumber}.xlsx` : `rrp_${rrpNumber}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        logEvents(`Successfully generated Excel for RRP: ${rrpNumber}`, "printLog.log");
        res.send(excelBuffer);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Error generating Excel for RRP ${req.params.rrpNumber}: ${errorMessage}`, "printLog.log");
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'An error occurred while generating the Excel file'
        });
    }
};
