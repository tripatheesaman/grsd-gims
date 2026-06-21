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

export interface ReceiveFormData {
    receive_number: string;
    receive_date: string;
    request_fk: number;
    nac_code: string;
    part_number: string;
    item_name: string;
    received_quantity: number;
    requested_quantity: number;
    unit: string;
    approval_status: string;
    received_by: string;
    image_path: string;
    location: string;
    receive_source?: string;
    tender_reference_number?: string;
    rejection_reason?: string;
}

interface ReceiveRecordFormBodyProps {
    formData: ReceiveFormData;
    setFormData: (data: ReceiveFormData) => void;
    errors: Record<string, string>;
    imagePreview: string | null;
    onImageSelect: (file: File | null) => void;
    onImageClear: () => void;
    isEdit?: boolean;
}

const RECEIVE_SOURCE_OPTIONS = [
    { value: 'request', label: 'Request' },
    { value: 'tender', label: 'Tender' },
    { value: 'borrow', label: 'Borrow' },
    { value: 'direct', label: 'Direct' },
];

export function ReceiveRecordFormBody({
    formData,
    setFormData,
    errors,
    imagePreview,
    onImageSelect,
    onImageClear,
    isEdit,
}: ReceiveRecordFormBodyProps) {
    const patch = (partial: Partial<ReceiveFormData>) => setFormData({ ...formData, ...partial });

    return (
        <div className="space-y-5">
            <RecordFormSection title="Receive details">
                {formData.receive_number && (
                    <RecordFormField label="Receive number">
                        <RecordTextInput value={formData.receive_number} onChange={() => {}} disabled />
                    </RecordFormField>
                )}
                <RecordFormField label="Receive date" required error={errors.receive_date}>
                    <RecordTextInput
                        type="date"
                        value={formData.receive_date}
                        onChange={(v) => patch({ receive_date: v })}
                        error={!!errors.receive_date}
                    />
                </RecordFormField>
                <RecordFormField label="Received by" required error={errors.received_by}>
                    <RecordTextInput
                        value={formData.received_by}
                        onChange={(v) => patch({ received_by: v })}
                        error={!!errors.received_by}
                    />
                </RecordFormField>
                <RecordFormField label="Approval status" error={errors.approval_status}>
                    <RecordSelectInput
                        value={formData.approval_status}
                        onChange={(v) => patch({ approval_status: v })}
                        options={APPROVAL_STATUS_OPTIONS}
                    />
                </RecordFormField>
                <RecordFormField label="Request FK" error={errors.request_fk}>
                    <RecordTextInput
                        type="number"
                        value={formData.request_fk}
                        onChange={(v) => patch({ request_fk: Number(v) || 0 })}
                        disabled={isEdit && formData.request_fk > 0}
                    />
                </RecordFormField>
                <RecordFormField label="Location">
                    <RecordTextInput
                        value={formData.location}
                        onChange={(v) => patch({ location: v })}
                        placeholder="Storage location"
                    />
                </RecordFormField>
                {formData.receive_source !== undefined && (
                    <RecordFormField label="Receive source">
                        <RecordSelectInput
                            value={formData.receive_source || 'request'}
                            onChange={(v) => patch({ receive_source: v })}
                            options={RECEIVE_SOURCE_OPTIONS}
                        />
                    </RecordFormField>
                )}
                {formData.tender_reference_number !== undefined && (
                    <RecordFormField label="Tender reference">
                        <RecordTextInput
                            value={formData.tender_reference_number || ''}
                            onChange={(v) => patch({ tender_reference_number: v })}
                        />
                    </RecordFormField>
                )}
            </RecordFormSection>

            <RecordFormSection title="Item details">
                <RecordFormField label="NAC code" required error={errors.nac_code}>
                    <RecordTextInput
                        value={formData.nac_code}
                        onChange={(v) => patch({ nac_code: v })}
                        error={!!errors.nac_code}
                    />
                </RecordFormField>
                <RecordFormField label="Part number" required error={errors.part_number}>
                    <RecordTextInput
                        value={formData.part_number}
                        onChange={(v) => patch({ part_number: v })}
                        error={!!errors.part_number}
                    />
                </RecordFormField>
                <RecordFormField label="Item name" required error={errors.item_name}>
                    <RecordTextInput
                        value={formData.item_name}
                        onChange={(v) => patch({ item_name: v })}
                        error={!!errors.item_name}
                    />
                </RecordFormField>
                <RecordFormField label="Unit" required error={errors.unit}>
                    <RecordTextInput
                        value={formData.unit}
                        onChange={(v) => patch({ unit: v })}
                        error={!!errors.unit}
                    />
                </RecordFormField>
                <RecordFormField label="Received quantity" required error={errors.received_quantity}>
                    <RecordTextInput
                        type="number"
                        min={0}
                        value={formData.received_quantity}
                        onChange={(v) => patch({ received_quantity: Number(v) || 0 })}
                        error={!!errors.received_quantity}
                    />
                </RecordFormField>
                {formData.requested_quantity > 0 && (
                    <RecordFormField label="Requested quantity">
                        <RecordTextInput
                            type="number"
                            value={formData.requested_quantity}
                            onChange={() => {}}
                            disabled
                        />
                    </RecordFormField>
                )}
            </RecordFormSection>

            <RecordFormSection title="Notes & media">
                {formData.rejection_reason !== undefined && formData.approval_status === 'REJECTED' && (
                    <RecordFormField label="Rejection reason" className="md:col-span-2">
                        <RecordTextArea
                            value={formData.rejection_reason || ''}
                            onChange={(v) => patch({ rejection_reason: v })}
                        />
                    </RecordFormField>
                )}
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
