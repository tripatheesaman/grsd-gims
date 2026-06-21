'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Send, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useApiPost } from '@/hooks/api/useApiMutation';
import { useApiQuery } from '@/hooks/api/useApiQuery';
import { useCustomToast } from '@/components/ui/custom-toast';
import { getErrorMessage } from '@/lib/errorHandling';
import { useAuthContext } from '@/context/AuthContext';
import {
    CommunicationAssignee,
    CommunicationThreadDetail,
} from '@/types/communications';
import {
    communicationStatusClass,
    communicationStatusLabel,
    formatCommunicationDate,
    isActiveCommunicationStatus,
    uploadCommunicationAttachment,
} from '@/lib/communications';
import { canCloseCommunication } from '@/lib/communicationMentions';
import { CommunicationMessageBubble } from '@/components/communications/CommunicationMessageBubble';
import { MentionTextarea } from '@/components/communications/MentionTextarea';

interface CommunicationThreadPanelProps {
    threadId: number | null;
    canAssignTasks: boolean;
    onUpdated: () => void;
}

export function CommunicationThreadPanel({
    threadId,
    canAssignTasks,
    onUpdated,
}: CommunicationThreadPanelProps) {
    const { user, permissions } = useAuthContext();
    const userId = user?.UserInfo?.id;
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [replyBody, setReplyBody] = useState('');
    const [conclusionBody, setConclusionBody] = useState('');
    const [replyAttachment, setReplyAttachment] = useState<File | null>(null);
    const [assigneeId, setAssigneeId] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);

    const { data: detailResponse, isLoading, refetch } = useApiQuery<CommunicationThreadDetail>(
        ['communications', 'thread', threadId],
        threadId ? `/api/communications/${threadId}` : '',
        undefined,
        { enabled: !!threadId }
    );

    const { data: assigneesResponse } = useApiQuery<CommunicationAssignee[]>(
        ['communications', 'assignees'],
        '/api/communications/assignees',
        undefined,
        { enabled: canAssignTasks && !!threadId }
    );

    const postMutation = useApiPost({
        onSuccess: () => {
            onUpdated();
            refetch();
        },
    });

    const detail = detailResponse?.data;
    const thread = detail?.thread;
    const messages = detail?.messages ?? [];
    const acknowledgements = detail?.acknowledgements ?? [];
    const assignees = assigneesResponse?.data ?? [];
    const userHasAcknowledgedMention = detail?.userHasAcknowledgedMention ?? false;
    const userCanReply = detail?.userCanReply ?? thread?.userHasAcknowledged ?? false;

    useEffect(() => {
        setReplyBody('');
        setConclusionBody('');
        setReplyAttachment(null);
        setAssigneeId('');
    }, [threadId]);

    if (!threadId) {
        return (
            <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                Select a communication to view details.
            </div>
        );
    }

    if (isLoading || !thread) {
        return (
            <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
                Loading thread...
            </div>
        );
    }

    const isActive = isActiveCommunicationStatus(thread.status);
    const canClose = canCloseCommunication({
        createdBy: thread.createdBy,
        userId,
        permissions,
    });

    const handleReply = async () => {
        if (!replyBody.trim()) return;
        setSubmitting(true);
        try {
            let attachmentPath: string | undefined;
            let attachmentName: string | undefined;
            if (replyAttachment) {
                const uploaded = await uploadCommunicationAttachment(replyAttachment);
                attachmentPath = uploaded.path;
                attachmentName = uploaded.name;
            }
            await postMutation.mutateAsync({
                url: `/api/communications/${threadId}/reply`,
                data: {
                    body: replyBody.trim(),
                    attachmentPath,
                    attachmentName,
                },
            });
            setReplyBody('');
            setReplyAttachment(null);
            showSuccessToast({ title: 'Reply sent', message: 'Your reply has been posted.', duration: 3000 });
        } catch (error) {
            showErrorToast({
                title: 'Error',
                message: getErrorMessage(error, 'Failed to send reply'),
                duration: 5000,
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleConclude = async () => {
        if (!conclusionBody.trim()) return;
        setSubmitting(true);
        try {
            await postMutation.mutateAsync({
                url: `/api/communications/${threadId}/conclude`,
                data: { conclusion: conclusionBody.trim() },
            });
            setConclusionBody('');
            showSuccessToast({ title: 'Closed', message: 'The matter has been closed.', duration: 3000 });
        } catch (error) {
            showErrorToast({
                title: 'Error',
                message: getErrorMessage(error, 'Failed to close matter'),
                duration: 5000,
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleAssign = async () => {
        if (!assigneeId) return;
        setSubmitting(true);
        try {
            await postMutation.mutateAsync({
                url: `/api/communications/${threadId}/assign`,
                data: { assigneeUserId: Number(assigneeId) },
            });
            setAssigneeId('');
            showSuccessToast({ title: 'Assigned', message: 'Task has been assigned.', duration: 3000 });
        } catch (error) {
            showErrorToast({
                title: 'Error',
                message: getErrorMessage(error, 'Failed to assign task'),
                duration: 5000,
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleAcknowledge = async () => {
        setSubmitting(true);
        try {
            await postMutation.mutateAsync({
                url: `/api/communications/${threadId}/acknowledge`,
                data: {},
            });
            showSuccessToast({ title: 'Acknowledged', message: 'You have acknowledged this message.', duration: 3000 });
        } catch (error) {
            showErrorToast({
                title: 'Error',
                message: getErrorMessage(error, 'Failed to acknowledge'),
                duration: 5000,
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-lg font-semibold text-slate-900">{thread.title}</h2>
                        <p className="mt-1 text-sm text-slate-500">
                            By {thread.creatorName} · {formatCommunicationDate(thread.createdAt)}
                        </p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${communicationStatusClass(thread.status)}`}>
                        {communicationStatusLabel(thread.status)}
                    </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
                    <span>{thread.messageCount} message{thread.messageCount === 1 ? '' : 's'}</span>
                    <span>{thread.ackCount} acknowledgement{thread.ackCount === 1 ? '' : 's'}</span>
                    {thread.assigneeName && (
                        <span>Assigned to {thread.assigneeName}</span>
                    )}
                </div>

                {isActive && !thread.userHasAcknowledged && !userHasAcknowledgedMention && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                        <p className="text-sm text-amber-900">You have not acknowledged this communication yet.</p>
                        <Button type="button" size="sm" className="mt-2" onClick={handleAcknowledge} disabled={submitting}>
                            <CheckCircle2 size={14} className="mr-2" />
                            Acknowledge
                        </Button>
                    </div>
                )}

                {isActive && userHasAcknowledgedMention && !thread.userHasAcknowledged && (
                    <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
                        <p className="text-sm text-violet-900">
                            You were mentioned in this thread. You can reply without acknowledging the full broadcast.
                        </p>
                    </div>
                )}
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {messages.map((message) => (
                    <CommunicationMessageBubble key={message.id} message={message} />
                ))}
            </div>

            {isActive && (
                <div className="space-y-4 border-t border-slate-200 px-5 py-4">
                    {userCanReply && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Reply</label>
                            <MentionTextarea
                                value={replyBody}
                                onChange={setReplyBody}
                                rows={3}
                                placeholder="Write a reply... Use @ to mention someone"
                            />
                            <input
                                type="file"
                                onChange={(event) => setReplyAttachment(event.target.files?.[0] ?? null)}
                                className="block w-full text-sm text-slate-600"
                            />
                            <Button type="button" onClick={handleReply} disabled={submitting || !replyBody.trim()}>
                                <Send size={16} className="mr-2" />
                                Send reply
                            </Button>
                        </div>
                    )}

                    {canClose && (
                        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                            <label className="text-sm font-medium text-emerald-900">Close with conclusion</label>
                            <Textarea
                                value={conclusionBody}
                                onChange={(event) => setConclusionBody(event.target.value)}
                                rows={3}
                                placeholder="Provide the solution or final conclusion..."
                            />
                            <Button type="button" onClick={handleConclude} disabled={submitting || !conclusionBody.trim()}>
                                <CheckCircle2 size={16} className="mr-2" />
                                Close matter
                            </Button>
                        </div>
                    )}

                    {canAssignTasks && thread.userHasAcknowledged && (
                        <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-4">
                            <label className="text-sm font-medium text-blue-900">Assign to user</label>
                            <div className="flex flex-wrap gap-2">
                                <Select value={assigneeId} onValueChange={setAssigneeId}>
                                    <SelectTrigger className="w-full max-w-sm bg-white">
                                        <SelectValue placeholder="Select assignee" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {assignees.map((assignee) => (
                                            <SelectItem key={assignee.id} value={String(assignee.id)}>
                                                {assignee.name}
                                                {assignee.designation ? ` · ${assignee.designation}` : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button type="button" variant="outline" onClick={handleAssign} disabled={submitting || !assigneeId}>
                                    <UserPlus size={16} className="mr-2" />
                                    Assign
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {acknowledgements.length > 0 && (
                <div className="border-t border-slate-200 px-5 py-4">
                    <h3 className="text-sm font-semibold text-slate-800">Acknowledged by</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {acknowledgements.map((ack) => (
                            <span
                                key={`${ack.userId}-${ack.acknowledgedAt}`}
                                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                                title={formatCommunicationDate(ack.acknowledgedAt)}
                            >
                                {ack.userName}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
