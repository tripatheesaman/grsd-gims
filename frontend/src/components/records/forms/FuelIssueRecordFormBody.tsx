'use client';

import {
    APPROVAL_STATUS_OPTIONS,
    RecordFormField,
    RecordFormSection,
    RecordSelectInput,
    RecordTextInput,
} from '@/components/records';

export interface FuelIssueFormData {
    issue_slip_number: string;
    issue_date: string;
    nac_code: string;
    part_number: string;
    issue_quantity: number;
    issued_for: string;
    issued_by: {
        name: string;
        staffId: string;
    };
    fuel_type: string;
    fuel_price: number;
    kilometers: number;
    is_kilometer_reset: boolean;
    approval_status: string;
}

interface FuelIssueRecordFormBodyProps {
    formData: FuelIssueFormData;
    setFormData: (data: FuelIssueFormData) => void;
    errors?: Record<string, string>;
    nacCodes?: string[];
    fuelTypes?: string[];
    itemName?: string;
    isEdit?: boolean;
}

export function FuelIssueRecordFormBody({
    formData,
    setFormData,
    errors = {},
    nacCodes = [],
    fuelTypes = [],
    itemName,
    isEdit,
}: FuelIssueRecordFormBodyProps) {
    const patch = (partial: Partial<FuelIssueFormData>) => setFormData({ ...formData, ...partial });

    const nacOptions = [
        { value: '', label: 'Select NAC code' },
        ...nacCodes.map((code) => ({ value: code, label: code })),
    ];

    const fuelTypeOptions = [
        { value: '', label: 'Select fuel type' },
        ...fuelTypes.map((type) => ({ value: type, label: type })),
    ];

    return (
        <div className="space-y-5">
            {(isEdit && formData.issue_slip_number) || itemName ? (
                <RecordFormSection title="Reference">
                    {isEdit && formData.issue_slip_number && (
                        <RecordFormField label="Issue slip number">
                            <RecordTextInput
                                value={formData.issue_slip_number}
                                onChange={() => {}}
                                disabled
                            />
                        </RecordFormField>
                    )}
                    {itemName && (
                        <RecordFormField label="Item name">
                            <RecordTextInput value={itemName} onChange={() => {}} disabled />
                        </RecordFormField>
                    )}
                </RecordFormSection>
            ) : null}

            <RecordFormSection title="Issue details">
                <RecordFormField label="Issue date" required error={errors.issue_date}>
                    <RecordTextInput
                        type="date"
                        value={formData.issue_date}
                        onChange={(v) => patch({ issue_date: v })}
                        error={!!errors.issue_date}
                    />
                </RecordFormField>
                <RecordFormField label="NAC code" required error={errors.nac_code}>
                    {nacCodes.length > 0 ? (
                        <RecordSelectInput
                            value={formData.nac_code}
                            onChange={(v) => patch({ nac_code: v })}
                            options={nacOptions}
                            error={!!errors.nac_code}
                        />
                    ) : (
                        <RecordTextInput
                            value={formData.nac_code}
                            onChange={(v) => patch({ nac_code: v })}
                            error={!!errors.nac_code}
                        />
                    )}
                </RecordFormField>
                <RecordFormField label="Fuel type" required error={errors.fuel_type}>
                    {fuelTypes.length > 0 ? (
                        <RecordSelectInput
                            value={formData.fuel_type}
                            onChange={(v) => patch({ fuel_type: v })}
                            options={fuelTypeOptions}
                            error={!!errors.fuel_type}
                        />
                    ) : (
                        <RecordTextInput
                            value={formData.fuel_type}
                            onChange={(v) => patch({ fuel_type: v })}
                            error={!!errors.fuel_type}
                        />
                    )}
                </RecordFormField>
                <RecordFormField label="Part number" error={errors.part_number}>
                    <RecordTextInput
                        value={formData.part_number}
                        onChange={(v) => patch({ part_number: v })}
                        error={!!errors.part_number}
                        disabled={isEdit}
                    />
                </RecordFormField>
                <RecordFormField label="Approval status">
                    <RecordSelectInput
                        value={formData.approval_status}
                        onChange={(v) => patch({ approval_status: v })}
                        options={APPROVAL_STATUS_OPTIONS}
                        disabled={isEdit}
                    />
                </RecordFormField>
            </RecordFormSection>

            <RecordFormSection title="Fuel & equipment">
                <RecordFormField label="Quantity (liters)" required error={errors.issue_quantity}>
                    <RecordTextInput
                        type="number"
                        min={0}
                        value={formData.issue_quantity}
                        onChange={(v) => patch({ issue_quantity: Number(v) || 0 })}
                        error={!!errors.issue_quantity}
                    />
                </RecordFormField>
                <RecordFormField label="Fuel price" required error={errors.fuel_price}>
                    <RecordTextInput
                        type="number"
                        min={0}
                        value={formData.fuel_price}
                        onChange={(v) => patch({ fuel_price: Number(v) || 0 })}
                        error={!!errors.fuel_price}
                    />
                </RecordFormField>
                <RecordFormField label="Kilometers" required error={errors.kilometers}>
                    <RecordTextInput
                        type="number"
                        min={0}
                        value={formData.kilometers}
                        onChange={(v) => patch({ kilometers: Number(v) || 0 })}
                        error={!!errors.kilometers}
                    />
                </RecordFormField>
                <RecordFormField label="Issued for (equipment)" required error={errors.issued_for}>
                    <RecordTextInput
                        value={formData.issued_for}
                        onChange={(v) => patch({ issued_for: v })}
                        error={!!errors.issued_for}
                    />
                </RecordFormField>
                <RecordFormField label="Kilometer reset" className="flex items-end">
                    <label className="flex cursor-pointer items-center gap-2 pb-2.5">
                        <input
                            type="checkbox"
                            checked={formData.is_kilometer_reset}
                            onChange={(e) => patch({ is_kilometer_reset: e.target.checked })}
                            className="h-4 w-4 rounded border-slate-300 text-[#003594] focus:ring-[#003594]"
                        />
                        <span className="text-sm text-slate-700">Reset odometer reading</span>
                    </label>
                </RecordFormField>
            </RecordFormSection>

            <RecordFormSection title="Issued by">
                <RecordFormField label="Name" required error={errors['issued_by.name']}>
                    <RecordTextInput
                        value={formData.issued_by.name}
                        onChange={(v) =>
                            patch({ issued_by: { ...formData.issued_by, name: v } })
                        }
                        error={!!errors['issued_by.name']}
                        disabled={isEdit}
                    />
                </RecordFormField>
                <RecordFormField label="Staff ID" required error={errors['issued_by.staffId']}>
                    <RecordTextInput
                        value={formData.issued_by.staffId}
                        onChange={(v) =>
                            patch({ issued_by: { ...formData.issued_by, staffId: v } })
                        }
                        error={!!errors['issued_by.staffId']}
                        disabled={isEdit}
                    />
                </RecordFormField>
            </RecordFormSection>
        </div>
    );
}
