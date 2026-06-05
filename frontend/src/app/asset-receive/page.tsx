'use client';

import { useMemo, useState, useEffect } from 'react';
import { format } from 'date-fns';
import Image from 'next/image';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useEffectivePermissions } from '@/hooks/useEffectivePermissions';
import { useAuthContext } from '@/context/AuthContext';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/utils';
import { API } from '@/lib/api';
import { withBasePath } from '@/lib/urls';
import {
    Briefcase,
    CalendarIcon,
    CheckCircle2,
    ClipboardList,
    ImageIcon,
    Loader2,
    Package,
    Plus,
    ShieldCheck,
    Trash2,
} from 'lucide-react';

interface CartItem {
    id: string;
    modelName: string;
    receiveQuantity: number;
    image: File;
    previewUrl: string;
}

const STEPS = [
    { id: 1, label: 'Receive date', icon: CalendarIcon },
    { id: 2, label: 'Add models', icon: Package },
    { id: 3, label: 'Submit', icon: ShieldCheck },
] as const;

export default function AssetReceivePage() {
    const { user } = useAuthContext();
    const { permissions } = useEffectivePermissions();
    const canReceive = permissions.includes('can_receive_assets');
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [date, setDate] = useState<Date | undefined>(undefined);
    const [modelName, setModelName] = useState('');
    const [quantity, setQuantity] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!imageFile) {
            setImagePreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(imageFile);
        setImagePreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [imageFile]);

    const totalQty = useMemo(
        () => cart.reduce((sum, item) => sum + item.receiveQuantity, 0),
        [cart]
    );

    const currentStep = useMemo(() => {
        if (!date) return 1;
        if (cart.length === 0) return 2;
        return 3;
    }, [date, cart.length]);

    if (!canReceive) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center bg-[#f6f8fc] p-6">
                <div className="max-w-md rounded-3xl border border-[#002a6e]/10 bg-white p-8 text-center shadow-[0_24px_60px_-36px_rgba(0,32,77,0.35)]">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#d2293b]/10">
                        <ShieldCheck className="h-7 w-7 text-[#d2293b]" />
                    </div>
                    <h1 className="text-xl font-semibold text-[#003594]">Access restricted</h1>
                    <p className="mt-2 text-sm text-gray-600">
                        You need the <span className="font-medium text-[#003594]">Receive Assets</span> permission to record capital equipment receives.
                    </p>
                </div>
            </div>
        );
    }

    const resetLineForm = () => {
        setModelName('');
        setQuantity('');
        setImageFile(null);
    };

    const handleAddToCart = () => {
        const qty = parseFloat(quantity);
        if (!modelName.trim()) {
            showErrorToast({ title: 'Error', message: 'Model name is required', duration: 3000 });
            return;
        }
        if (!qty || qty <= 0) {
            showErrorToast({ title: 'Error', message: 'Quantity must be positive', duration: 3000 });
            return;
        }
        if (!imageFile) {
            showErrorToast({ title: 'Error', message: 'Equipment photo is required', duration: 3000 });
            return;
        }
        const previewUrl = URL.createObjectURL(imageFile);
        setCart((prev) => [
            ...prev,
            {
                id: `${Date.now()}`,
                modelName: modelName.trim(),
                receiveQuantity: qty,
                image: imageFile,
                previewUrl,
            },
        ]);
        resetLineForm();
    };

    const handleSubmit = async () => {
        if (!user?.UserInfo?.username) {
            showErrorToast({ title: 'Error', message: 'You must be logged in', duration: 3000 });
            return;
        }
        if (!date) {
            showErrorToast({ title: 'Error', message: 'Please select receive date', duration: 3000 });
            return;
        }
        if (cart.length === 0) {
            showErrorToast({ title: 'Error', message: 'Add at least one item', duration: 3000 });
            return;
        }
        setIsSubmitting(true);
        try {
            const imagePaths: string[] = [];
            for (const item of cart) {
                const formData = new FormData();
                formData.append('file', item.image);
                formData.append('folder', 'asset-receive');
                const uploadResponse = await fetch(withBasePath('/api/upload'), {
                    method: 'POST',
                    body: formData,
                });
                if (!uploadResponse.ok) {
                    const errorData = await uploadResponse.json().catch(() => ({}));
                    throw new Error(
                        (errorData as { error?: string }).error ||
                            `Failed to upload image for ${item.modelName}`
                    );
                }
                const uploadResult = (await uploadResponse.json()) as { path: string };
                imagePaths.push(uploadResult.path);
            }

            const receiveDateLocal = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            await API.post('/api/asset-receive/create', {
                receiveDate: receiveDateLocal,
                receivedBy: user.UserInfo.username,
                items: cart.map((c, index) => ({
                    modelName: c.modelName,
                    receiveQuantity: c.receiveQuantity,
                    imagePath: imagePaths[index],
                })),
            });
            showSuccessToast({
                title: 'Submitted for approval',
                message: 'Assets receive sent to Approvals. Capital RRP can be created after approval.',
                duration: 5000,
            });
            cart.forEach((item) => URL.revokeObjectURL(item.previewUrl));
            setCart([]);
            setDate(undefined);
            resetLineForm();
        }
        catch (err: unknown) {
            const message =
                err instanceof Error
                    ? err.message
                    : err && typeof err === 'object' && 'response' in err
                      ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
                      : 'Failed to submit';
            showErrorToast({ title: 'Error', message: message || 'Failed to submit', duration: 5000 });
        }
        finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f6f8fc]">
            <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
                <section className="relative overflow-hidden rounded-3xl border border-[#003594]/10 bg-gradient-to-br from-[#012b6c] via-[#003594] to-[#05163c] p-8 text-white shadow-[0_30px_80px_-40px_rgba(0,0,0,0.45)]">
                    <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" aria-hidden />
                    <div className="absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-[#d2293b]/25 blur-3xl" aria-hidden />
                    <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="space-y-3">
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-white/80">
                                <Briefcase className="h-3.5 w-3.5" />
                                Capital equipment
                            </div>
                            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Assets Receive</h1>
                            <p className="max-w-xl text-sm text-white/80">
                                Record equipment by model name, quantity, and a mandatory photo. Submissions go to Approvals; after approval you can build a Capital RRP (RRCP).
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <div className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 backdrop-blur">
                                <p className="text-xs uppercase tracking-wider text-white/60">In cart</p>
                                <p className="text-2xl font-bold">{cart.length}</p>
                            </div>
                            <div className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 backdrop-blur">
                                <p className="text-xs uppercase tracking-wider text-white/60">Total qty</p>
                                <p className="text-2xl font-bold">{totalQty}</p>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="grid gap-3 sm:grid-cols-3">
                    {STEPS.map((step) => {
                        const Icon = step.icon;
                        const active = currentStep === step.id;
                        const done = currentStep > step.id;
                        return (
                            <div
                                key={step.id}
                                className={cn(
                                    'flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all',
                                    active && 'border-[#003594]/30 bg-white shadow-sm ring-2 ring-[#003594]/15',
                                    done && !active && 'border-emerald-200/80 bg-emerald-50/50',
                                    !active && !done && 'border-[#002a6e]/10 bg-white/60'
                                )}
                            >
                                <div
                                    className={cn(
                                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                                        active && 'bg-[#003594] text-white',
                                        done && !active && 'bg-emerald-600 text-white',
                                        !active && !done && 'bg-gray-100 text-gray-400'
                                    )}
                                >
                                    {done && !active ? (
                                        <CheckCircle2 className="h-5 w-5" />
                                    ) : (
                                        <Icon className="h-5 w-5" />
                                    )}
                                </div>
                                <div>
                                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Step {step.id}</p>
                                    <p className={cn('text-sm font-semibold', active ? 'text-[#003594]' : 'text-gray-700')}>
                                        {step.label}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                    <div className="space-y-6 lg:col-span-2">
                        <div className="rounded-2xl border border-[#002a6e]/10 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
                            <div className="mb-6 flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#003594]/10">
                                    <Package className="h-5 w-5 text-[#003594]" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-[#003594]">Add equipment line</h2>
                                    <p className="text-sm text-gray-500">Model, quantity, and equipment photo (required)</p>
                                </div>
                            </div>
                            <div className="grid gap-5 sm:grid-cols-2">
                                <div className="space-y-2 sm:col-span-2">
                                    <Label htmlFor="modelName" className="text-[#003594]">
                                        Model name <span className="text-[#d2293b]">*</span>
                                    </Label>
                                    <Input
                                        id="modelName"
                                        value={modelName}
                                        onChange={(e) => setModelName(e.target.value)}
                                        placeholder="e.g. Boeing 737-800 landing gear assembly"
                                        className="border-[#002a6e]/15 focus-visible:ring-[#003594]"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="quantity" className="text-[#003594]">
                                        Quantity <span className="text-[#d2293b]">*</span>
                                    </Label>
                                    <Input
                                        id="quantity"
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={quantity}
                                        onChange={(e) => setQuantity(e.target.value)}
                                        placeholder="0"
                                        className="border-[#002a6e]/15 focus-visible:ring-[#003594]"
                                    />
                                </div>
                                <div className="space-y-2 sm:col-span-2">
                                    <Label htmlFor="equipmentImage" className="text-[#003594]">
                                        Equipment photo <span className="text-[#d2293b]">*</span>
                                    </Label>
                                    {imagePreviewUrl && (
                                        <div className="relative mb-2 h-44 w-full overflow-hidden rounded-xl border border-dashed border-[#002a6e]/20 bg-slate-50">
                                            <Image
                                                src={imagePreviewUrl}
                                                alt="Equipment preview"
                                                fill
                                                className="object-contain p-2"
                                                unoptimized
                                            />
                                        </div>
                                    )}
                                    <Input
                                        id="equipmentImage"
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                                        className="border-[#002a6e]/15 file:mr-4 file:rounded-md file:border-0 file:bg-[#003594] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[#d2293b]"
                                    />
                                    <p className="text-xs text-gray-500 flex items-center gap-1">
                                        <ImageIcon className="h-3.5 w-3.5" />
                                        A clear photo of the equipment is required for each line item.
                                    </p>
                                </div>
                                <div className="flex items-end sm:col-span-2">
                                    <Button
                                        type="button"
                                        onClick={handleAddToCart}
                                        className="h-10 w-full bg-[#003594] shadow-md transition-all hover:bg-[#d2293b] hover:shadow-lg sm:w-auto sm:min-w-[160px]"
                                    >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Add to cart
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {cart.length > 0 && (
                            <div className="rounded-2xl border border-[#002a6e]/10 bg-white p-6 shadow-sm">
                                <div className="mb-4 flex items-center justify-between">
                                    <h2 className="text-lg font-semibold text-[#003594]">Line items</h2>
                                    <span className="rounded-full bg-[#003594]/10 px-3 py-1 text-xs font-semibold text-[#003594]">
                                        {cart.length} {cart.length === 1 ? 'model' : 'models'}
                                    </span>
                                </div>
                                <ul className="space-y-3">
                                    {cart.map((item, index) => (
                                        <li
                                            key={item.id}
                                            className="group flex items-stretch justify-between gap-4 rounded-xl border border-[#002a6e]/8 bg-gradient-to-r from-white to-[#f6f8fc] p-4 transition-colors hover:border-[#003594]/20"
                                        >
                                            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                                <Image
                                                    src={item.previewUrl}
                                                    alt={item.modelName}
                                                    fill
                                                    className="object-cover"
                                                    unoptimized
                                                />
                                            </div>
                                            <div className="flex min-w-0 flex-1 items-center gap-4">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#003594] text-sm font-bold text-white">
                                                    {index + 1}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="truncate font-medium text-gray-900">{item.modelName}</p>
                                                    <p className="text-sm text-gray-500">
                                                        Qty <span className="font-semibold text-[#003594]">{item.receiveQuantity}</span>
                                                    </p>
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="shrink-0 self-center text-gray-400 opacity-70 transition-opacity hover:bg-red-50 hover:text-[#d2293b] group-hover:opacity-100"
                                                onClick={() => {
                                                    URL.revokeObjectURL(item.previewUrl);
                                                    setCart((p) => p.filter((c) => c.id !== item.id));
                                                }}
                                                aria-label="Remove item"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
                        <div className="rounded-2xl border border-[#002a6e]/10 bg-white p-6 shadow-sm">
                            <div className="mb-4 flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#003594]/10">
                                    <CalendarIcon className="h-5 w-5 text-[#003594]" />
                                </div>
                                <div>
                                    <h2 className="font-semibold text-[#003594]">Receive date</h2>
                                    <p className="text-xs text-gray-500">Required before submit</p>
                                </div>
                            </div>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className={cn(
                                            'h-11 w-full justify-start border-[#002a6e]/15 text-left font-normal',
                                            !date && 'text-muted-foreground'
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4 text-[#003594]" />
                                        {date ? format(date, 'PPP') : 'Select receive date'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto overflow-hidden bg-white p-2" align="start">
                                    <Calendar value={date} onChange={(d) => setDate(d ?? undefined)} />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="rounded-2xl border border-[#002a6e]/10 bg-white p-6 shadow-sm">
                            <div className="mb-4 flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#003594]/10">
                                    <ClipboardList className="h-5 w-5 text-[#003594]" />
                                </div>
                                <h2 className="font-semibold text-[#003594]">Summary</h2>
                            </div>
                            <dl className="space-y-3 text-sm">
                                <div className="flex justify-between border-b border-dashed border-gray-200 pb-2">
                                    <dt className="text-gray-500">Date</dt>
                                    <dd className="font-medium text-gray-900">{date ? format(date, 'dd MMM yyyy') : '—'}</dd>
                                </div>
                                <div className="flex justify-between border-b border-dashed border-gray-200 pb-2">
                                    <dt className="text-gray-500">Models</dt>
                                    <dd className="font-medium text-gray-900">{cart.length}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-gray-500">Total quantity</dt>
                                    <dd className="font-semibold text-[#003594]">{totalQty}</dd>
                                </div>
                            </dl>

                            {cart.length === 0 ? (
                                <div className="mt-6 rounded-xl border border-dashed border-[#002a6e]/15 bg-[#f6f8fc]/80 px-4 py-8 text-center">
                                    <Package className="mx-auto h-10 w-10 text-gray-300" />
                                    <p className="mt-3 text-sm font-medium text-gray-600">Cart is empty</p>
                                    <p className="mt-1 text-xs text-gray-400">Add at least one model with photo to submit</p>
                                </div>
                            ) : null}

                            <Button
                                className="mt-6 h-12 w-full rounded-xl bg-[#003594] text-base font-semibold shadow-lg transition-all hover:bg-[#d2293b] hover:shadow-xl disabled:opacity-50"
                                disabled={isSubmitting || !date || cart.length === 0}
                                onClick={handleSubmit}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        Submitting…
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck className="mr-2 h-5 w-5" />
                                        Submit for approval
                                    </>
                                )}
                            </Button>
                            <p className="mt-3 text-center text-xs text-gray-400">
                                Appears under Approvals → Assets Receive
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
