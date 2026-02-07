import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const folder = formData.get('folder') as string || 'request';
        const customName = formData.get('customName') as string;
        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }
        const fileExtension = file.name.split('.').pop();
        let filename: string;
        if (customName) {
            filename = `${customName}.${fileExtension}`;
        }
        else {
            filename = `${uuidv4()}.${fileExtension}`;
        }
        const uploadsRoot = process.env.UPLOADS_DIR || path.join(process.cwd(), 'public', 'images');
        const targetDir = path.join(uploadsRoot, folder);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        fs.writeFileSync(path.join(targetDir, filename), buffer);
        return NextResponse.json({
            success: true,
            path: `/images/${folder}/${filename}`
        });
    }
    catch {
        return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }
}
