'use client';

import {
    APPROVAL_STATUS_OPTIONS,
    RecordFormField,
    RecordFormSection,
    RecordImageField,
    RecordSelectInput,
    RecordTextArea,
    RecordTextInput,
} from '@/components/records';

export interface RequestFormData {
    request_number: string;
    nac_code: string;
    request_date: string;
    part_number: string;
    item_name: string;
    unit: string;
    requested_quantity: number;
    current_balance: number;
    previous_rate: string;
    equipment_number: string;
    image_path: string;
    specifications: string;
    remarks: string;
    requested_by: string;
    approval_status: string;
    reference_doc: string;
}

interface RequestRecordFormBodyProps {
    formData: RequestFormData;
    setFormData: (data: RequestFormData) => void;
    errors: Record<string, string>;
    imagePreview: string | null;
    onImageSelect: (file: File | null) => void;
    onImageClear: () => void;
}

export function RequestRecordFormBody({
    formData,
    setFormData,
    errors,
    imagePreview,
    onImageSelect,
    onImageClear,
}: RequestRecordFormBodyProps) {
    const patch = (partial: Partial<RequestFormData>) =>
        setFormData({ ...formData, ...partial });

    return (
        <div className="space-y-5">
            <RecordFormSection title="Request details">
                <RecordFormField label="Request number" required error={errors.request_number}>
                    <RecordTextInput
                        value={formData.request_number ?? ''}
                        onChange={(v) => patch({ request_number: v })}
                        error={!!errors.request_number}
                    />
                </RecordFormField>
                <RecordFormField label="Request date" required error={errors.request_date}>
                    <RecordTextInput
                        type="date"
                        value={formData.request_date ?? ''}
                        onChange={(v) => patch({ request_date: v })}
                        error={!!errors.request_date}
                    />
                </RecordFormField>
                <RecordFormField label="Requested by" required error={errors.requested_by}>
                    <RecordTextInput
                        value={formData.requested_by ?? ''}
                        onChange={(v) => patch({ requested_by: v })}
                        error={!!errors.requested_by}
                    />
                </RecordFormField>
                <RecordFormField label="Approval status" error={errors.approval_status}>
                    <RecordSelectInput
                        value={formData.approval_status || 'PENDING'}
                        onChange={(v) => patch({ approval_status: v })}
                        options={APPROVAL_STATUS_OPTIONS}
                    />
                </RecordFormField>
                <RecordFormField label="Reference document" className="md:col-span-2">
                    <RecordTextInput
                        value={formData.reference_doc ?? ''}
                        onChange={(v) => patch({ reference_doc: v })}
                        placeholder="Reference doc path or ID"
                    />
                </RecordFormField>
            </RecordFormSection>

            <RecordFormSection title="Item & inventory">
                <RecordFormField label="NAC code" required error={errors.nac_code}>
                    <RecordTextInput
                        value={formData.nac_code ?? ''}
                        onChange={(v) => patch({ nac_code: v })}
                        error={!!errors.nac_code}
                    />
                </RecordFormField>
                <RecordFormField label="Part number" error={errors.part_number}>
                    <RecordTextInput
                        value={formData.part_number ?? ''}
                        onChange={(v) => patch({ part_number: v })}
                        error={!!errors.part_number}
                        placeholder="Letters/numbers, or N/A"
                    />
                </RecordFormField>
                <RecordFormField label="Item name" required error={errors.item_name}>
                    <RecordTextInput
                        value={formData.item_name ?? ''}
                        onChange={(v) => patch({ item_name: v })}
                        error={!!errors.item_name}
                    />
                </RecordFormField>
                <RecordFormField label="Unit" required error={errors.unit}>
                    <RecordTextInput
                        value={formData.unit ?? ''}
                        onChange={(v) => patch({ unit: v })}
                        error={!!errors.unit}
                    />
                </RecordFormField>
                <RecordFormField label="Requested quantity" required error={errors.requested_quantity}>
                    <RecordTextInput
                        type="number"
                        min={1}
                        value={formData.requested_quantity ?? 0}
                        onChange={(v) => patch({ requested_quantity: Number(v) || 0 })}
                        error={!!errors.requested_quantity}
                    />
                </RecordFormField>
                <RecordFormField label="Equipment number" required error={errors.equipment_number}>
                    <RecordTextInput
                        value={formData.equipment_number ?? ''}
                        onChange={(v) => patch({ equipment_number: v })}
                        error={!!errors.equipment_number}
                    />
                </RecordFormField>
                <RecordFormField label="Current balance">
                    <RecordTextInput
                        type="number"
                        value={formData.current_balance ?? 0}
                        onChange={(v) => patch({ current_balance: Number(v) || 0 })}
                    />
                </RecordFormField>
                <RecordFormField label="Previous rate">
                    <RecordTextInput
                        value={formData.previous_rate ?? ''}
                        onChange={(v) => patch({ previous_rate: v })}
                        placeholder="e.g. NPR 1,250.00"
                    />
                </RecordFormField>
            </RecordFormSection>

            <RecordFormSection title="Notes & media">
                <RecordFormField label="Specifications" className="md:col-span-2">
                    <RecordTextArea
                        value={formData.specifications ?? ''}
                        onChange={(v) => patch({ specifications: v })}
                        placeholder="Technical specifications"
                    />
                </RecordFormField>
                <RecordFormField label="Remarks" className="md:col-span-2">
                    <RecordTextArea
                        value={formData.remarks ?? ''}
                        onChange={(v) => patch({ remarks: v })}
                        placeholder="Additional remarks"
                    />
                </RecordFormField>
                <RecordImageField
                    previewUrl={imagePreview}
                    currentPath={formData.image_path}
                    onSelect={onImageSelect}
                    onClear={onImageClear}
                />
            </RecordFormSection>
        </div>
    );
}
