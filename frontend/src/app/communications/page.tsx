'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageSquarePlus, RefreshCw } from 'lucide-react';
import { useAuthContext } from '@/context/AuthContext';
import { useCommunicationsContext } from '@/context/CommunicationsContext';
import { useApiQuery } from '@/hooks/api/useApiQuery';
import { useApiPost } from '@/hooks/api/useApiMutation';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { CommunicationThreadPanel } from '@/components/communications/CommunicationThreadPanel';
import { MentionTextarea } from '@/components/communications/MentionTextarea';
import { CommunicationThread } from '@/types/communications';
import {
    communicationStatusClass,
    communicationStatusLabel,
    formatCommunicationDate,
    uploadCommunicationAttachment,
} from '@/lib/communications';
import { getErrorMessage } from '@/lib/errorHandling';

export default function CommunicationsPage() {
    const { user, permissions } = useAuthContext();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { refreshUnacknowledged } = useCommunicationsContext();
    const { showSuccessToast, showErrorToast } = useCustomToast();

    const [statusFilter, setStatusFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [ackFilter, setAckFilter] = useState('all');
    const [assignedToMe, setAssignedToMe] = useState(false);
    const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [attachment, setAttachment] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const canAssignTasks = permissions.includes('can_assign_tasks');
    const canDeleteConversations = permissions.includes('can_delete_conversations');
    const canBypassAcknowledgements = permissions.includes('can_bypass_acknowledgements');

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => {
        if (!user) {
            router.push('/login');
        }
    }, [user, router]);

    const listParams = useMemo(() => {
        const params: Record<string, string> = { status: statusFilter };
        if (debouncedSearch) {
            params.q = debouncedSearch;
        }
        if (ackFilter !== 'all') {
            params.ack = ackFilter;
        }
        if (assignedToMe) {
            params.assignedToMe = '1';
        }
        return params;
    }, [statusFilter, debouncedSearch, ackFilter, assignedToMe]);

    const { data: threadsResponse, isLoading, refetch } = useApiQuery<CommunicationThread[]>(
        ['communications', 'threads', listParams],
        '/api/communications',
        listParams,
        { enabled: !!user }
    );

    const threads = useMemo(() => threadsResponse?.data ?? [], [threadsResponse?.data]);

    const postMutation = useApiPost();

    const handleRefresh = useCallback(async () => {
        await refetch();
        await refreshUnacknowledged();
    }, [refetch, refreshUnacknowledged]);

    useEffect(() => {
        const threadParam = searchParams.get('thread');
        if (threadParam) {
            const parsed = Number(threadParam);
            if (parsed) {
                setSelectedThreadId(parsed);
            }
        }
    }, [searchParams]);

    useEffect(() => {
        if (!selectedThreadId && threads.length > 0) {
            setSelectedThreadId(threads[0].id);
        }
    }, [threads, selectedThreadId]);

    const handleCreate = async () => {
        if (!title.trim() || !body.trim()) {
            showErrorToast({
                title: 'Validation',
                message: 'Title and message are required.',
                duration: 4000,
            });
            return;
        }

        setSubmitting(true);
        try {
            let attachmentPath: string | undefined;
            let attachmentName: string | undefined;
            if (attachment) {
                const uploaded = await uploadCommunicationAttachment(attachment);
                attachmentPath = uploaded.path;
                attachmentName = uploaded.name;
            }

            const response = await postMutation.mutateAsync({
                url: '/api/communications',
                data: {
                    title: title.trim(),
                    body: body.trim(),
                    attachmentPath,
                    attachmentName,
                },
            });

            const threadId = (response.data as { threadId?: number })?.threadId;
            setCreateOpen(false);
            setTitle('');
            setBody('');
            setAttachment(null);
            await handleRefresh();
            if (threadId) {
                setSelectedThreadId(threadId);
            }
            showSuccessToast({
                title: 'Sent',
                message: 'Communication broadcast to all users.',
                duration: 4000,
            });
        } catch (error) {
            showErrorToast({
                title: 'Error',
                message: getErrorMessage(error, 'Failed to send communication'),
                duration: 5000,
            });
        } finally {
            setSubmitting(false);
        }
    };

    if (!user) {
        return null;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Communications</h1>
                    <p className="mt-1 text-sm text-slate-600">
                        Broadcast messages to everyone. Unacknowledged items appear as popups until each user responds.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={handleRefresh} disabled={isLoading}>
                        <RefreshCw size={16} className="mr-2" />
                        Refresh
                    </Button>
                    <Button type="button" onClick={() => setCreateOpen(true)}>
                        <MessageSquarePlus size={16} className="mr-2" />
                        New message
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr]">
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="space-y-3 border-b border-slate-200 px-4 py-3">
                        <Input
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Search title, message, or people..."
                        />
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Filter by status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All statuses</SelectItem>
                                <SelectItem value="open">Open</SelectItem>
                                <SelectItem value="in_progress">In progress</SelectItem>
                                <SelectItem value="resolved">Resolved</SelectItem>
                                <SelectItem value="closed">Closed</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={ackFilter} onValueChange={setAckFilter}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Acknowledgement" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All acknowledgements</SelectItem>
                                <SelectItem value="pending">Pending my acknowledgement</SelectItem>
                                <SelectItem value="acknowledged">Acknowledged by me</SelectItem>
                            </SelectContent>
                        </Select>
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                            <input
                                type="checkbox"
                                checked={assignedToMe}
                                onChange={(event) => setAssignedToMe(event.target.checked)}
                                className="h-4 w-4 rounded border-slate-300"
                            />
                            Assigned to me
                        </label>
                    </div>

                    <div className="max-h-[calc(100vh-16rem)] overflow-y-auto">
                        {isLoading ? (
                            <p className="px-4 py-8 text-center text-sm text-slate-500">Loading...</p>
                        ) : threads.length === 0 ? (
                            <p className="px-4 py-8 text-center text-sm text-slate-500">No communications yet.</p>
                        ) : (
                            threads.map((thread) => (
                                <button
                                    key={thread.id}
                                    type="button"
                                    onClick={() => setSelectedThreadId(thread.id)}
                                    className={`w-full border-b border-slate-100 px-4 py-4 text-left transition-colors hover:bg-slate-50 ${
                                        selectedThreadId === thread.id ? 'bg-blue-50' : ''
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{thread.title}</h3>
                                        {!canBypassAcknowledgements
                                            && !thread.userHasAcknowledged
                                            && (thread.status === 'open' || thread.status === 'in_progress') && (
                                            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                                                Pending
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${communicationStatusClass(thread.status)}`}>
                                            {communicationStatusLabel(thread.status)}
                                        </span>
                                        <span className="text-xs text-slate-500">{formatCommunicationDate(thread.updatedAt)}</span>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                        {thread.creatorName}
                                        {thread.assigneeName ? ` · Assigned: ${thread.assigneeName}` : ''}
                                    </p>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                <CommunicationThreadPanel
                    threadId={selectedThreadId}
                    canAssignTasks={canAssignTasks}
                    canDeleteConversations={canDeleteConversations}
                    canBypassAcknowledgements={canBypassAcknowledgements}
                    onUpdated={handleRefresh}
                    onDeleted={() => setSelectedThreadId(null)}
                />
            </div>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>New communication</DialogTitle>
                        <DialogDescription>
                            This message will be visible to all users and will popup until each person acknowledges it.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Title</label>
                            <Input
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                                placeholder="Subject or summary"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Message</label>
                            <MentionTextarea
                                value={body}
                                onChange={setBody}
                                rows={5}
                                placeholder="Write your message... Use @ to mention someone"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Attachment (optional)</label>
                            <input
                                type="file"
                                onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
                                className="block w-full text-sm text-slate-600"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
                                Cancel
                            </Button>
                            <Button type="button" onClick={handleCreate} disabled={submitting}>
                                Send to everyone
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
