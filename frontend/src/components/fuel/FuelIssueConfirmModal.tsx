'use client';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Fuel, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import type { FuelConsumptionPreviewLine } from '@/types/fuel';
import { cn } from '@/utils/utils';

interface FuelIssueConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    isSubmitting: boolean;
    isLoadingPreview: boolean;
    fuelType: string;
    issueDate: Date;
    price: number;
    lines: FuelConsumptionPreviewLine[];
    records: Array<{
        equipment_number: string;
        kilometers: number | '';
        quantity: number | '';
    }>;
}

export function FuelIssueConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    isSubmitting,
    isLoadingPreview,
    fuelType,
    issueDate,
    price,
    lines,
    records,
}: FuelIssueConfirmModalProps) {
    const hasWarnings = lines.some((line) => line.deviatesFromAverage);
    const warningCount = lines.filter((line) => line.deviatesFromAverage).length;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col bg-white">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
                        Confirm Fuel Issue
                    </DialogTitle>
                    <DialogDescription>
                        Review {fuelType} issue for {format(issueDate, 'PPP')} before submitting for approval.
                    </DialogDescription>
                </DialogHeader>

                {isLoadingPreview ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-[#003594]" />
                    </div>
                ) : (
                    <div className="space-y-4 overflow-y-auto flex-1 min-h-0 py-2">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-[#002a6e]/10 bg-slate-50 p-4 text-sm">
                            <div>
                                <p className="text-xs text-gray-500">Fuel type</p>
                                <p className="font-semibold text-[#003594] capitalize">{fuelType}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Line items</p>
                                <p className="font-semibold text-[#003594]">{records.length}</p>
                            </div>
                            {fuelType.toLowerCase() !== 'diesel' && (
                                <div>
                                    <p className="text-xs text-gray-500">Price / liter</p>
                                    <p className="font-semibold text-[#003594]">NPR {price}</p>
                                </div>
                            )}
                        </div>

                        {hasWarnings && (
                            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold">
                                        {warningCount} line{warningCount !== 1 ? 's' : ''} deviate from average consumption
                                    </p>
                                    <p className="mt-1 text-amber-800">
                                        Kilometers traveled are higher or lower than the historical average for the fuel quantity issued.
                                        Please verify odometer readings and quantities before confirming.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="space-y-3">
                            {records.map((record, index) => {
                                const analysis = lines.find((line) => line.index === index);
                                const km =
                                    record.kilometers === '' ? 0 : Number(record.kilometers);
                                const qty =
                                    record.quantity === '' ? 0 : Number(record.quantity);

                                return (
                                    <div
                                        key={index}
                                        className={cn(
                                            'rounded-xl border p-4',
                                            analysis?.deviatesFromAverage
                                                ? 'border-amber-300 bg-amber-50/50'
                                                : 'border-[#002a6e]/10 bg-white'
                                        )}
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                                            <div className="flex items-center gap-2">
                                                <Fuel className="h-4 w-4 text-[#003594]" />
                                                <p className="font-semibold text-gray-900">
                                                    {record.equipment_number}
                                                </p>
                                            </div>
                                            {analysis?.deviatesFromAverage && (
                                                <Badge
                                                    variant="outline"
                                                    className="border-amber-400 bg-amber-100 text-amber-900"
                                                >
                                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                                    {analysis.deviationDirection === 'below' ? 'Below average' : 'Above average'}
                                                </Badge>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                            <div>
                                                <p className="text-xs text-gray-500">Previous KM</p>
                                                <p className="font-medium">
                                                    {analysis?.previousKilometers?.toLocaleString() ?? '—'}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500">Current KM</p>
                                                <p className="font-medium">{km.toLocaleString()}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500">Distance</p>
                                                <p className="font-medium">
                                                    {(analysis?.kmDelta ?? Math.max(0, km - (analysis?.previousKilometers ?? 0))).toLocaleString()} km
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500">Quantity</p>
                                                <p className="font-medium">{qty} L</p>
                                            </div>
                                        </div>

                                        {analysis?.hasEnoughHistory && (
                                            <div className="mt-3 pt-3 border-t border-dashed border-gray-200 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600">
                                                <p>
                                                    Historical avg:{' '}
                                                    <strong className="text-gray-800">
                                                        {analysis.avgKmPerLiter.toFixed(2)} km/L
                                                    </strong>{' '}
                                                    ({analysis.validTripCount} prior issues)
                                                </p>
                                                <p>
                                                    Expected for {qty} L:{' '}
                                                    <strong className="text-gray-800">
                                                        {analysis.expectedKmForQuantity.toFixed(1)} km
                                                    </strong>
                                                </p>
                                            </div>
                                        )}

                                        {analysis?.warningMessage && (
                                            <p className="mt-2 text-xs text-amber-800 flex items-start gap-1">
                                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                                {analysis.warningMessage}
                                            </p>
                                        )}

                                        {analysis && !analysis.hasEnoughHistory && (
                                            <p className="mt-2 text-xs text-gray-500">
                                                Not enough approved history to compare consumption (
                                                {analysis.validTripCount} prior valid issue
                                                {analysis.validTripCount !== 1 ? 's' : ''}; need 2+).
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <DialogFooter className="gap-2 pt-4 border-t border-[#002a6e]/10">
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                        Back
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={isSubmitting || isLoadingPreview}
                        className="bg-[#003594] hover:bg-[#002a6e] text-white min-w-[140px]"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Submitting…
                            </>
                        ) : (
                            'Confirm & Submit'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
