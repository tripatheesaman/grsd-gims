'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { AlertTriangle, CheckCircle2, MessageSquare, Paperclip, Send, X } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MentionTextarea } from '@/components/communications/MentionTextarea';
import { CommunicationMessageBody } from '@/components/communications/CommunicationMessageBody';
import { useCommunicationsContext } from '@/context/CommunicationsContext';
import { useAuthContext } from '@/context/AuthContext';
import { useApiPost } from '@/hooks/api/useApiMutation';
import { useCustomToast } from '@/components/ui/custom-toast';
import { UnacknowledgedThread } from '@/types/communications';
import {
    communicationStatusClass,
    communicationStatusLabel,
    formatCommunicationDate,
    uploadCommunicationAttachment,
} from '@/lib/communications';
import { withBasePath } from '@/lib/urls';
import { getErrorMessage } from '@/lib/errorHandling';
import { canCloseCommunication } from '@/lib/communicationMentions';

type PopupPhase = 'acknowledge' | 'follow_up';

function AttachmentLink({
    path,
    name,
}: {
    path: string;
    name?: string | null;
}) {
    const href = withBasePath(path);
    const label = name || 'View attachment';
    const isImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(path);

    if (isImage) {
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="mt-3 block">
                <Image
                    src={href}
                    alt={label}
                    width={640}
                    height={384}
                    unoptimized
                    className="max-h-48 rounded-lg border border-slate-200 object-contain"
                />
            </a>
        );
    }

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-blue-700 hover:bg-slate-100"
        >
            <Paperclip size={16} />
            {label}
        </a>
    );
}

export default function CommunicationsPopup() {
    const { isAuthenticated, user, permissions } = useAuthContext();
    const userId = user?.UserInfo?.id;
    const { unacknowledged, refreshUnacknowledged } = useCommunicationsContext();
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [phase, setPhase] = useState<PopupPhase>('acknowledge');
    const [activeThread, setActiveThread] = useState<UnacknowledgedThread | null>(null);
    const [replyBody, setReplyBody] = useState('');
    const [conclusionBody, setConclusionBody] = useState('');
    const [replyAttachment, setReplyAttachment] = useState<File | null>(null);
    const [mode, setMode] = useState<'none' | 'reply' | 'conclude'>('none');
    const [submitting, setSubmitting] = useState(false);

    const postMutation = useApiPost({
        onSuccess: () => refreshUnacknowledged(),
    });

    const resetFollowUp = () => {
        setPhase('acknowledge');
        setActiveThread(null);
        setMode('none');
        setReplyBody('');
        setConclusionBody('');
        setReplyAttachment(null);
    };

    const currentThread = phase === 'follow_up' ? activeThread : unacknowledged[0] ?? null;
    const open = Boolean(isAuthenticated && currentThread);
    const isReplyAlert = currentThread?.alertType === 'reply';
    const isMentionAlert = currentThread?.alertType === 'mention';
    const isDirectedAlert = isReplyAlert || isMentionAlert;
    const canClose = currentThread
        ? canCloseCommunication({
            createdBy: currentThread.createdBy,
            userId,
            permissions,
        })
        : false;

    useEffect(() => {
        const pending = unacknowledged[0];
        if (!pending) {
            if (phase !== 'acknowledge') {
                resetFollowUp();
            }
            return;
        }

        const alertKey = (thread: UnacknowledgedThread) =>
            `${thread.id}-${thread.alertType ?? 'initial'}-${thread.alertId ?? 0}`;
        const pendingKey = alertKey(pending);
        const activeKey = activeThread ? alertKey(activeThread) : null;

        if (
            pending.alertType === 'mention'
            && pending.mentionAcknowledged
            && phase === 'acknowledge'
            && pendingKey !== activeKey
        ) {
            setActiveThread(pending);
            setPhase('follow_up');
            setMode('none');
            return;
        }

        if (phase === 'follow_up' && pendingKey !== activeKey) {
            resetFollowUp();
        }
    }, [unacknowledged, phase, activeThread]);

    useEffect(() => {
        if (phase === 'acknowledge' && unacknowledged.length === 0) {
            setActiveThread(null);
            setMode('none');
            setReplyBody('');
            setConclusionBody('');
            setReplyAttachment(null);
        }
    }, [phase, unacknowledged.length]);

    const handleDismissFollowUp = async () => {
        const threadToDismiss = activeThread ?? currentThread;
        if (!threadToDismiss) {
            resetFollowUp();
            return;
        }

        if (threadToDismiss.alertType === 'reply') {
            try {
                await postMutation.mutateAsync({
                    url: `/api/communications/${threadToDismiss.id}/acknowledge`,
                    data: {
                        alertType: threadToDismiss.alertType,
                        alertId: threadToDismiss.alertId,
                    },
                });
            } catch {
                // still reset locally to avoid blocking the user
            }
        } else if (threadToDismiss.alertType === 'mention') {
            try {
                await postMutation.mutateAsync({
                    url: `/api/communications/${threadToDismiss.id}/acknowledge`,
                    data: {
                        alertType: 'mention',
                        alertId: threadToDismiss.alertId,
                        mentionAction: 'snooze',
                    },
                });
                showSuccessToast({
                    title: 'Dismissed for now',
                    message: 'You will be reminded again in 2 hours or when you next log in.',
                    duration: 5000,
                });
            } catch {
                // still reset locally to avoid blocking the user
            }
        }
        resetFollowUp();
    };

    const handleAcknowledge = async () => {
        if (!currentThread) return;
        setSubmitting(true);
        try {
            const isReply = currentThread.alertType === 'reply';
            const isMention = currentThread.alertType === 'mention';

            await postMutation.mutateAsync({
                url: `/api/communications/${currentThread.id}/acknowledge`,
                data: isReply || isMention
                    ? { alertType: currentThread.alertType, alertId: currentThread.alertId }
                    : {},
            });

            if (isReply) {
                showSuccessToast({
                    title: 'Reply noted',
                    message: 'You can open the thread to respond.',
                    duration: 4000,
                });
                resetFollowUp();
                return;
            }

            if (isMention) {
                setActiveThread({ ...currentThread, mentionAcknowledged: true });
                setPhase('follow_up');
                setMode('none');
                showSuccessToast({
                    title: 'Mention acknowledged',
                    message: 'Reply now or dismiss for now. You will be reminded again if needed.',
                    duration: 4000,
                });
                return;
            }

            setActiveThread(currentThread);
            setPhase('follow_up');
            setMode('none');
            showSuccessToast({
                title: 'Acknowledged',
                message: 'You can reply, close the matter, or dismiss for now.',
                duration: 4000,
            });
        } catch (error) {
            showErrorToast({
                title: 'Error',
                message: getErrorMessage(error, 'Failed to acknowledge message'),
                duration: 5000,
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleReply = async () => {
        if (!activeThread || !replyBody.trim()) return;
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
                url: `/api/communications/${activeThread.id}/reply`,
                data: {
                    body: replyBody.trim(),
                    attachmentPath,
                    attachmentName,
                },
            });
            showSuccessToast({
                title: 'Reply sent',
                message: 'Your reply has been posted.',
                duration: 4000,
            });
            resetFollowUp();
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
        if (!activeThread || !conclusionBody.trim()) return;
        setSubmitting(true);
        try {
            await postMutation.mutateAsync({
                url: `/api/communications/${activeThread.id}/conclude`,
                data: { conclusion: conclusionBody.trim() },
            });
            showSuccessToast({
                title: 'Matter closed',
                message: 'The communication has been closed with your conclusion.',
                duration: 4000,
            });
            handleDismissFollowUp();
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

    if (!open || !currentThread) {
        return null;
    }

    const isMentionFollowUp = phase === 'follow_up' && (activeThread?.alertType === 'mention' || isMentionAlert);
    const followUpTitle = isMentionFollowUp
        ? currentThread?.mentionAcknowledged
            ? 'Reminder: you were mentioned'
            : 'Mention acknowledged'
        : 'Communication acknowledged';
    const followUpDescription = isMentionFollowUp
        ? 'Reply to the message where you were mentioned, or dismiss for now. You will be reminded again in 2 hours or when you next log in.'
        : 'You may reply to continue the discussion or close the matter with a conclusion.';
    const initial = currentThread.initialMessage;
    const latestReply = currentThread.latestReply;
    const displayBody = isDirectedAlert && latestReply ? latestReply.body : initial.body;
    const displayAttachmentPath = isDirectedAlert && latestReply ? latestReply.attachmentPath : initial.attachmentPath;
    const displayAttachmentName = isDirectedAlert && latestReply ? latestReply.attachmentName : initial.attachmentName;
    const displayDate = isDirectedAlert && latestReply ? latestReply.createdAt : initial.createdAt;
    const displayFrom = isDirectedAlert && latestReply
        ? latestReply.authorName
        : currentThread.creatorName;

    return (
        <Dialog open={open} onOpenChange={() => undefined}>
            <DialogContent
                className="z-[100] max-h-[90vh] max-w-2xl overflow-hidden p-0 sm:max-w-2xl [&+div]:z-[100]"
                onPointerDownOutside={(event) => event.preventDefault()}
                onEscapeKeyDown={(event) => event.preventDefault()}
            >
                <div className="border-b border-amber-200 bg-amber-50 px-6 py-4">
                    <DialogHeader className="space-y-2 text-left">
                        <div className="flex items-start gap-3">
                            <div className="rounded-full bg-amber-100 p-2 text-amber-700">
                                {phase === 'acknowledge' ? <AlertTriangle size={20} /> : <MessageSquare size={20} />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <DialogTitle className="text-lg font-semibold text-slate-900">
                                    {phase === 'acknowledge'
                                        ? isMentionAlert
                                            ? 'You were mentioned'
                                            : isReplyAlert
                                              ? 'New reply on your communication'
                                              : 'Action required: New communication'
                                        : followUpTitle}
                                </DialogTitle>
                                <DialogDescription className="text-sm text-slate-600">
                                    {phase === 'acknowledge'
                                        ? isMentionAlert
                                            ? 'Someone mentioned you in this conversation. Acknowledge only this mention — you do not need to acknowledge the entire thread.'
                                            : isReplyAlert
                                              ? 'Someone replied to a message you sent. This alert will keep appearing until you acknowledge it.'
                                              : 'This message is visible to everyone and will keep appearing until you acknowledge it.'
                                        : followUpDescription}
                                </DialogDescription>
                            </div>
                            {phase === 'follow_up' && (
                                <button
                                    type="button"
                                    onClick={handleDismissFollowUp}
                                    className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-slate-700"
                                    aria-label="Dismiss"
                                >
                                    <X size={18} />
                                </button>
                            )}
                        </div>
                    </DialogHeader>
                </div>

                <div className="max-h-[calc(90vh-12rem)] overflow-y-auto px-6 py-5">
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${communicationStatusClass(currentThread.status)}`}>
                            {communicationStatusLabel(currentThread.status)}
                        </span>
                        <span className="text-xs text-slate-500">
                            {isMentionAlert ? 'Mention from' : isReplyAlert ? 'Reply from' : 'From'} {displayFrom} · {formatCommunicationDate(displayDate)}
                        </span>
                    </div>

                    <h3 className="text-base font-semibold text-slate-900">{currentThread.title}</h3>
                    {!isDirectedAlert && (
                        <CommunicationMessageBody body={initial.body} />
                    )}
                    {isDirectedAlert && (
                        <div className={`mt-3 rounded-lg border p-4 ${isMentionAlert ? 'border-violet-200 bg-violet-50' : 'border-blue-200 bg-blue-50'}`}>
                            <CommunicationMessageBody body={displayBody} />
                        </div>
                    )}
                    {!isDirectedAlert && initial.attachmentPath && (
                        <AttachmentLink path={initial.attachmentPath} name={initial.attachmentName} />
                    )}
                    {isDirectedAlert && displayAttachmentPath && (
                        <AttachmentLink path={displayAttachmentPath} name={displayAttachmentName} />
                    )}

                    {phase === 'follow_up' && mode === 'reply' && (
                        <div className="mt-6 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                            <label className="text-sm font-medium text-slate-700">Your reply</label>
                            <MentionTextarea
                                value={replyBody}
                                onChange={setReplyBody}
                                rows={4}
                                placeholder="Write your reply... Use @ to mention someone"
                            />
                            <input
                                type="file"
                                onChange={(event) => setReplyAttachment(event.target.files?.[0] ?? null)}
                                className="block w-full text-sm text-slate-600"
                            />
                            <div className="flex gap-2">
                                <Button type="button" onClick={handleReply} disabled={submitting || !replyBody.trim()}>
                                    <Send size={16} className="mr-2" />
                                    Send reply
                                </Button>
                                <Button type="button" variant="outline" onClick={() => setMode('none')} disabled={submitting}>
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    )}

                    {phase === 'follow_up' && canClose && !isMentionFollowUp && mode === 'conclude' && (
                        <div className="mt-6 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                            <label className="text-sm font-medium text-emerald-900">Solution / conclusion</label>
                            <Textarea
                                value={conclusionBody}
                                onChange={(event) => setConclusionBody(event.target.value)}
                                rows={4}
                                placeholder="Describe the solution or final conclusion..."
                            />
                            <div className="flex gap-2">
                                <Button type="button" onClick={handleConclude} disabled={submitting || !conclusionBody.trim()}>
                                    <CheckCircle2 size={16} className="mr-2" />
                                    Close matter
                                </Button>
                                <Button type="button" variant="outline" onClick={() => setMode('none')} disabled={submitting}>
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4">
                    {phase === 'acknowledge' ? (
                        <>
                            <p className="text-xs text-slate-500">
                                {unacknowledged.length > 1 ? `${unacknowledged.length} messages waiting for acknowledgement` : 'Acknowledgement is required to continue'}
                            </p>
                            <Button type="button" onClick={handleAcknowledge} disabled={submitting}>
                                <CheckCircle2 size={16} className="mr-2" />
                                Acknowledge
                            </Button>
                        </>
                    ) : (
                        <>
                            <Link
                                href={`/communications?thread=${activeThread?.id ?? currentThread.id}`}
                                className="text-sm font-medium text-blue-700 hover:underline"
                                onClick={handleDismissFollowUp}
                            >
                                Open full thread
                            </Link>
                            <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="outline" onClick={() => setMode('reply')} disabled={submitting || mode !== 'none'}>
                                    Reply
                                </Button>
                                {canClose && !isMentionFollowUp && (
                                    <Button type="button" variant="outline" onClick={() => setMode('conclude')} disabled={submitting || mode !== 'none'}>
                                        Close matter
                                    </Button>
                                )}
                                <Button type="button" onClick={handleDismissFollowUp} disabled={submitting}>
                                    {isMentionFollowUp ? 'Dismiss for now' : 'Dismiss'}
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
