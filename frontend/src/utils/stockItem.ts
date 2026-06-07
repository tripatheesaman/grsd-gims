/** Stock row is a consumable when applicable_equipments contains "consumable". */
export function isConsumableStock(applicableEquipments: string): boolean {
    return String(applicableEquipments || '').toLowerCase().includes('consumable');
}
