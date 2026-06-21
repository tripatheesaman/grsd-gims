/** Loose client-side check: is selected equipment outside the item's applicable list? */
export function isEquipmentOutsideApplicable(
    selectedEquipment: string,
    applicableEquipments: string,
    sectionCodes: string[] = []
): boolean {
    const selected = String(selectedEquipment || '').trim();
    if (!selected) {
        return false;
    }
    const upperSections = new Set(sectionCodes.map((c) => c.toUpperCase()));
    if (upperSections.has(selected.toUpperCase())) {
        return false;
    }
    if (String(applicableEquipments || '').toLowerCase().includes('consumable')) {
        return false;
    }

    const applicableTokens = String(applicableEquipments || '')
        .split(',')
        .flatMap((part) => {
            const trimmed = part.trim();
            if (!trimmed) {
                return [];
            }
            const range = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
            if (range) {
                const start = parseInt(range[1], 10);
                const end = parseInt(range[2], 10);
                const tokens: string[] = [];
                for (let n = start; n <= end; n++) {
                    tokens.push(String(n));
                }
                return tokens;
            }
            return [trimmed];
        })
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);

    const selectedUpper = selected.toUpperCase();
    const selectedBase = selectedUpper.replace(/\s*T.*$/i, '').replace(/\s+/g, '');

    for (const token of applicableTokens) {
        const tokenBase = token.replace(/\s*T.*$/i, '').replace(/\s+/g, '');
        if (
            token === selectedUpper ||
            tokenBase === selectedBase ||
            selectedUpper.includes(token) ||
            token.includes(selectedUpper)
        ) {
            return false;
        }
    }
    return /\d/.test(selected);
}
