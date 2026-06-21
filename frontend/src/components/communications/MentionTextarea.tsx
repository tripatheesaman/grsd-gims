'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { API } from '@/lib/api';
import { CommunicationAssignee } from '@/types/communications';
import { getActiveMentionQuery, insertMentionToken } from '@/lib/communicationMentions';
import { cn } from '@/utils/utils';

interface MentionTextareaProps {
    value: string;
    onChange: (value: string) => void;
    rows?: number;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

export function MentionTextarea({
    value,
    onChange,
    rows = 3,
    placeholder,
    disabled,
    className,
}: MentionTextareaProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionStart, setMentionStart] = useState(0);
    const [users, setUsers] = useState<CommunicationAssignee[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);

    const fetchUsers = useCallback(async (query: string) => {
        setLoadingUsers(true);
        try {
            const response = await API.get<CommunicationAssignee[]>('/api/communications/mentionable-users', {
                params: { q: query },
            });
            setUsers(response.data ?? []);
            setHighlightIndex(0);
        } catch {
            setUsers([]);
        } finally {
            setLoadingUsers(false);
        }
    }, []);

    useEffect(() => {
        if (!mentionOpen) return;
        const timer = setTimeout(() => {
            void fetchUsers(mentionQuery);
        }, 200);
        return () => clearTimeout(timer);
    }, [mentionOpen, mentionQuery, fetchUsers]);

    const syncMentionState = (text: string, cursorPos: number) => {
        const active = getActiveMentionQuery(text, cursorPos);
        if (active) {
            setMentionOpen(true);
            setMentionQuery(active.query);
            setMentionStart(active.startIndex);
        } else {
            setMentionOpen(false);
            setMentionQuery('');
        }
    };

    const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const next = event.target.value;
        onChange(next);
        syncMentionState(next, event.target.selectionStart ?? next.length);
    };

    const handleSelect = (user: CommunicationAssignee) => {
        const textarea = textareaRef.current;
        const cursorPos = textarea?.selectionStart ?? value.length;
        const { value: nextValue, cursor } = insertMentionToken(
            value,
            mentionStart,
            cursorPos,
            user.name,
            user.id
        );
        onChange(nextValue);
        setMentionOpen(false);
        setMentionQuery('');
        requestAnimationFrame(() => {
            if (textarea) {
                textarea.focus();
                textarea.setSelectionRange(cursor, cursor);
            }
        });
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (!mentionOpen || !users.length) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setHighlightIndex((prev) => (prev + 1) % users.length);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setHighlightIndex((prev) => (prev - 1 + users.length) % users.length);
        } else if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            handleSelect(users[highlightIndex]);
        } else if (event.key === 'Escape') {
            setMentionOpen(false);
        }
    };

    return (
        <div className="relative">
            <Textarea
                ref={textareaRef}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onClick={(event) => syncMentionState(value, event.currentTarget.selectionStart ?? value.length)}
                onKeyUp={(event) => syncMentionState(value, event.currentTarget.selectionStart ?? value.length)}
                rows={rows}
                placeholder={placeholder}
                disabled={disabled}
                className={className}
            />
            {mentionOpen && (
                <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                    {loadingUsers ? (
                        <p className="px-3 py-2 text-sm text-slate-500">Searching users...</p>
                    ) : users.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-slate-500">No users found</p>
                    ) : (
                        users.map((user, index) => (
                            <button
                                key={user.id}
                                type="button"
                                className={cn(
                                    'flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-slate-50',
                                    index === highlightIndex && 'bg-blue-50'
                                )}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    handleSelect(user);
                                }}
                            >
                                <span className="font-medium text-slate-900">{user.name}</span>
                                <span className="text-xs text-slate-500">
                                    {user.username}
                                    {user.designation ? ` · ${user.designation}` : ''}
                                </span>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
