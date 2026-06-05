'use client';

import { cn } from '@/utils/utils';
import {
    buildEquipmentDisplayGroups,
    formatEquipmentCodeRanges,
    formatEquipmentDisplayGroups,
} from '@/utils/formatApplicableEquipments';

interface ApplicableEquipmentsCellProps {
    equipmentNumber?: string | null;
    equipmentDisplay?: string | null;
    className?: string;
    /** Max equipment name groups shown before "+N more". Ignored when showAll is true. */
    maxVisible?: number;
    /** Show every applicable equipment group with no truncation. */
    showAll?: boolean;
    compact?: boolean;
}

export function ApplicableEquipmentsCell({
    equipmentNumber,
    equipmentDisplay,
    className,
    maxVisible = 3,
    showAll = false,
    compact = false,
}: ApplicableEquipmentsCellProps) {
    const groups = buildEquipmentDisplayGroups(equipmentNumber, equipmentDisplay);
    const fullLabel = formatEquipmentDisplayGroups(groups);

    if (!fullLabel) {
        return <span className="text-sm text-slate-400">—</span>;
    }

    const effectiveMaxVisible = showAll ? groups.length : maxVisible;
    const visibleGroups = groups.slice(0, effectiveMaxVisible);
    const hiddenCount = showAll ? 0 : groups.length - visibleGroups.length;
    const visibleLabel = showAll ? fullLabel : formatEquipmentDisplayGroups(visibleGroups);

    if (compact && groups.length === 1) {
        const group = groups[0];
        const ranges = formatEquipmentCodeRanges(group.codes);
        return (
            <div className={cn('min-w-0', className)} title={fullLabel}>
                {group.name ? (
                    <span className="block truncate text-xs text-slate-800">
                        <span className="font-medium text-slate-900">{group.name}</span>
                        <span className="font-mono text-[#003594]"> ({ranges})</span>
                    </span>
                ) : (
                    <span className="font-mono text-xs font-semibold text-[#003594]">{ranges}</span>
                )}
            </div>
        );
    }

    return (
        <div className={cn('min-w-0', className)} title={showAll ? undefined : fullLabel}>
            <p
                className={cn(
                    'leading-relaxed text-slate-700',
                    showAll ? 'whitespace-normal text-sm' : 'line-clamp-2 text-xs'
                )}
            >
                {visibleLabel}
                {hiddenCount > 0 && (
                    <span className="font-medium text-slate-500">{`, +${hiddenCount} more`}</span>
                )}
            </p>
        </div>
    );
}
