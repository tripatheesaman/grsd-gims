'use client';

import { useCallback, useState } from 'react';
import {
    InventoryFilterPanel,
    type InventoryFilterValues,
} from '@/components/inventory/InventoryFilterPanel';

const emptyValues: InventoryFilterValues = {
    universal: '',
    equipment: '',
    part: '',
};

type ControlledSearchControlsProps = {
    values: InventoryFilterValues;
    onChange: (field: keyof InventoryFilterValues, value: string) => void;
    onClear: () => void;
    onUniversalSearch?: never;
    onEquipmentSearch?: never;
    onPartSearch?: never;
};

type LegacySearchControlsProps = {
    onUniversalSearch: (value: string) => void;
    onEquipmentSearch: (value: string) => void;
    onPartSearch: (value: string) => void;
    values?: never;
    onChange?: never;
    onClear?: never;
};

export type SearchControlsProps = ControlledSearchControlsProps | LegacySearchControlsProps;

function isLegacyProps(props: SearchControlsProps): props is LegacySearchControlsProps {
    return typeof (props as LegacySearchControlsProps).onUniversalSearch === 'function';
}

export const SearchControls = (props: SearchControlsProps) => {
    const [localValues, setLocalValues] = useState<InventoryFilterValues>(emptyValues);

    const legacyOnChange = useCallback(
        (field: keyof InventoryFilterValues, value: string) => {
            setLocalValues((prev) => ({ ...prev, [field]: value }));
            if (!isLegacyProps(props)) return;
            if (field === 'universal') {
                props.onUniversalSearch(value);
            } else if (field === 'equipment') {
                props.onEquipmentSearch(value);
            } else {
                props.onPartSearch(value);
            }
        },
        [props]
    );

    const legacyOnClear = useCallback(() => {
        setLocalValues(emptyValues);
        if (!isLegacyProps(props)) return;
        props.onUniversalSearch('');
        props.onEquipmentSearch('');
        props.onPartSearch('');
    }, [props]);

    if (isLegacyProps(props)) {
        return (
            <InventoryFilterPanel
                values={localValues}
                onChange={legacyOnChange}
                onClear={legacyOnClear}
            />
        );
    }

    return (
        <InventoryFilterPanel
            values={props.values}
            onChange={props.onChange}
            onClear={props.onClear}
        />
    );
};
