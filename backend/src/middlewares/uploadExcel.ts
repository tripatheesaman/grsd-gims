import multer from 'multer';

const storage = multer.memoryStorage();

export const uploadExcel = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const name = file.originalname?.toLowerCase() ?? '';
        if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
            cb(null, true);
            return;
        }
        cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
});
