const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function chunkToWords(n: number): string {
    if (n < 20) return ones[n];
    if (n < 100) return `${tens[Math.floor(n / 10)]}${ones[n % 10] ? ` ${ones[n % 10]}` : ''}`.trim();
    return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${chunkToWords(n % 100)}` : ''}`.trim();
}

export function amountToWords(amount: number): string {
    const value = Math.round(Math.abs(Number(amount) || 0) * 100) / 100;
    const whole = Math.floor(value);
    const fraction = Math.round((value - whole) * 100);
    if (whole === 0 && fraction === 0) return 'Zero Rupees Only';
    const parts: string[] = [];
    const scales = [
        { value: 10000000, label: 'Crore' },
        { value: 100000, label: 'Lakh' },
        { value: 1000, label: 'Thousand' },
        { value: 1, label: '' },
    ];
    let remaining = whole;
    for (const scale of scales) {
        if (remaining >= scale.value) {
            const count = Math.floor(remaining / scale.value);
            remaining %= scale.value;
            const words = chunkToWords(count);
            parts.push(scale.label ? `${words} ${scale.label}` : words);
        }
    }
    let result = `${parts.join(' ').trim()} Rupees`;
    if (fraction > 0) {
        result += ` and ${chunkToWords(fraction)} Paisa`;
    }
    return `${result} Only`;
}
