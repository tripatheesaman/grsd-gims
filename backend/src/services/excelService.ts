import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { RowDataPacket } from 'mysql2';
import pool from '../config/db';
import sharp from 'sharp';
import dotenv from 'dotenv';
import { logEvents } from '../middlewares/logger';
import { normalizeEquipmentNumbers } from '../utils/utils';
import { adToBs } from '../utils/dateConverter';
import PDFDocument from 'pdfkit';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
dotenv.config();
interface RequestItem extends RowDataPacket {
    nac_code: string;
    item_name: string;
    part_number: string;
    unit: string;
    requested_quantity: number;
    current_balance: number;
    previous_rate: number;
    equipment_number: string;
    specifications: string | null;
    image_path: string | null;
}
interface RequestDetails extends RowDataPacket {
    request_number: string;
    request_date: Date;
    remarks: string | null;
    requested_by: string;
}
interface UserDetails extends RowDataPacket {
    first_name: string;
    last_name: string;
    staffid: string;
    designation: string;
}
interface AuthorityDetails extends RowDataPacket {
    level_1_authority_name: string;
    level_1_authority_staffid: string;
    level_1_authority_designation: string;
    level_2_authority_name: string;
    level_2_authority_staffid: string;
    level_2_authority_designation: string;
}
interface RRPItem extends RowDataPacket {
    id: number;
    rrp_number: string;
    supplier_name: string;
    date: Date;
    currency: string;
    forex_rate: number;
    item_price: number;
    customs_charge: number;
    customs_service_charge: number;
    vat_percentage: number;
    invoice_number: string;
    invoice_date: Date;
    po_number: string;
    airway_bill_number: string;
    inspection_details: string;
    approval_status: string;
    created_by: string;
    total_amount: number;
    freight_charge: number;
    customs_date: Date;
    item_name: string;
    part_number: string;
    received_quantity: number;
    unit: string;
    equipment_number: string;
}
interface RRPDetails extends RowDataPacket {
    rrp_number: string;
    date: Date;
    supplier_name: string;
    currency: string;
    forex_rate: number;
    invoice_number: string;
    invoice_date: Date;
    po_number: string;
    airway_bill_number: string;
    inspection_details: string;
    approval_status: string;
    created_by: string;
    customs_date: Date;
    customs_number: string;
}
export interface StockCardData extends RowDataPacket {
    nac_code: string;
    item_name: string;
    part_number: string;
    equipment_number: string;
    location: string;
    card_number: string;
    open_quantity: number;
    open_amount: number;
}
export class ExcelService {
    private static async getRequestDetails(requestNumber: string): Promise<{
        requestDetails: RequestDetails;
        items: RequestItem[];
        userDetails: UserDetails;
        authorityDetails: AuthorityDetails;
    }> {
        const connection = await pool.getConnection();
        try {
            logEvents(`Fetching request details for request number: ${requestNumber}`, "excelServiceLog.log");
            const [requestRows] = await connection.query<RequestDetails[]>('SELECT request_number, request_date, remarks, requested_by FROM request_details WHERE request_number = ? LIMIT 1', [requestNumber]);
            if (!requestRows.length) {
                logEvents(`Request not found: ${requestNumber}`, "excelServiceLog.log");
                throw new Error('Request not found');
            }
            const [itemRows] = await connection.query<RequestItem[]>(`SELECT nac_code, item_name, part_number, unit, requested_quantity, 
                        current_balance, previous_rate, equipment_number, specifications, image_path
                 FROM request_details 
                 WHERE request_number = ?`, [requestNumber]);
            logEvents(`Found ${itemRows.length} items for request: ${requestNumber}`, "excelServiceLog.log");
            const requestedBy = requestRows[0].requested_by?.trim();
            logEvents(`Looking up user with requested_by value: "${requestedBy}" for request: ${requestNumber}`, "excelServiceLog.log");
            if (!requestedBy) {
                logEvents(`requested_by is empty or null for request: ${requestNumber}`, "excelServiceLog.log");
                throw new Error('Request creator email not found');
            }
            let [userRows] = await connection.query<UserDetails[]>('SELECT first_name, last_name, staffid, designation FROM users WHERE username = ?', [requestedBy]);
            if (!userRows.length) {
                logEvents(`User not found with exact match for: "${requestedBy}", trying case-insensitive lookup`, "excelServiceLog.log");
                [userRows] = await connection.query<UserDetails[]>('SELECT first_name, last_name, staffid, designation FROM users WHERE LOWER(username) = LOWER(?)', [requestedBy]);
            }
            if (!userRows.length) {
                logEvents(`User details not found for username: "${requestedBy}" for request: ${requestNumber} (tried both exact and case-insensitive)`, "excelServiceLog.log");
                throw new Error(`User details not found for: ${requestedBy}`);
            }
            logEvents(`User found: ${userRows[0].first_name} ${userRows[0].last_name} for requested_by: "${requestedBy}"`, "excelServiceLog.log");
            const [authorityRows] = await connection.query<AuthorityDetails[]>('SELECT level_1_authority_name, level_1_authority_staffid, level_1_authority_designation, ' +
                'level_2_authority_name, level_2_authority_staffid, level_2_authority_designation ' +
                'FROM authority_details WHERE authority_type = ? ORDER BY id DESC LIMIT 1', ['request']);
            if (!authorityRows.length) {
                logEvents('Authority details not found', "excelServiceLog.log");
                throw new Error('Authority details not found');
            }
            logEvents(`Successfully fetched all details for request: ${requestNumber}`, "excelServiceLog.log");
            return {
                requestDetails: requestRows[0],
                items: itemRows,
                userDetails: userRows[0],
                authorityDetails: authorityRows[0]
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            logEvents(`Error fetching request details for ${requestNumber}: ${errorMessage}`, "excelServiceLog.log");
            throw new Error(`Failed to fetch request details: ${errorMessage}`);
        }
        finally {
            connection.release();
        }
    }
    private static formatDate(date: Date | string | null | undefined): string {
        if (!date)
            return '';
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        return dateObj.toISOString().split('T')[0].replace(/-/g, '/');
    }
    private static async resizeImage(imagePath: string, maxWidth = 120, maxHeight = 100): Promise<{
        buffer: Buffer;
        extension: string;
    }> {
        try {
            logEvents(`Resizing image: ${imagePath}`, "excelServiceLog.log");
            let imageBuffer: Buffer | null = null;
            let foundPath: string | null = null;
            const cleanPath = imagePath.startsWith('/') ? imagePath.slice(1) : imagePath;
            const relativePath = cleanPath.startsWith('images/') ? cleanPath.slice(7) : (cleanPath.startsWith('images') ? cleanPath.slice(6) : cleanPath);
            const possiblePaths = [
                '/srv/grsd-gims/uploads',
                '/app/public/images',
                process.env.PUBLIC_IMAGES_PATH,
                path.join(__dirname, '../../frontend/public/images'),
                path.join(__dirname, '../../../frontend/public/images'),
                path.join(__dirname, '../../public/images'),
            ]
                .filter((p): p is string => p !== null && p !== undefined)
                .map(basePath => path.join(basePath, relativePath));
            const directPaths = [
                path.join(__dirname, '../../frontend/public', cleanPath),
                path.join(__dirname, '../../../frontend/public', cleanPath),
                path.join(__dirname, '../../public', cleanPath),
                imagePath.startsWith('/') && fs.existsSync(imagePath) ? imagePath : null,
            ].filter((p): p is string => p !== null);
            const allPaths = [...possiblePaths, ...directPaths];
            logEvents(`Trying to find image "${imagePath}" (relative: "${relativePath}") at ${allPaths.length} possible locations`, "excelServiceLog.log");
            for (const filePath of allPaths) {
                try {
                    if (fs.existsSync(filePath)) {
                        imageBuffer = fs.readFileSync(filePath);
                        foundPath = filePath;
                        logEvents(`✓ Found image at: ${filePath} (size: ${imageBuffer.length} bytes)`, "excelServiceLog.log");
                        break;
                    }
                }
                catch (err) {
                    const errMsg = err instanceof Error ? err.message : 'Unknown error';
                    logEvents(`✗ Failed to read from ${filePath}: ${errMsg}`, "excelServiceLog.log");
                    continue;
                }
            }
            if (!imageBuffer) {
                logEvents(`✗ Image not found in any filesystem location. Tried paths:`, "excelServiceLog.log");
                allPaths.forEach(p => logEvents(`  - ${p}`, "excelServiceLog.log"));
            }
            if (!imageBuffer) {
                logEvents(`Image not found in filesystem, trying backend static route`, "excelServiceLog.log");
                const backendStaticPath = path.join(__dirname, '../../frontend/public/images', relativePath);
                try {
                    if (fs.existsSync(backendStaticPath)) {
                        imageBuffer = fs.readFileSync(backendStaticPath);
                        foundPath = backendStaticPath;
                        logEvents(`Found image via backend static path: ${backendStaticPath} (size: ${imageBuffer.length} bytes)`, "excelServiceLog.log");
                    }
                }
                catch (staticErr) {
                    logEvents(`Backend static path also failed: ${staticErr instanceof Error ? staticErr.message : 'Unknown'}`, "excelServiceLog.log");
                }
            }
            if (!imageBuffer) {
                logEvents(`Image not found in filesystem, trying to fetch from frontend service`, "excelServiceLog.log");
                let urlPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
                if (urlPath.startsWith('/images/')) {
                    urlPath = urlPath.replace('/images/', '/api/images/');
                }
                else if (!urlPath.startsWith('/api/')) {
                    urlPath = `/api/images/${urlPath.startsWith('/') ? urlPath.slice(1) : urlPath}`;
                }
                const dockerFrontendUrl = 'http://frontend:3000';
                const dockerImageUrl = `${dockerFrontendUrl}${urlPath}`;
                logEvents(`Fetching image from Docker frontend service: ${dockerImageUrl}`, "excelServiceLog.log");
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 10000);
                    const response = await fetch(dockerImageUrl, {
                        signal: controller.signal,
                        headers: {
                            'User-Agent': 'GIMS-Backend/1.0'
                        }
                    });
                    clearTimeout(timeoutId);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch image from Docker frontend: ${dockerImageUrl} (Status: ${response.status})`);
                    }
                    const arrayBuffer = await response.arrayBuffer();
                    imageBuffer = Buffer.from(arrayBuffer);
                    logEvents(`✓ Successfully fetched image from Docker frontend service (size: ${imageBuffer.length} bytes)`, "excelServiceLog.log");
                }
                catch (dockerFetchError) {
                    const dockerErrMsg = dockerFetchError instanceof Error ? dockerFetchError.message : 'Unknown error';
                    logEvents(`✗ Failed to fetch from Docker frontend service: ${dockerErrMsg}`, "excelServiceLog.log");
                    const frontendUrl = process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:3000';
                    const externalImageUrl = `${frontendUrl}${urlPath}`;
                    logEvents(`Trying external frontend URL: ${externalImageUrl}`, "excelServiceLog.log");
                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 10000);
                        const response = await fetch(externalImageUrl, {
                            signal: controller.signal,
                            headers: {
                                'User-Agent': 'GIMS-Backend/1.0'
                            }
                        });
                        clearTimeout(timeoutId);
                        if (!response.ok) {
                            throw new Error(`Failed to fetch image from external frontend: ${externalImageUrl} (Status: ${response.status})`);
                        }
                        const arrayBuffer = await response.arrayBuffer();
                        imageBuffer = Buffer.from(arrayBuffer);
                        logEvents(`✓ Successfully fetched image from external frontend URL (size: ${imageBuffer.length} bytes)`, "excelServiceLog.log");
                    }
                    catch (externalFetchError) {
                        const externalErrMsg = externalFetchError instanceof Error ? externalFetchError.message : 'Unknown error';
                        logEvents(`✗ Failed to fetch image from external frontend URL: ${externalErrMsg}`, "excelServiceLog.log");
                        throw new Error(`Unable to load image from any source: ${imagePath}. Docker error: ${dockerErrMsg}, External error: ${externalErrMsg}`);
                    }
                }
            }
            if (!imageBuffer || imageBuffer.length === 0) {
                throw new Error('Image buffer is empty after reading');
            }
            let imageExtension = 'png';
            if (foundPath) {
                const ext = path.extname(foundPath).toLowerCase().slice(1);
                if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
                    imageExtension = ext === 'jpg' ? 'jpeg' : ext;
                }
            }
            else if (imagePath) {
                const ext = path.extname(imagePath).toLowerCase().slice(1);
                if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
                    imageExtension = ext === 'jpg' ? 'jpeg' : ext;
                }
            }
            const resizedBuffer = await sharp(imageBuffer)
                .resize(maxWidth, maxHeight, { fit: 'inside', background: { r: 255, g: 255, b: 255, alpha: 1 } })
                .png()
                .toBuffer();
            logEvents(`Successfully resized image: ${imagePath} (original: ${imageBuffer.length} bytes, resized: ${resizedBuffer.length} bytes, extension: ${imageExtension})`, "excelServiceLog.log");
            return { buffer: resizedBuffer, extension: 'png' };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            const errorStack = error instanceof Error ? error.stack : 'No stack trace';
            logEvents(`Error resizing image ${imagePath}: ${errorMessage}`, "excelServiceLog.log");
            logEvents(`Error stack: ${errorStack}`, "excelServiceLog.log");
            throw error;
        }
    }
    public static async generateRequestExcel(requestNumber: string): Promise<ExcelJS.Buffer> {
        try {
            logEvents(`Generating request Excel for request number: ${requestNumber}`, "excelServiceLog.log");
            const { requestDetails, items, userDetails, authorityDetails } = await ExcelService.getRequestDetails(requestNumber);
            const templatePath = path.join(__dirname, '../../public/templates/template_file.xlsx');
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(templatePath);
            const worksheet = workbook.getWorksheet('Request Template');
            if (!worksheet) {
                throw new Error('Template worksheet not found');
            }
            const templateWorksheet = workbook.getWorksheet('Request Template');
            if (!templateWorksheet) {
                throw new Error('Template worksheet not found');
            }
            worksheet.properties = { ...templateWorksheet.properties };
            worksheet.views = templateWorksheet.views;
            worksheet.pageSetup = { ...templateWorksheet.pageSetup };
            worksheet.headerFooter = { ...templateWorksheet.headerFooter };
            worksheet.autoFilter = templateWorksheet.autoFilter;
            worksheet.mergeCells = templateWorksheet.mergeCells;
            templateWorksheet.columns.forEach((col, index) => {
                if (col) {
                    const targetCol = worksheet.getColumn(index + 1);
                    targetCol.width = col.width || 8.43;
                    if (col.style) {
                        targetCol.style = col.style;
                    }
                    targetCol.hidden = col.hidden || false;
                    targetCol.outlineLevel = col.outlineLevel || 0;
                }
            });
            templateWorksheet.eachRow((row, rowNumber) => {
                const targetRow = worksheet.getRow(rowNumber);
                targetRow.height = row.height || 15;
                targetRow.hidden = row.hidden || false;
                targetRow.outlineLevel = row.outlineLevel || 0;
                row.eachCell((cell, colNumber) => {
                    const targetCell = worksheet.getCell(rowNumber, colNumber);
                    if (cell.style)
                        targetCell.style = cell.style;
                    if (cell.numFmt)
                        targetCell.numFmt = cell.numFmt;
                    if (cell.font)
                        targetCell.font = cell.font;
                    if (cell.alignment)
                        targetCell.alignment = cell.alignment;
                    if (cell.border)
                        targetCell.border = cell.border;
                    if (cell.fill)
                        targetCell.fill = cell.fill;
                });
            });
            const formattedDate = ExcelService.formatDate(requestDetails.request_date);
            worksheet.getCell('C7').value = `${requestDetails.request_number}(${formattedDate})`;
            let currentRow = 10;
            let specificationsText = '';
            for (const item of items) {
                worksheet.getCell(`B${currentRow}`).value = item.nac_code;
                worksheet.getCell(`C${currentRow}`).value = item.item_name;
                worksheet.getCell(`D${currentRow}`).value = item.part_number;
                worksheet.getCell(`E${currentRow}`).value = item.unit;
                worksheet.getCell(`F${currentRow}`).value = item.requested_quantity;
                worksheet.getCell(`G${currentRow}`).value = item.current_balance;
                worksheet.getCell(`H${currentRow}`).value = item.previous_rate;
                worksheet.getCell(`I${currentRow}`).value = item.equipment_number;
                specificationsText += `${item.nac_code}:${item.specifications || ''}\n`;
                currentRow++;
            }
            worksheet.getCell('A14').value = specificationsText.trim();
            worksheet.getCell('A14').alignment = { vertical: 'top', wrapText: true };
            worksheet.getCell('I14').value = requestDetails.remarks ? requestDetails.remarks.trim() : "";
            const imageWidthPx = 200;
            const imageHeightPx = 100;
            const startCol = 0;
            const endCol = 7;
            const EMU = 9525;
            let totalWidthPx = 0;
            for (let c = startCol; c <= endCol; c++) {
                const colWidth = worksheet.getColumn(c + 1).width || 8.43;
                totalWidthPx += colWidth * 7;
            }
            const imageItems = items.filter(item => item.image_path && item.image_path.trim() !== '');
            const imageCount = imageItems.length;
            logEvents(`Found ${imageCount} items with images for request ${requestNumber}`, "excelServiceLog.log");
            if (imageCount > 0) {
                const totalImageWidth = imageCount * imageWidthPx;
                const totalSpacing = totalWidthPx - totalImageWidth;
                const initialSpacing = totalSpacing * 0.2;
                const remainingSpacing = totalSpacing - initialSpacing;
                const spacingBetweenImages = imageCount > 1 ? remainingSpacing / (imageCount - 1) : 0;
                for (let i = 0; i < imageCount; i++) {
                    const item = imageItems[i];
                    if (!item.image_path || item.image_path.trim() === '') {
                        logEvents(`Skipping item ${i + 1} - no image path`, "excelServiceLog.log");
                        continue;
                    }
                    try {
                        logEvents(`Processing image ${i + 1}/${imageCount}: ${item.image_path}`, "excelServiceLog.log");
                        const imageResult = await ExcelService.resizeImage(item.image_path, imageWidthPx, imageHeightPx);
                        if (!imageResult.buffer || imageResult.buffer.length === 0) {
                            logEvents(`Warning: Image buffer is empty for ${item.image_path}`, "excelServiceLog.log");
                            continue;
                        }
                        const imageId = workbook.addImage({
                            buffer: imageResult.buffer as any,
                            extension: imageResult.extension as 'png' | 'jpeg' | 'gif'
                        });
                        let imagePosition;
                        if (i === 0) {
                            imagePosition = initialSpacing;
                        }
                        else {
                            imagePosition = initialSpacing + (i * imageWidthPx) + (i * spacingBetweenImages);
                        }
                        let currentWidth = 0;
                        let col = startCol;
                        let colOffset = 0;
                        for (let c = startCol; c <= endCol; c++) {
                            const colWidth = worksheet.getColumn(c + 1).width || 8.43;
                            const colWidthPx = colWidth * 7;
                            if (currentWidth + colWidthPx > imagePosition) {
                                col = c;
                                colOffset = (imagePosition - currentWidth) * EMU;
                                break;
                            }
                            currentWidth += colWidthPx;
                        }
                        worksheet.addImage(imageId, {
                            tl: { col, row: 14.2, nativeColOff: colOffset },
                            ext: { width: imageWidthPx, height: imageHeightPx }
                        });
                        logEvents(`Successfully added image ${i + 1} at position col=${col}, row=14.2, offset=${colOffset}`, "excelServiceLog.log");
                    }
                    catch (imageError) {
                        const errorMsg = imageError instanceof Error ? imageError.message : 'Unknown error';
                        logEvents(`Error processing image ${i + 1} (${item.image_path}): ${errorMsg}`, "excelServiceLog.log");
                        continue;
                    }
                }
                logEvents(`Completed image placement: ${imageCount} images processed`, "excelServiceLog.log");
            }
            else {
                logEvents(`No images found for request ${requestNumber}`, "excelServiceLog.log");
            }
            worksheet.getCell('A20').value = `${userDetails.first_name} ${userDetails.last_name}`;
            worksheet.getCell('A21').value = userDetails.staffid;
            worksheet.getCell('A22').value = userDetails.designation;
            worksheet.getCell('D20').value = authorityDetails.level_1_authority_name;
            worksheet.getCell('D21').value = authorityDetails.level_1_authority_staffid;
            worksheet.getCell('D22').value = authorityDetails.level_1_authority_designation;
            worksheet.getCell('I20').value = authorityDetails.level_2_authority_name;
            worksheet.getCell('I21').value = authorityDetails.level_2_authority_staffid;
            worksheet.getCell('I22').value = authorityDetails.level_2_authority_designation;
            const sheetsToDelete = workbook.worksheets.filter(sheet => sheet.name !== 'Request Template');
            sheetsToDelete.forEach(sheet => workbook.removeWorksheet(sheet.id));
            logEvents(`Successfully generated request Excel for: ${requestNumber}`, "excelServiceLog.log");
            return await workbook.xlsx.writeBuffer();
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            logEvents(`Error generating request Excel for ${requestNumber}: ${errorMessage}`, "excelServiceLog.log");
            throw new Error(`Failed to generate request Excel: ${errorMessage}`);
        }
    }
    public static async generateRequestPdf(requestNumber: string): Promise<string> {
        try {
            logEvents(`Generating request PDF for request number: ${requestNumber}`, "excelServiceLog.log");
            const { requestDetails, items, userDetails, authorityDetails } = await ExcelService.getRequestDetails(requestNumber);
            const formattedDate = ExcelService.formatDate(requestDetails.request_date);
            const doc = new PDFDocument({
                size: 'A4',
                margin: 20,
                layout: 'landscape'
            });
            const tmpPath = path.join(os.tmpdir(), `request-${requestNumber}-${uuidv4()}.pdf`);
            const stream = fs.createWriteStream(tmpPath);
            doc.pipe(stream);
            doc.fontSize(12)
                .font('Helvetica-Bold')
                .text(`${requestDetails.request_number}(${formattedDate})`, 100, 50);
            const startY = 100;
            const rowHeight = 20;
            const colWidths = [60, 120, 100, 50, 50, 60, 60, 60, 100];
            const colX = [50, 110, 230, 330, 380, 430, 490, 550, 610];
            doc.fontSize(9)
                .font('Helvetica-Bold')
                .text('NAC Code', colX[1], startY)
                .text('Item Name', colX[2], startY)
                .text('Part Number', colX[3], startY)
                .text('Unit', colX[4], startY)
                .text('Qty', colX[5], startY)
                .text('Balance', colX[6], startY)
                .text('Rate', colX[7], startY)
                .text('Equipment', colX[8], startY);
            doc.moveTo(50, startY + 15)
                .lineTo(710, startY + 15)
                .stroke();
            let currentY = startY + rowHeight;
            let specificationsText = '';
            for (const item of items) {
                doc.fontSize(8)
                    .font('Helvetica')
                    .text(item.nac_code || '', colX[1], currentY, { width: colWidths[1] })
                    .text(item.item_name || '', colX[2], currentY, { width: colWidths[2] })
                    .text(item.part_number || '', colX[3], currentY, { width: colWidths[3] })
                    .text(item.unit || '', colX[4], currentY, { width: colWidths[4] })
                    .text(String(item.requested_quantity || 0), colX[5], currentY, { width: colWidths[5] })
                    .text(String(item.current_balance || 0), colX[6], currentY, { width: colWidths[6] })
                    .text(String(item.previous_rate || 0), colX[7], currentY, { width: colWidths[7] })
                    .text(item.equipment_number || '', colX[8], currentY, { width: colWidths[8] });
                specificationsText += `${item.nac_code}:${item.specifications || ''}\n`;
                currentY += rowHeight;
            }
            const specsY = currentY + 20;
            doc.fontSize(9)
                .font('Helvetica-Bold')
                .text('Specifications:', 50, specsY);
            doc.fontSize(8)
                .font('Helvetica')
                .text(specificationsText.trim(), 50, specsY + 15, {
                width: 400,
                align: 'left'
            });
            if (requestDetails.remarks) {
                doc.fontSize(9)
                    .font('Helvetica-Bold')
                    .text('Remarks:', 610, specsY);
                doc.fontSize(8)
                    .font('Helvetica')
                    .text(requestDetails.remarks.trim(), 610, specsY + 15, {
                    width: 100,
                    align: 'left'
                });
            }
            const imageItems = items.filter(item => item.image_path && item.image_path.trim() !== '');
            if (imageItems.length > 0) {
                const imageY = specsY + 80;
                const imageWidth = 150;
                const imageHeight = 100;
                const imageSpacing = 20;
                let imageX = 50;
                for (let i = 0; i < Math.min(imageItems.length, 4); i++) {
                    const item = imageItems[i];
                    try {
                        const imageResult = await ExcelService.resizeImage(item.image_path!, imageWidth, imageHeight);
                        if (imageResult.buffer && imageResult.buffer.length > 0) {
                            doc.image(imageResult.buffer, imageX, imageY, {
                                width: imageWidth,
                                height: imageHeight
                            });
                            imageX += imageWidth + imageSpacing;
                        }
                    }
                    catch (imageError) {
                        await logEvents(`Error adding image to PDF: ${imageError instanceof Error ? imageError.message : String(imageError)}`, "excelServiceLog.log");
                    }
                }
            }
            const signatureY = 500;
            doc.fontSize(9)
                .font('Helvetica-Bold')
                .text('Requested By:', 50, signatureY)
                .text('Level 1 Authority:', 250, signatureY)
                .text('Level 2 Authority:', 550, signatureY);
            doc.fontSize(8)
                .font('Helvetica')
                .text(`${userDetails.first_name} ${userDetails.last_name}`, 50, signatureY + 20)
                .text(userDetails.staffid, 50, signatureY + 35)
                .text(userDetails.designation, 50, signatureY + 50)
                .text(authorityDetails.level_1_authority_name, 250, signatureY + 20)
                .text(authorityDetails.level_1_authority_staffid, 250, signatureY + 35)
                .text(authorityDetails.level_1_authority_designation, 250, signatureY + 50)
                .text(authorityDetails.level_2_authority_name, 550, signatureY + 20)
                .text(authorityDetails.level_2_authority_staffid, 550, signatureY + 35)
                .text(authorityDetails.level_2_authority_designation, 550, signatureY + 50);
            doc.end();
            await new Promise<void>((resolve, reject) => {
                stream.on('finish', () => {
                    logEvents(`Successfully generated request PDF for: ${requestNumber}`, "excelServiceLog.log");
                    resolve();
                });
                stream.on('error', (err) => {
                    logEvents(`Error writing PDF stream for ${requestNumber}: ${err.message}`, "excelServiceLog.log");
                    reject(err);
                });
            });
            return tmpPath;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            logEvents(`Error generating request PDF for ${requestNumber}: ${errorMessage}`, "excelServiceLog.log");
            throw new Error(`Failed to generate request PDF: ${errorMessage}`);
        }
    }
    private static async getRRPDetails(rrpNumber: string): Promise<{
        rrpDetails: RRPDetails;
        items: RRPItem[];
        userDetails: UserDetails;
        authorityDetails: AuthorityDetails;
        createdByUser: UserDetails;
        inspectionName: string;
        inspectionDesignation: string;
    }> {
        const connection = await pool.getConnection();
        try {
            logEvents(`Fetching RRP details for RRP number: ${rrpNumber}`, "excelServiceLog.log");
            const [rrpRows] = await connection.query<RRPDetails[]>(`SELECT rrp_number, date, supplier_name, currency, forex_rate, 
                        invoice_number, invoice_date, po_number, airway_bill_number, 
                        inspection_details, approval_status, created_by, customs_date, customs_number, current_fy 
                 FROM rrp_details 
                 WHERE rrp_number = ? 
                 LIMIT 1`, [rrpNumber]);
            if (!rrpRows.length) {
                logEvents(`RRP not found: ${rrpNumber}`, "excelServiceLog.log");
                throw new Error('RRP not found');
            }
            const [itemRows] = await connection.query<RRPItem[]>(`SELECT rd.id, rd.rrp_number, rd.supplier_name, rd.date, rd.currency, rd.forex_rate,
                        rd.item_price, rd.customs_charge, rd.customs_service_charge, rd.vat_percentage,
                        rd.invoice_number, rd.invoice_date, rd.po_number, rd.airway_bill_number,
                        rd.inspection_details, rd.approval_status, rd.created_by, rd.total_amount,
                        rd.freight_charge, rd.customs_date, rd.customs_number, red.item_name, red.part_number,
                        red.received_quantity, red.unit, rqd.equipment_number, red.nac_code, rqd.request_number, rqd.request_date
                 FROM rrp_details rd
                 JOIN receive_details red ON rd.receive_fk = red.id
                 JOIN request_details rqd ON red.request_fk = rqd.id
                 WHERE rd.rrp_number = ?`, [rrpNumber]);
            const [userRows] = await connection.query<UserDetails[]>('SELECT first_name, last_name, staffid, designation FROM users WHERE username = ?', [rrpRows[0].created_by]);
            if (!userRows.length) {
                logEvents(`User details not found for username: ${rrpRows[0].created_by}`, "excelServiceLog.log");
                throw new Error('User details not found');
            }
            const [createdByUserRows] = await connection.query<UserDetails[]>('SELECT first_name, last_name, staffid, designation FROM users WHERE username = ?', [rrpRows[0].created_by]);
            if (!createdByUserRows.length) {
                logEvents(`Created by user details not found for username: ${rrpRows[0].created_by}`, "excelServiceLog.log");
                throw new Error('Created by user details not found');
            }
            const [authorityRows] = await connection.query<AuthorityDetails[]>('SELECT level_1_authority_name, level_1_authority_staffid, level_1_authority_designation, ' +
                'quality_check_authority_name, quality_check_authority_staffid, quality_check_authority_designation ' +
                'FROM authority_details WHERE authority_type = ? ORDER BY id DESC LIMIT 1', ['rrp']);
            if (!authorityRows.length) {
                logEvents('Authority details not found', "excelServiceLog.log");
                throw new Error('Authority details not found');
            }
            const inspectionDetails = JSON.parse(rrpRows[0].inspection_details);
            let inspectionName = '';
            let inspectionDesignation = '';
            if (inspectionDetails.names && inspectionDetails.designations) {
                const names = Array.isArray(inspectionDetails.names)
                    ? inspectionDetails.names
                    : [inspectionDetails.names];
                const designations = Array.isArray(inspectionDetails.designations)
                    ? inspectionDetails.designations
                    : [inspectionDetails.designations];
                inspectionName = names.join(' / ');
                inspectionDesignation = designations.join(' / ');
            }
            else if (inspectionDetails.inspection_user) {
                const inspectionUser = inspectionDetails.inspection_user;
                const [namePart, ...designationParts] = inspectionUser.split(',');
                inspectionName = namePart.trim();
                inspectionDesignation = designationParts.join(',').trim();
            }
            logEvents(`Successfully fetched all RRP details for: ${rrpNumber}`, "excelServiceLog.log");
            return {
                rrpDetails: rrpRows[0],
                items: itemRows,
                userDetails: userRows[0],
                authorityDetails: authorityRows[0],
                createdByUser: createdByUserRows[0],
                inspectionName,
                inspectionDesignation,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            logEvents(`Error fetching RRP details for ${rrpNumber}: ${errorMessage}`, "excelServiceLog.log");
            throw new Error(`Failed to fetch RRP details: ${errorMessage}`);
        }
        finally {
            connection.release();
        }
    }
    public static async generateRRPExcel(rrpNumber: string): Promise<ExcelJS.Buffer> {
        try {
            logEvents(`Generating RRP Excel for RRP number: ${rrpNumber}`, "excelServiceLog.log");
            const { rrpDetails, items, userDetails, authorityDetails, createdByUser, inspectionName, inspectionDesignation } = await ExcelService.getRRPDetails(rrpNumber);
            const rrpType = rrpNumber.charAt(0).toUpperCase() === 'L' ? 'local' : 'foreign';
            const templatePath = path.join(__dirname, '../../public/templates/template_file.xlsx');
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(templatePath);
            const sheetName = rrpType === 'local' ? 'RRLP Template' : 'RRFP Template';
            const worksheet = workbook.getWorksheet(sheetName);
            let freightChargeTotal = 0;
            if (!worksheet) {
                throw new Error(`Template worksheet '${sheetName}' not found`);
            }
            const templateWorksheet = workbook.getWorksheet(sheetName);
            if (!templateWorksheet) {
                throw new Error(`Template worksheet '${sheetName}' not found`);
            }
            worksheet.properties = { ...templateWorksheet.properties };
            worksheet.views = templateWorksheet.views;
            worksheet.pageSetup = { ...templateWorksheet.pageSetup };
            worksheet.headerFooter = { ...templateWorksheet.headerFooter };
            worksheet.autoFilter = templateWorksheet.autoFilter;
            worksheet.mergeCells = templateWorksheet.mergeCells;
            templateWorksheet.columns.forEach((col, index) => {
                if (col) {
                    const targetCol = worksheet.getColumn(index + 1);
                    targetCol.width = col.width || 8.43;
                    if (col.style) {
                        targetCol.style = col.style;
                    }
                    targetCol.hidden = col.hidden || false;
                    targetCol.outlineLevel = col.outlineLevel || 0;
                }
            });
            templateWorksheet.eachRow((row, rowNumber) => {
                const targetRow = worksheet.getRow(rowNumber);
                targetRow.height = row.height || 15;
                targetRow.hidden = row.hidden || false;
                targetRow.outlineLevel = row.outlineLevel || 0;
                row.eachCell((cell, colNumber) => {
                    const targetCell = worksheet.getCell(rowNumber, colNumber);
                    if (cell.style)
                        targetCell.style = cell.style;
                    if (cell.numFmt)
                        targetCell.numFmt = cell.numFmt;
                    if (cell.font)
                        targetCell.font = cell.font;
                    if (cell.alignment)
                        targetCell.alignment = cell.alignment;
                    if (cell.border)
                        targetCell.border = cell.border;
                    if (cell.fill)
                        targetCell.fill = cell.fill;
                });
            });
            if (rrpType === 'local') {
                const rrpNumberWithoutPrefix = rrpDetails.rrp_number.substring(1).split('T')[0].padStart(3, '0');
                worksheet.getCell('J5').value = `RRLP: ${rrpNumberWithoutPrefix}`;
                worksheet.getCell('J3').value = `FY: ${rrpDetails.current_fy}`;
                const formattedDate = ExcelService.formatDate(rrpDetails.date);
                const nepaliDate = adToBs(formattedDate);
                worksheet.getCell('A5').value = `DATE: ${nepaliDate} (${formattedDate})`;
                worksheet.getCell('E5').value = rrpDetails.supplier_name;
                const invoiceDate = ExcelService.formatDate(rrpDetails.invoice_date);
                worksheet.getCell('C25').value = `${rrpDetails.invoice_number || ''}(${invoiceDate})`;
                const requestDetails = items
                    .filter(item => item.request_number && item.request_date)
                    .map(item => ({
                    number: item.request_number,
                    date: item.request_date
                }))
                    .filter((item, index, self) => index === self.findIndex(t => t.number === item.number));
                requestDetails.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                if (requestDetails.length > 0) {
                    const requestNumbers = requestDetails.map(r => r.number).join(',');
                    const earliestDate = ExcelService.formatDate(requestDetails[0].date);
                    const lastDate = ExcelService.formatDate(requestDetails[requestDetails.length - 1].date);
                    const dateRange = earliestDate === lastDate ? earliestDate : `${earliestDate} - ${lastDate}`;
                    worksheet.getCell('I24').value = `${requestNumbers} (${dateRange})`;
                }
                else {
                    worksheet.getCell('I24').value = '';
                }
                worksheet.getCell('A28').value = `${createdByUser.first_name} ${createdByUser.last_name}`;
                worksheet.getCell('A29').value = createdByUser.designation;
                worksheet.getCell('C28').value = inspectionName;
                worksheet.getCell('C29').value = inspectionDesignation;
                worksheet.getCell('E28').value = authorityDetails.level_1_authority_name;
                worksheet.getCell('E29').value = authorityDetails.level_1_authority_designation;
                worksheet.getCell('I28').value = authorityDetails.quality_check_authority_name;
                worksheet.getCell('I29').value = authorityDetails.quality_check_authority_designation;
                let currentRow = 7;
                let sn = 1;
                for (const item of items) {
                    const itemPrice = Number(item.item_price || 0);
                    const freightCharge = Number(item.freight_charge || 0);
                    const vatPercentage = Number(item.vat_percentage || 0);
                    const totalAmount = Number(item.total_amount || 0);
                    const vat_amount = Number(((itemPrice + Number(item.freight_charge)) * (vatPercentage / 100)).toFixed(2));
                    worksheet.getCell(`A${currentRow}`).value = sn++;
                    worksheet.getCell(`B${currentRow}`).value = item.item_name || '';
                    worksheet.getCell(`C${currentRow}`).value = item.part_number || '';
                    worksheet.getCell(`D${currentRow}`).value = item.nac_code || '';
                    worksheet.getCell(`E${currentRow}`).value = item.received_quantity || 0;
                    worksheet.getCell(`F${currentRow}`).value = item.unit || '';
                    worksheet.getCell(`G${currentRow}`).value = Number((itemPrice + freightCharge).toFixed(2));
                    worksheet.getCell(`H${currentRow}`).value = vat_amount;
                    worksheet.getCell(`I${currentRow}`).value = Number(totalAmount.toFixed(2));
                    worksheet.getCell(`J${currentRow}`).value = normalizeEquipmentNumbers(item.equipment_number || '');
                    currentRow++;
                    freightChargeTotal += freightCharge;
                }
            }
            else {
                const formattedDate = ExcelService.formatDate(rrpDetails.date);
                const nepaliDate = adToBs(formattedDate);
                const rrpNumberWithoutPrefix = rrpDetails.rrp_number.substring(1).split('T')[0].padStart(3, '0');
                worksheet.getCell('L4').value = `RRFP: ${rrpNumberWithoutPrefix}`;
                worksheet.getCell('L3').value = `FY: ${rrpDetails.current_fy}`;
                worksheet.getCell('A5').value = `DATE: ${nepaliDate} (${formattedDate})`;
                worksheet.getCell('G5').value = rrpDetails.supplier_name;
                worksheet.getCell('C24').value = rrpDetails.customs_number || '';
                worksheet.getCell('C25').value = ExcelService.formatDate(rrpDetails.customs_date);
                worksheet.getCell('C26').value = rrpDetails.po_number || '';
                worksheet.getCell('C27').value = rrpDetails.airway_bill_number || '';
                worksheet.getCell('G25').value = rrpDetails.currency;
                worksheet.getCell('H26').value = rrpDetails.forex_rate;
                worksheet.getCell('J26').value = rrpDetails.invoice_number;
                worksheet.getCell('K26').value = ExcelService.formatDate(rrpDetails.invoice_date);
                worksheet.getCell('G6').value = `Item Total (In ${rrpDetails.currency})`;
                worksheet.getCell('H6').value = `Freight (In ${rrpDetails.currency})`;
                let currentRow = 7;
                let sn = 1;
                for (const item of items) {
                    const itemPrice = Number(item.item_price || 0);
                    const customsCharge = (Number(item.customs_charge) + Number(item.customs_service_charge) || 0);
                    const itemPlusFreight = Number(((Number(itemPrice) * Number(rrpDetails.forex_rate) || 1) + Number(item.freight_charge)).toFixed(2));
                    const finalTotal = Number((itemPlusFreight + customsCharge).toFixed(2));
                    const freightCharge = Number(item.freight_charge || 0) / Number(rrpDetails.forex_rate || 1);
                    worksheet.getCell(`A${currentRow}`).value = sn++;
                    worksheet.getCell(`B${currentRow}`).value = item.item_name || '';
                    worksheet.getCell(`C${currentRow}`).value = item.part_number || '';
                    worksheet.getCell(`D${currentRow}`).value = item.nac_code || '';
                    worksheet.getCell(`E${currentRow}`).value = item.unit || '';
                    worksheet.getCell(`F${currentRow}`).value = item.received_quantity || 0;
                    worksheet.getCell(`G${currentRow}`).value = Number(itemPrice.toFixed(2));
                    worksheet.getCell(`H${currentRow}`).value = freightCharge;
                    worksheet.getCell(`I${currentRow}`).value = itemPlusFreight;
                    worksheet.getCell(`J${currentRow}`).value = Number(customsCharge.toFixed(2));
                    worksheet.getCell(`K${currentRow}`).value = finalTotal;
                    worksheet.getCell(`L${currentRow}`).value = normalizeEquipmentNumbers(item.equipment_number || '');
                    freightChargeTotal += freightCharge;
                    currentRow++;
                }
                worksheet.getCell('A31').value = `${createdByUser.first_name} ${createdByUser.last_name}`;
                worksheet.getCell('A32').value = createdByUser.designation;
                worksheet.getCell('D31').value = inspectionName || '';
                worksheet.getCell('D32').value = inspectionDesignation || '';
                worksheet.getCell('H31').value = authorityDetails.level_1_authority_name;
                worksheet.getCell('H32').value = authorityDetails.level_1_authority_designation;
                worksheet.getCell('K31').value = authorityDetails.quality_check_authority_name;
                worksheet.getCell('K32').value = authorityDetails.quality_check_authority_designation;
            }
            const sheetsToDelete = workbook.worksheets.filter(sheet => sheet.name !== sheetName);
            sheetsToDelete.forEach(sheet => workbook.removeWorksheet(sheet.id));
            worksheet.getCell('C24').value = freightChargeTotal < 1 ? 'NA' : freightChargeTotal;
            logEvents(`Successfully generated RRP Excel for: ${rrpNumber}`, "excelServiceLog.log");
            return await workbook.xlsx.writeBuffer();
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            logEvents(`Error generating RRP Excel for ${rrpNumber}: ${errorMessage}`, "excelServiceLog.log");
            throw new Error(`Failed to generate RRP Excel: ${errorMessage}`);
        }
    }
    private static async addStockCardSheet(workbook: ExcelJS.Workbook, stock: StockCardData, templatePath: string, templateBinary?: Buffer): Promise<void> {
        const templateWorkbook = new ExcelJS.Workbook();
        if (templateBinary) {
            await templateWorkbook.xlsx.load(templateBinary as unknown as ExcelJS.Buffer);
        }
        else {
            await templateWorkbook.xlsx.readFile(templatePath);
        }
        const templateSheet = templateWorkbook.getWorksheet('Stock Card Template');
        if (!templateSheet) {
            logEvents('Template worksheet not found', "excelServiceLog.log");
            throw new Error('Template worksheet not found');
        }
        templateSheet.name = `Bin Card ${stock.nac_code}`;
        templateSheet.getCell('A5').value = `NAC Code: ${stock.nac_code}`;
        templateSheet.getCell('A7').value = `Nomenclature: ${stock.item_name}`;
        templateSheet.getCell('A8').value = `PartNo: ${(stock as any).primary_part_number}`;
        templateSheet.getCell('A9').value = `Alternate P/N: ${(stock as any).secondary_part_numbers.join(', ')}`;
        templateSheet.getCell('A10').value = `Applicable Fleet: ${stock.equipment_number}`;
        templateSheet.getCell('J4').value = stock.card_number;
        templateSheet.getCell('J5').value = new Date().toISOString().split('T')[0].replace(/-/g, '/');
        templateSheet.getCell('J6').value = stock.location;
        const referenceRow = templateSheet.getRow(20);
        referenceRow.getCell('A').value = (stock as any).openingBalanceDate.toISOString().split('T')[0].replace(/-/g, '/');
        referenceRow.getCell('B').value = 'B.F.';
        referenceRow.getCell('C').value = stock.open_quantity;
        referenceRow.getCell('H').value = stock.open_quantity;
        let rowIndex = 20;
        let runningBalance = typeof stock.open_quantity === 'string'
            ? parseFloat(stock.open_quantity) || 0
            : (stock.open_quantity || 0);
        let deferredIssues: {
            quantity: number;
            reference: string;
            equipment: string;
        }[] = [];
        const movements = (stock as any).movements.map((movement: any) => {
            movement.quantity = parseFloat(movement.quantity) || 0;
            movement.amount = parseFloat(movement.amount) || 0;
            let referenceStr: string = movement.reference != null ? String(movement.reference) : '';
            if (movement.type === 'receive') {
                referenceStr = referenceStr.indexOf('T') !== -1 ? referenceStr.split('T')[0] : referenceStr;
            }
            else if (movement.type === 'issue') {
                referenceStr = referenceStr.indexOf('Y') !== -1 ? referenceStr.split('Y')[0] : referenceStr;
            }
            if (movement.type === 'issue' && movement.equipment_number) {
                movement.issued_for = movement.equipment_number;
            }
            movement.referenceStr = referenceStr;
            return movement;
        });
        for (const movement of movements) {
            rowIndex++;
            templateSheet.insertRow(rowIndex, []);
            const refRow = templateSheet.getRow(20);
            const newRow = templateSheet.getRow(rowIndex);
            newRow.height = refRow.height || 15;
            newRow.hidden = refRow.hidden || false;
            newRow.outlineLevel = refRow.outlineLevel || 0;
            refRow.eachCell((cell, colNumber) => {
                const newCell = newRow.getCell(colNumber);
                if (cell.style)
                    newCell.style = cell.style;
                if (cell.font)
                    newCell.font = cell.font;
                if (cell.alignment)
                    newCell.alignment = cell.alignment;
                if (cell.border)
                    newCell.border = cell.border;
                if (cell.fill)
                    newCell.fill = cell.fill;
                if (cell.numFmt)
                    newCell.numFmt = cell.numFmt;
                if (cell.protection)
                    newCell.protection = cell.protection;
            });
            if (movement.type === 'receive') {
                newRow.getCell('A').value = movement.date.toISOString().split('T')[0].replace(/-/g, '/');
                newRow.getCell('B').value = movement.referenceStr;
                newRow.getCell('C').value = movement.quantity;
                newRow.getCell('D').value = movement.amount;
                runningBalance += movement.quantity;
                newRow.getCell('H').value = runningBalance;
                if (deferredIssues.length > 0) {
                    let remainingBalance = runningBalance;
                    const issuesToProcess = [...deferredIssues];
                    deferredIssues = [];
                    for (const deferred of issuesToProcess) {
                        if (remainingBalance >= deferred.quantity) {
                            rowIndex++;
                            templateSheet.insertRow(rowIndex, []);
                            const deferredRow = templateSheet.getRow(rowIndex);
                            deferredRow.height = refRow.height || 15;
                            deferredRow.hidden = refRow.hidden || false;
                            deferredRow.outlineLevel = refRow.outlineLevel || 0;
                            refRow.eachCell((cell, colNumber) => {
                                const newCell = deferredRow.getCell(colNumber);
                                if (cell.style)
                                    newCell.style = cell.style;
                                if (cell.font)
                                    newCell.font = cell.font;
                                if (cell.alignment)
                                    newCell.alignment = cell.alignment;
                                if (cell.border)
                                    newCell.border = cell.border;
                                if (cell.fill)
                                    newCell.fill = cell.fill;
                                if (cell.numFmt)
                                    newCell.numFmt = cell.numFmt;
                                if (cell.protection)
                                    newCell.protection = cell.protection;
                            });
                            deferredRow.getCell('E').value = movement.date.toISOString().split('T')[0].replace(/-/g, '/');
                            deferredRow.getCell('F').value = 'Deferred Issue';
                            deferredRow.getCell('G').value = deferred.quantity;
                            deferredRow.getCell('J').value = deferred.equipment;
                            remainingBalance -= deferred.quantity;
                            runningBalance = remainingBalance;
                            deferredRow.getCell('H').value = runningBalance;
                        }
                        else if (remainingBalance > 0) {
                            rowIndex++;
                            templateSheet.insertRow(rowIndex, []);
                            const deferredRow = templateSheet.getRow(rowIndex);
                            deferredRow.height = refRow.height || 15;
                            deferredRow.hidden = refRow.hidden || false;
                            deferredRow.outlineLevel = refRow.outlineLevel || 0;
                            refRow.eachCell((cell, colNumber) => {
                                const newCell = deferredRow.getCell(colNumber);
                                if (cell.style)
                                    newCell.style = cell.style;
                                if (cell.font)
                                    newCell.font = cell.font;
                                if (cell.alignment)
                                    newCell.alignment = cell.alignment;
                                if (cell.border)
                                    newCell.border = cell.border;
                                if (cell.fill)
                                    newCell.fill = cell.fill;
                                if (cell.numFmt)
                                    newCell.numFmt = cell.numFmt;
                                if (cell.protection)
                                    newCell.protection = cell.protection;
                            });
                            deferredRow.getCell('E').value = movement.date.toISOString().split('T')[0].replace(/-/g, '/');
                            deferredRow.getCell('F').value = 'Deferred Issue';
                            deferredRow.getCell('G').value = remainingBalance;
                            deferredRow.getCell('J').value = deferred.equipment;
                            runningBalance = 0;
                            deferredRow.getCell('H').value = runningBalance;
                            deferredIssues.push({
                                quantity: deferred.quantity - remainingBalance,
                                reference: deferred.reference,
                                equipment: deferred.equipment
                            });
                            break;
                        }
                        else {
                            deferredIssues.push(deferred);
                        }
                    }
                }
            }
            else {
                if (runningBalance >= movement.quantity) {
                    newRow.getCell('E').value = movement.date.toISOString().split('T')[0].replace(/-/g, '/');
                    newRow.getCell('F').value = movement.referenceStr;
                    newRow.getCell('G').value = movement.quantity;
                    newRow.getCell('J').value = movement.issued_for || '';
                    runningBalance -= movement.quantity;
                    newRow.getCell('H').value = runningBalance;
                }
                else if (runningBalance > 0) {
                    newRow.getCell('E').value = movement.date.toISOString().split('T')[0].replace(/-/g, '/');
                    newRow.getCell('F').value = movement.reference;
                    newRow.getCell('G').value = runningBalance;
                    newRow.getCell('J').value = movement.issued_for || '';
                    runningBalance = 0;
                    newRow.getCell('H').value = runningBalance;
                    deferredIssues.push({
                        quantity: movement.quantity - runningBalance,
                        reference: movement.reference,
                        equipment: movement.issued_for || ''
                    });
                }
                else {
                    deferredIssues.push({
                        quantity: movement.quantity,
                        reference: movement.reference,
                        equipment: movement.issued_for || ''
                    });
                }
            }
            ['D', 'E', 'F', 'G', 'I', 'J', 'K'].forEach(col => {
                const refCell = refRow.getCell(col);
                const newCell = newRow.getCell(col);
                if (refCell.style)
                    newCell.style = refCell.style;
                if (refCell.font)
                    newCell.font = refCell.font;
                if (refCell.alignment)
                    newCell.alignment = refCell.alignment;
                if (refCell.border)
                    newCell.border = refCell.border;
                if (refCell.fill)
                    newCell.fill = refCell.fill;
                if (refCell.numFmt)
                    newCell.numFmt = refCell.numFmt;
                if (refCell.protection)
                    newCell.protection = refCell.protection;
            });
        }
        templateSheet.pageSetup.printArea = `A1:K${rowIndex}`;
        templateSheet.pageSetup.printTitlesRow = '16:18';
        const newSheet = workbook.addWorksheet(templateSheet.name);
        templateSheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
            const newRow = newSheet.getRow(rowNumber);
            newRow.height = row.height;
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                const newCell = newRow.getCell(colNumber);
                newCell.value = cell.value;
                if (cell.style)
                    newCell.style = cell.style;
                if (cell.font)
                    newCell.font = cell.font;
                if (cell.alignment)
                    newCell.alignment = cell.alignment;
                if (cell.border)
                    newCell.border = cell.border;
                if (cell.fill)
                    newCell.fill = cell.fill;
                if (cell.numFmt)
                    newCell.numFmt = cell.numFmt;
                if (cell.protection)
                    newCell.protection = cell.protection;
            });
        });
        templateSheet.columns.forEach((col, idx) => {
            if (col) {
                const targetCol = newSheet.getColumn(idx + 1);
                targetCol.width = col.width;
            }
        });
        const mergeCells = templateSheet.mergeCells;
        if (mergeCells) {
            const mergeRanges = mergeCells.toString().split(',');
            mergeRanges.forEach(range => {
                if (range) {
                    newSheet.mergeCells(range.trim());
                }
            });
        }
        if (templateSheet.autoFilter) {
            newSheet.autoFilter = templateSheet.autoFilter;
        }
        newSheet.pageSetup = { ...templateSheet.pageSetup };
        if (templateSheet.model && templateSheet.model.merges) {
            templateSheet.model.merges.forEach(range => {
                newSheet.mergeCells(range);
            });
        }
    }
    public static async appendStockCardSheets(workbook: ExcelJS.Workbook, stockData: StockCardData[], templatePath: string, templateBinary?: Buffer): Promise<void> {
        for (const stock of stockData) {
            await ExcelService.addStockCardSheet(workbook, stock, templatePath, templateBinary);
        }
    }
    public static async generateStockCardExcel(stockData: StockCardData[], templatePath: string): Promise<ExcelJS.Buffer> {
        try {
            if (!stockData || stockData.length === 0) {
                logEvents('No stock data provided for Excel generation', "excelServiceLog.log");
                throw new Error('No stock data provided for Excel generation');
            }
            logEvents(`Generating stock card Excel for ${stockData.length} items`, "excelServiceLog.log");
            const outputWorkbook = new ExcelJS.Workbook();
            await ExcelService.appendStockCardSheets(outputWorkbook, stockData, templatePath);
            logEvents(`Successfully generated stock card Excel`, "excelServiceLog.log");
            return await outputWorkbook.xlsx.writeBuffer();
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            logEvents(`Error generating stock card Excel: ${errorMessage}`, "excelServiceLog.log");
            throw new Error(`Failed to generate stock card Excel: ${errorMessage}`);
        }
    }
    private static applyRowFormatting(sheet: ExcelJS.Worksheet, rowIndex: number, columns: string[], font: Partial<ExcelJS.Font>, alignment: Partial<ExcelJS.Alignment>): void {
        columns.forEach(col => {
            const cell = sheet.getCell(`${col}${rowIndex}`);
            cell.font = font;
            cell.alignment = alignment;
        });
    }
}
export const generateRequestExcel = ExcelService.generateRequestExcel.bind(ExcelService);
export const generateRequestPdf = ExcelService.generateRequestPdf.bind(ExcelService);
export const generateRRPExcel = ExcelService.generateRRPExcel.bind(ExcelService);
