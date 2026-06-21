export type CommunicationThreadStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface CommunicationThread {
    id: number;
    title: string;
    status: CommunicationThreadStatus;
    createdBy: number;
    creatorName: string;
    creatorUsername?: string;
    assignedTo: number | null;
    assigneeName: string | null;
    assigneeUsername?: string | null;
    assignedAt: string | null;
    conclusion: string | null;
    concludedBy: number | null;
    concludedAt: string | null;
    createdAt: string;
    updatedAt: string;
    messageCount: number;
    ackCount: number;
    userHasAcknowledged: boolean;
}

export interface CommunicationMessage {
    id: number;
    threadId: number;
    userId: number;
    authorName: string;
    authorUsername?: string;
    body: string;
    attachmentPath: string | null;
    attachmentName: string | null;
    messageType: 'initial' | 'reply' | 'conclusion';
    createdAt: string;
}

export interface CommunicationAcknowledgement {
    userId: number;
    userName: string;
    username?: string;
    acknowledgedAt: string;
}

export interface UnacknowledgedThread extends CommunicationThread {
    alertType?: 'initial' | 'reply' | 'mention';
    alertId?: number | null;
    mentionAcknowledged?: boolean;
    initialMessage: {
        body: string;
        attachmentPath: string | null;
        attachmentName: string | null;
        createdAt: string;
    };
    latestReply?: {
        body: string;
        attachmentPath: string | null;
        attachmentName: string | null;
        createdAt: string;
        authorName: string;
    };
}

export interface CommunicationThreadDetail {
    thread: CommunicationThread;
    messages: CommunicationMessage[];
    acknowledgements: CommunicationAcknowledgement[];
    userHasAcknowledgedMention?: boolean;
    userCanReply?: boolean;
}

export interface CommunicationAssignee {
    id: number;
    username: string;
    name: string;
    staffId?: string;
    designation?: string;
}
