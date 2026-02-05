import ExcelJS from 'exceljs';
import { embedDieselWeeklyCharts, type DieselWeeklyChartsRequest } from '@/lib/reports/dieselWeeklyExcelWithCharts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req: Request): Promise<Response> {
    let body: DieselWeeklyChartsRequest & {
        start_date?: string;
        end_date?: string;
        flight_count?: number;
        reportBase64?: string;
        token?: string;
    };
    try {
        body = (await req.json()) as DieselWeeklyChartsRequest;
    }
    catch (err) {
        console.error('Failed to parse JSON body:', err);
        return Response.json({ message: 'Invalid JSON body' }, { status: 400 });
    }
    try {
        const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
        const tokenFromBody = typeof body.token === 'string' ? body.token.trim() : '';
        let normalizedAuth = '';
        if (authHeader && authHeader.startsWith('Bearer ')) {
            normalizedAuth = authHeader;
        }
        else if (authHeader && !authHeader.startsWith('Bearer ')) {
            normalizedAuth = `Bearer ${authHeader}`;
        }
        else if (tokenFromBody) {
            normalizedAuth = tokenFromBody.startsWith('Bearer ')
                ? tokenFromBody
                : `Bearer ${tokenFromBody}`;
        }
        if (!normalizedAuth) {
            console.error('Auth token missing');
            return Response.json({ message: 'Missing auth token. Please ensure you are logged in.' }, { status: 401 });
        }
        const baseUrl = process.env.INTERNAL_API_BASE_URL ||
            process.env.NEXT_PUBLIC_API_BASE_URL ||
            process.env.API_BASE_URL ||
            'http://localhost:5000';
        let summary: DieselWeeklyChartsRequest;
        let reportArrayBuffer: ArrayBuffer;
        if (body.reportBase64) {
            summary = body;
            const reportBuffer = Buffer.from(body.reportBase64, 'base64');
            reportArrayBuffer = reportBuffer.buffer.slice(reportBuffer.byteOffset, reportBuffer.byteOffset + reportBuffer.byteLength);
        }
        else {
            if (!body.start_date || !body.end_date) {
                return Response.json({ message: 'start_date and end_date are required' }, { status: 400 });
            }
            const params = new URLSearchParams({
                start_date: body.start_date,
                end_date: body.end_date,
            });
            if (body.flight_count !== undefined && body.flight_count !== null) {
                params.set('flight_count', String(body.flight_count));
            }
            const cookieHeader = req.headers.get('cookie');
            const upstreamHeaders: Record<string, string> = {
                'Authorization': normalizedAuth,
                'Content-Type': 'application/json',
            };
            if (cookieHeader) {
                upstreamHeaders['Cookie'] = cookieHeader;
            }
            const summaryRes = await fetch(`${baseUrl}/api/fuel/reports/diesel/weekly/summary?${params.toString()}`, {
                headers: upstreamHeaders,
                credentials: 'include'
            });
            if (!summaryRes.ok) {
                const summaryText = await summaryRes.text().catch(() => '');
                throw new Error(`Failed to load weekly diesel summary (${summaryRes.status}) ${summaryText}`.trim());
            }
            summary = (await summaryRes.json()) as DieselWeeklyChartsRequest;
            const reportRes = await fetch(`${baseUrl}/api/fuel/reports/diesel/weekly?${params.toString()}`, {
                headers: upstreamHeaders,
                credentials: 'include'
            });
            if (!reportRes.ok) {
                const reportText = await reportRes.text().catch(() => '');
                throw new Error(`Failed to load weekly diesel report (${reportRes.status}) ${reportText}`.trim());
            }
            const reportBuffer = Buffer.from(await reportRes.arrayBuffer());
            reportArrayBuffer = reportBuffer.buffer.slice(reportBuffer.byteOffset, reportBuffer.byteOffset + reportBuffer.byteLength);
        }
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'GIMS';
        workbook.lastModifiedBy = 'GIMS';
        workbook.created = new Date();
        workbook.modified = new Date();
        await workbook.xlsx.load(reportArrayBuffer);
        const targetSheetName = 'Diesel Weekly Template';
        const sheetsToRemove: ExcelJS.Worksheet[] = [];
        workbook.eachSheet((sheet) => {
            if (sheet.name !== targetSheetName) {
                sheetsToRemove.push(sheet);
            }
        });
        sheetsToRemove.forEach((sheet) => {
            workbook.removeWorksheet(sheet.id);
        });
        await embedDieselWeeklyCharts(workbook, summary, targetSheetName);
        workbook.calcProperties = {
            fullCalcOnLoad: true
        };
        const arrayBuffer = await workbook.xlsx.writeBuffer();
        const xlsx = Buffer.from(arrayBuffer as ArrayBuffer);
        const safeName = `Diesel_Weekly_${String(summary.prevWeekLabel || 'Prev')}_vs_${String(summary.currentWeekLabel || 'Current')}.xlsx`.replace(/[^\w\-(). ]+/g, '_');
        return new Response(xlsx, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${safeName}"`,
                'Cache-Control': 'no-store',
            },
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate Excel';
        console.error('Diesel weekly charts export failed:', err);
        return Response.json({ message }, { status: 500 });
    }
}
