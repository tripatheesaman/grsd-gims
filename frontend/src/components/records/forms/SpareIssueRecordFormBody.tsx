'use client';

import {
    APPROVAL_STATUS_OPTIONS,
    RecordFormField,
    RecordFormSection,
    RecordSelectInput,
    RecordTextInput,
} from '@/components/records';

export interface SpareIssueFormData {
    issue_slip_number: string;
    issue_date: string;
    nac_code: string;
    part_number: string;
    issue_quantity: number;
    issue_cost: number;
    remaining_balance: number;
    issued_for: string;
    issued_by: {
        name: string;
        staffId: string;
    };
    approval_status: string;
}

interface SpareIssueRecordFormBodyProps {
    formData: SpareIssueFormData;
    setFormData: (data: SpareIssueFormData) => void;
    errors?: Record<string, string>;
    remainingBalanceReadOnly?: boolean;
}

export function SpareIssueRecordFormBody({
    formData,
    setFormData,
    errors = {},
    remainingBalanceReadOnly = true,
}: SpareIssueRecordFormBodyProps) {
    const patch = (partial: Partial<SpareIssueFormData>) => setFormData({ ...formData, ...partial });

    return (
        <div className="space-y-5">
            <RecordFormSection title="Issue slip">
                <RecordFormField label="Issue slip number" required error={errors.issue_slip_number}>
                    <RecordTextInput
                        value={formData.issue_slip_number}
                        onChange={(v) => patch({ issue_slip_number: v })}
                        error={!!errors.issue_slip_number}
                    />
                </RecordFormField>
                <RecordFormField label="Issue date" required error={errors.issue_date}>
                    <RecordTextInput
                        type="date"
                        value={formData.issue_date}
                        onChange={(v) => patch({ issue_date: v })}
                        error={!!errors.issue_date}
                    />
                </RecordFormField>
                <RecordFormField label="Approval status" error={errors.approval_status}>
                    <RecordSelectInput
                        value={formData.approval_status}
                        onChange={(v) => patch({ approval_status: v })}
                        options={APPROVAL_STATUS_OPTIONS}
                    />
                </RecordFormField>
            </RecordFormSection>

            <RecordFormSection title="Item & quantity">
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
                <RecordFormField label="Issue quantity" required error={errors.issue_quantity}>
                    <RecordTextInput
                        type="number"
                        min={0}
                        value={formData.issue_quantity}
                        onChange={(v) => patch({ issue_quantity: Number(v) || 0 })}
                        error={!!errors.issue_quantity}
                    />
                </RecordFormField>
                <RecordFormField label="Issue cost" error={errors.issue_cost}>
                    <RecordTextInput
                        type="number"
                        min={0}
                        value={formData.issue_cost}
                        onChange={(v) => patch({ issue_cost: Number(v) || 0 })}
                        error={!!errors.issue_cost}
                    />
                </RecordFormField>
                <RecordFormField label="Remaining balance" error={errors.remaining_balance}>
                    <RecordTextInput
                        type="number"
                        value={formData.remaining_balance}
                        onChange={(v) => patch({ remaining_balance: Number(v) || 0 })}
                        disabled={remainingBalanceReadOnly}
                    />
                </RecordFormField>
                <RecordFormField label="Issued for (equipment)" required error={errors.issued_for}>
                    <RecordTextInput
                        value={formData.issued_for}
                        onChange={(v) => patch({ issued_for: v })}
                        error={!!errors.issued_for}
                    />
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
                    />
                </RecordFormField>
                <RecordFormField label="Staff ID" required error={errors['issued_by.staffId']}>
                    <RecordTextInput
                        value={formData.issued_by.staffId}
                        onChange={(v) =>
                            patch({ issued_by: { ...formData.issued_by, staffId: v } })
                        }
                        error={!!errors['issued_by.staffId']}
                    />
                </RecordFormField>
            </RecordFormSection>
        </div>
    );
}
