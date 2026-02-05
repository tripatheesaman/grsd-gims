import fs from 'fs';
import path from 'path';
const ANCHOR_AD = new Date('1944-04-13');
const ANCHOR_BS = { year: 2001, month: 1, day: 1 };
const BS_DATA: Record<number, number[]> = {};
(function loadBSData() {
    const filePath = path.join(__dirname, '../../public/templates/calendar_bs.csv');
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    for (let i = 1; i < lines.length; i++) {
        const [yearStr, ...months] = lines[i].split(',');
        const year = parseInt(yearStr);
        BS_DATA[year] = months.map(m => parseInt(m));
    }
})();
export function adToBs(adStr: string): string {
    const ad = new Date(adStr);
    if (isNaN(ad.getTime()))
        throw new Error("Invalid AD date");
    let bsY = ANCHOR_BS.year, bsM = ANCHOR_BS.month, bsD = ANCHOR_BS.day;
    let currentAD = new Date(ANCHOR_AD);
    while (currentAD < ad) {
        bsD++;
        const daysInMonth = BS_DATA[bsY][bsM - 1];
        if (bsD > daysInMonth) {
            bsD = 1;
            bsM++;
            if (bsM > 12) {
                bsM = 1;
                bsY++;
                if (!BS_DATA[bsY])
                    throw new Error("BS year out of range");
            }
        }
        currentAD.setDate(currentAD.getDate() + 1);
    }
    return `${bsY}-${String(bsM).padStart(2, '0')}-${String(bsD).padStart(2, '0')}`;
}
export function bsToAd(bsStr: string): string {
    let [bsY, bsM, bsD] = bsStr.split('-').map(Number);
    if (!BS_DATA[bsY] || bsM < 1 || bsM > 12 || bsD < 1 || bsD > BS_DATA[bsY][bsM - 1]) {
        throw new Error("Invalid BS date");
    }
    let y = ANCHOR_BS.year, m = ANCHOR_BS.month, d = ANCHOR_BS.day;
    let ad = new Date(ANCHOR_AD);
    while (y < bsY || (y === bsY && m < bsM) || (y === bsY && m === bsM && d < bsD)) {
        d++;
        const daysInMonth = BS_DATA[y][m - 1];
        if (d > daysInMonth) {
            d = 1;
            m++;
            if (m > 12) {
                m = 1;
                y++;
                if (!BS_DATA[y])
                    throw new Error("BS year out of range");
            }
        }
        ad.setDate(ad.getDate() + 1);
    }
    return `${ad.getFullYear()}-${String(ad.getMonth() + 1).padStart(2, '0')}-${String(ad.getDate()).padStart(2, '0')}`;
}
