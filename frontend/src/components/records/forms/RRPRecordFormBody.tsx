'use client';

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
    APPROVAL_STATUS_OPTIONS,
    RecordFormField,
    RecordFormSection,
    RecordSelectInput,
    RecordTextArea,
    RecordTextInput,
    recordsTheme,
} from '@/components/records';
import { cn } from '@/utils/utils';

export interface RRPFormData {
    receive_fk?: number;
    rrp_number: string;
    supplier_name: string;
    date: string;
    currency: string;
    forex_rate: number;
    item_price: number;
    customs_charge: number;
    customs_date: string;
    customs_number: string;
    freight_charge: number;
    customs_service_charge: number;
    vat_percentage: number;
    invoice_number: string;
    invoice_date: string;
    po_number: string;
    total_amount: number;
    airway_bill_number: string;
    inspection_details: string;
    reference_doc: string;
    approval_status: string;
    created_by: string;
}

interface RRPRecordFormBodyProps {
    formData: RRPFormData;
    setFormData: Dispatch<SetStateAction<RRPFormData>>;
    errors: Record<string, string>;
    suppliers: { local: string[]; foreign: string[] };
    onValidateDates?: (rrpDate: string, invoiceDate: string) => void;
    initialSupplierName?: string;
}

const CURRENCY_OPTIONS = [
    { value: 'NPR', label: 'NPR' },
    { value: 'USD', label: 'USD' },
    { value: 'EUR', label: 'EUR' },
];

function getRRPType(rrpNumber: string): 'local' | 'foreign' {
    const firstChar = rrpNumber.charAt(0).toUpperCase();
    return firstChar === 'L' ? 'local' : 'foreign';
}

export function RRPRecordFormBody({
    formData,
    setFormData,
    errors,
    suppliers,
    onValidateDates,
    initialSupplierName,
}: RRPRecordFormBodyProps) {
    const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
    const [supplierSearchTerm, setSupplierSearchTerm] = useState(initialSupplierName || formData.supplier_name);

    const patch = (partial: Partial<RRPFormData>) => setFormData({ ...formData, ...partial });

    const getAvailableSuppliers = useCallback((): string[] => {
        if (!formData.rrp_number) {
            return [...(suppliers.local || []), ...(suppliers.foreign || [])];
        }
        const rrpType = getRRPType(formData.rrp_number);
        return rrpType === 'local' ? suppliers.local || [] : suppliers.foreign || [];
    }, [formData.rrp_number, suppliers]);

    const filteredSuppliers = getAvailableSuppliers().filter((supplier) =>
        supplier.toLowerCase().includes(supplierSearchTerm.toLowerCase())
    );

    const handleSupplierSelect = (supplier: string) => {
        patch({ supplier_name: supplier });
        setSupplierSearchTerm(supplier);
        setShowSupplierDropdown(false);
    };

    const handleSupplierInputChange = (value: string) => {
        setSupplierSearchTerm(value);
        patch({ supplier_name: value });
        setShowSupplierDropdown(true);
    };

    useEffect(() => {
        if (initialSupplierName) {
            setSupplierSearchTerm(initialSupplierName);
        }
    }, [initialSupplierName]);

    useEffect(() => {
        if (formData.rrp_number && supplierSearchTerm) {
            const availableSuppliers = getAvailableSuppliers();
            if (!availableSuppliers.includes(supplierSearchTerm)) {
                setSupplierSearchTerm('');
                setFormData((prev) => ({ ...prev, supplier_name: '' }));
            }
        }
    }, [formData.rrp_number, supplierSearchTerm, getAvailableSuppliers, setFormData]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (showSupplierDropdown) {
                const target = event.target as Element;
                if (!target.closest('.rrp-supplier-dropdown')) {
                    setShowSupplierDropdown(false);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showSupplierDropdown]);

    return (
        <div className="space-y-5">
            <RecordFormSection title="RRP details">
                <RecordFormField label="RRP number" required error={errors.rrp_number}>
                    <RecordTextInput
                        value={formData.rrp_number}
                        onChange={(v) => patch({ rrp_number: v })}
                        placeholder="Enter RRP number"
                        error={!!errors.rrp_number}
                    />
                </RecordFormField>

                <RecordFormField label="Supplier name" required error={errors.supplier_name} className="relative rrp-supplier-dropdown">
                    <input
                        type="text"
                        value={supplierSearchTerm}
                        onChange={(e) => handleSupplierInputChange(e.target.value)}
                        onFocus={() => setShowSupplierDropdown(true)}
                        placeholder="Search or enter supplier name"
                        className={cn(
                            recordsTheme.input,
                            errors.supplier_name && recordsTheme.inputError
                        )}
                    />
                    {showSupplierDropdown && filteredSuppliers.length > 0 && (
                        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                            {filteredSuppliers.map((supplier, index) => (
                                <div
                                    key={index}
                                    className="cursor-pointer px-3 py-2 text-sm hover:bg-slate-100"
                                    onClick={() => handleSupplierSelect(supplier)}
                                >
                                    {supplier}
                                </div>
                            ))}
                        </div>
                    )}
                </RecordFormField>

                <RecordFormField label="Date" required error={errors.date}>
                    <RecordTextInput
                        type="date"
                        value={formData.date}
                        onChange={(v) => {
                            patch({ date: v });
                            onValidateDates?.(v, formData.invoice_date);
                        }}
                        error={!!errors.date}
                    />
                </RecordFormField>

                <RecordFormField label="Created by" required error={errors.created_by}>
                    <RecordTextInput
                        value={formData.created_by}
                        onChange={(v) => patch({ created_by: v })}
                        error={!!errors.created_by}
                    />
                </RecordFormField>

                <RecordFormField label="Approval status">
                    <RecordSelectInput
                        value={formData.approval_status}
                        onChange={(v) => patch({ approval_status: v })}
                        options={APPROVAL_STATUS_OPTIONS}
                    />
                </RecordFormField>
            </RecordFormSection>

            <RecordFormSection title="Financial details">
                <RecordFormField label="Currency">
                    <RecordSelectInput
                        value={formData.currency}
                        onChange={(v) => patch({ currency: v })}
                        options={CURRENCY_OPTIONS}
                    />
                </RecordFormField>

                <RecordFormField label="Forex rate">
                    <RecordTextInput
                        type="number"
                        value={formData.forex_rate}
                        onChange={(v) => patch({ forex_rate: Number(v) || 1 })}
                    />
                </RecordFormField>

                <RecordFormField label="Item price" required error={errors.item_price}>
                    <RecordTextInput
                        type="number"
                        value={formData.item_price}
                        onChange={(v) => patch({ item_price: Number(v) || 0 })}
                        error={!!errors.item_price}
                    />
                </RecordFormField>

                <RecordFormField label="Total amount">
                    <RecordTextInput
                        type="number"
                        value={formData.total_amount}
                        onChange={(v) => patch({ total_amount: Number(v) || 0 })}
                    />
                </RecordFormField>

                <RecordFormField label="Invoice number" required error={errors.invoice_number}>
                    <RecordTextInput
                        value={formData.invoice_number}
                        onChange={(v) => patch({ invoice_number: v })}
                        error={!!errors.invoice_number}
                    />
                </RecordFormField>

                <RecordFormField label="Invoice date" required error={errors.invoice_date}>
                    <RecordTextInput
                        type="date"
                        value={formData.invoice_date}
                        onChange={(v) => {
                            patch({ invoice_date: v });
                            onValidateDates?.(formData.date, v);
                        }}
                        error={!!errors.invoice_date}
                    />
                </RecordFormField>

                <RecordFormField label="PO number">
                    <RecordTextInput value={formData.po_number} onChange={(v) => patch({ po_number: v })} />
                </RecordFormField>

                <RecordFormField label="Airway bill number">
                    <RecordTextInput
                        value={formData.airway_bill_number}
                        onChange={(v) => patch({ airway_bill_number: v })}
                    />
                </RecordFormField>
            </RecordFormSection>

            <RecordFormSection title="Customs & charges">
                <RecordFormField label="Customs charge">
                    <RecordTextInput
                        type="number"
                        value={formData.customs_charge}
                        onChange={(v) => patch({ customs_charge: Number(v) || 0 })}
                    />
                </RecordFormField>

                <RecordFormField label="Customs date">
                    <RecordTextInput
                        type="date"
                        value={formData.customs_date}
                        onChange={(v) => patch({ customs_date: v })}
                    />
                </RecordFormField>

                <RecordFormField label="Customs number">
                    <RecordTextInput value={formData.customs_number} onChange={(v) => patch({ customs_number: v })} />
                </RecordFormField>

                <RecordFormField label="Freight charge">
                    <RecordTextInput
                        type="number"
                        value={formData.freight_charge}
                        onChange={(v) => patch({ freight_charge: Number(v) || 0 })}
                    />
                </RecordFormField>

                <RecordFormField label="Customs service charge">
                    <RecordTextInput
                        type="number"
                        value={formData.customs_service_charge}
                        onChange={(v) => patch({ customs_service_charge: Number(v) || 0 })}
                    />
                </RecordFormField>

                <RecordFormField label="VAT percentage">
                    <RecordTextInput
                        type="number"
                        value={formData.vat_percentage}
                        onChange={(v) => patch({ vat_percentage: Number(v) || 0 })}
                    />
                </RecordFormField>
            </RecordFormSection>

            <RecordFormSection title="Additional details">
                <RecordFormField label="Inspection details" className="md:col-span-2">
                    <RecordTextArea
                        value={formData.inspection_details}
                        onChange={(v) => patch({ inspection_details: v })}
                        placeholder="Enter inspection details"
                    />
                </RecordFormField>

                <RecordFormField label="Reference document">
                    <RecordTextInput value={formData.reference_doc} onChange={(v) => patch({ reference_doc: v })} />
                </RecordFormField>
            </RecordFormSection>
        </div>
    );
}
