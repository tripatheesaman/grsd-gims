import { Request, Response } from 'express';
import { analyzeStockLevels, generateStockLevelsExcel } from '../services/stockLevelAnalysisService';
import { logEvents } from '../middlewares/logger';

export const exportStockLevelsAnalysis = async (req: Request, res: Response): Promise<void> => {
    try {
        logEvents(
            `Stock level analysis export started by user: ${req.user ?? 'unknown'}`,
            'reportLog.log'
        );

        const analysisRows = await analyzeStockLevels();
        const buffer = await generateStockLevelsExcel(analysisRows);
        const dateStamp = new Date().toISOString().split('T')[0];

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="Stock_Levels_Analysis_${dateStamp}.xlsx"`
        );
        res.send(buffer);

        logEvents(
            `Stock level analysis export completed: ${analysisRows.length} items analyzed`,
            'reportLog.log'
        );
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        logEvents(`Stock level analysis export failed: ${errorMessage}`, 'reportLog.log');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to generate stock levels analysis'
        });
    }
};
