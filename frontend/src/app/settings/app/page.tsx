'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { useCustomToast } from '@/components/ui/custom-toast';
import { useAuthContext } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API } from '@/lib/api';
import { useState, useEffect, useRef } from 'react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/utils/utils';
export default function AppSettingsPage() {
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const { permissions } = useAuthContext();
    const [fiscalYear, setFiscalYear] = useState<string>("");
    const [isLoading, setIsLoading] = useState(false);
    const canEditFiscalYear = permissions?.includes('can_change_fy') || permissions?.includes('can_access_settings');
    const canConfigureEmails = permissions?.includes('can_configure_request_emails');
    const canToggleMail = permissions?.includes('can_stop_and_start_mail_sending');
    const [mailSendingEnabled, setMailSendingEnabled] = useState(false);
    const [sendEnabled, setSendEnabled] = useState(false);
    const [remindersEnabled, setRemindersEnabled] = useState(false);
    const [reminderDays, setReminderDays] = useState(3);
    const [reminderIntervalMin, setReminderIntervalMin] = useState(30);
    const [includePdf, setIncludePdf] = useState(true);
    const [fromEmail, setFromEmail] = useState('');
    const [smtpPass, setSmtpPass] = useState('');
    type Recipient = {
        id?: number;
        email: string;
        role: 'to' | 'cc' | 'bcc';
        send_on_approval?: boolean;
        send_on_reminder?: boolean;
        send_on_force_close?: boolean;
        allow_reminder?: boolean;
        is_active?: boolean;
    };
    const [recipients, setRecipients] = useState<Recipient[]>([]);
    const [newRecipient, setNewRecipient] = useState({
        email: '',
        role: 'to' as 'to' | 'cc' | 'bcc',
        send_on_approval: true,
        send_on_reminder: true,
        send_on_force_close: true,
        allow_reminder: true,
    });
    const showErrorToastRef = useRef(showErrorToast);
    useEffect(() => {
        showErrorToastRef.current = showErrorToast;
    }, [showErrorToast]);
    useEffect(() => {
        const fetchFiscalYear = async () => {
            try {
                const response = await API.get('/api/settings/fiscal-year');
                if (response.status === 200) {
                    setFiscalYear(response.data.fiscalYear);
                }
            }
            catch {
                showErrorToastRef.current?.({
                    title: "Error",
                    message: "Failed to fetch current fiscal year",
                    duration: 3000,
                });
            }
        };
        fetchFiscalYear();
    }, [showErrorToast]);
    useEffect(() => {
        const fetchEmailConfig = async () => {
            try {
                const res = await API.get('/api/settings/request/email-config');
                if (res.status === 200) {
                    const { settings, recipients } = res.data || {};
                    if (settings) {
                        setMailSendingEnabled(!!settings.mail_sending_enabled);
                        setSendEnabled(!!settings.send_enabled);
                        setRemindersEnabled(!!settings.reminders_enabled);
                        setReminderDays(settings.reminder_days ?? 3);
                        setReminderIntervalMin(settings.reminder_interval_min ?? 30);
                        setIncludePdf(!!settings.include_pdf);
                        setFromEmail(settings.from_email || '');
                        setSmtpPass(settings.smtp_pass || '');
                    }
                    if (Array.isArray(recipients)) {
                        setRecipients(recipients.map((r: Recipient) => ({
                            ...r,
                            send_on_approval: !!r.send_on_approval,
                            send_on_reminder: !!r.send_on_reminder,
                            send_on_force_close: !!r.send_on_force_close,
                            allow_reminder: !!r.allow_reminder,
                            is_active: !!r.is_active,
                        })));
                    }
                }
            }
            catch {
            }
        };
        fetchEmailConfig();
    }, [showErrorToast]);
    const handleSave = async () => {
        if (!canEditFiscalYear) {
            showErrorToast({
                title: "Access Denied",
                message: "You don't have permission to change fiscal year",
                duration: 3000,
            });
            return;
        }
        const fiscalYearRegex = /^\d{4}\/\d{2}$/;
        if (!fiscalYearRegex.test(fiscalYear)) {
            showErrorToast({
                title: "Invalid Format",
                message: "Fiscal year must be in format YYYY/YY (e.g., 2081/82)",
                duration: 3000,
            });
            return;
        }
        try {
            setIsLoading(true);
            const response = await API.put('/api/settings/fiscal-year', {
                fiscalYear
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: "Success",
                    message: "Fiscal year updated successfully",
                    duration: 3000,
                });
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to update fiscal year",
                duration: 3000,
            });
        }
        finally {
            setIsLoading(false);
        }
    };
    const handleSaveEmailSettings = async () => {
        if (!canConfigureEmails) {
            showErrorToast({
                title: "Access Denied",
                message: "You don't have permission to configure request emails",
                duration: 3000,
            });
            return;
        }
        try {
            const payload = {
                settings: {
                    send_enabled: sendEnabled ? 1 : 0,
                    reminders_enabled: remindersEnabled ? 1 : 0,
                    reminder_days: reminderDays,
                    reminder_interval_min: reminderIntervalMin,
                    include_pdf: includePdf ? 1 : 0,
                    from_email: fromEmail.trim() || null,
                    smtp_pass: smtpPass || null,
                },
                recipients: recipients.map(r => ({
                    id: r.id,
                    email: r.email,
                    role: r.role,
                    send_on_approval: r.send_on_approval ? 1 : 0,
                    send_on_reminder: r.send_on_reminder ? 1 : 0,
                    send_on_force_close: r.send_on_force_close ? 1 : 0,
                    allow_reminder: r.allow_reminder ? 1 : 0,
                    is_active: r.is_active ? 1 : 0,
                })),
            };
            const res = await API.put('/api/settings/request/email-config', payload);
            if (res.status === 200) {
                showSuccessToast({
                    title: "Success",
                    message: "Email settings saved",
                    duration: 3000,
                });
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to save email settings",
                duration: 3000,
            });
        }
    };
    const handleToggleMail = async (enabled: boolean) => {
        if (!canToggleMail) {
            showErrorToast({
                title: "Access Denied",
                message: "You don't have permission to toggle mail sending",
                duration: 3000,
            });
            return;
        }
        try {
            const res = await API.post('/api/settings/request/email-toggle', { mail_sending_enabled: enabled });
            if (res.status === 200) {
                setMailSendingEnabled(enabled);
                showSuccessToast({
                    title: "Success",
                    message: `Mail sending ${enabled ? 'enabled' : 'disabled'}`,
                    duration: 3000,
                });
            }
        }
        catch {
            showErrorToast({
                title: "Error",
                message: "Failed to toggle mail sending",
                duration: 3000,
            });
        }
    };
    const handleAddRecipient = () => {
        if (!newRecipient.email.trim()) {
            showErrorToast({
                title: "Validation",
                message: "Email is required",
                duration: 3000,
            });
            return;
        }
        setRecipients(prev => [
            ...prev,
            { ...newRecipient, id: undefined, is_active: true }
        ]);
        setNewRecipient({
            email: '',
            role: 'to',
            send_on_approval: true,
            send_on_reminder: true,
            send_on_force_close: true,
            allow_reminder: true,
        });
    };
    const handleRecipientChange = (id: number | undefined, idx: number | undefined, field: keyof typeof newRecipient | 'is_active', value: string | number | boolean) => {
        setRecipients(prev => {
            if (id !== undefined) {
                return prev.map(r => r.id === id ? { ...r, [field]: value } : r);
            }
            else if (idx !== undefined) {
                return prev.map((r, i) => i === idx ? { ...r, [field]: value } : r);
            }
            return prev;
        });
    };
    const handleRemoveRecipient = (id?: number, idx?: number) => {
        if (id) {
            setRecipients(prev => prev.map(r => r.id === id ? { ...r, is_active: false } : r));
        }
        else if (idx !== undefined) {
            setRecipients(prev => prev.filter((_, i) => i !== idx));
        }
    };
    return (<div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fiscalYear">Fiscal Year</Label>
              <Input id="fiscalYear" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} placeholder="e.g., 2081/82" disabled={!canEditFiscalYear} className="max-w-xs"/>
              <p className="text-sm text-gray-500">
                Enter fiscal year in format YYYY/YY (e.g., 2081/82)
              </p>
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={handleSave} disabled={isLoading || !canEditFiscalYear} className="bg-[#003594] text-white hover:bg-[#002a6e]">
                {isLoading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Request Email Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch checked={mailSendingEnabled} onCheckedChange={handleToggleMail} disabled={!canToggleMail}/>
              <span className="text-sm font-medium">Global mail sending</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={sendEnabled} onCheckedChange={setSendEnabled} disabled={!canConfigureEmails}/>
              <span className="text-sm font-medium">Send approval emails</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={remindersEnabled} onCheckedChange={setRemindersEnabled} disabled={!canConfigureEmails}/>
              <span className="text-sm font-medium">Send reminder emails</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={includePdf} onCheckedChange={setIncludePdf} disabled={!canConfigureEmails}/>
              <span className="text-sm font-medium">Include PDF attachment</span>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Reminder days</Label>
              <Input type="number" min={1} value={reminderDays} onChange={(e) => setReminderDays(Number(e.target.value) || 1)} className="w-24" disabled={!canConfigureEmails}/>
            </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">Reminder interval (minutes)</Label>
            <Input type="number" min={5} value={reminderIntervalMin} onChange={(e) => setReminderIntervalMin(Number(e.target.value) || 5)} className="w-32" disabled={!canConfigureEmails}/>
          </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fromEmail" className="text-sm font-medium text-[#003594]">From Email Address *</Label>
            <Input id="fromEmail" type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="sender@example.com" disabled={!canConfigureEmails} className="max-w-md"/>
            <p className="text-xs text-gray-500">
              The email address that will appear as the sender. Defaults to SMTP_USER if not set.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtpPass" className="text-sm font-medium text-[#003594]">SMTP Password</Label>
            <Input id="smtpPass" type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder="smtp password" disabled={!canConfigureEmails} className="max-w-md"/>
            <p className="text-xs text-gray-500">
              Password for the above sender email. Leave blank to keep using the environment password.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-[#003594]">Recipients</h4>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <Input placeholder="email@example.com" value={newRecipient.email} onChange={(e) => setNewRecipient(r => ({ ...r, email: e.target.value }))} disabled={!canConfigureEmails} className="md:col-span-2"/>
              <select value={newRecipient.role} onChange={(e) => setNewRecipient(r => ({ ...r, role: e.target.value as 'to' | 'cc' | 'bcc' }))} disabled={!canConfigureEmails} className="border rounded-md p-2">
                <option value="to">To</option>
                <option value="cc">CC</option>
                <option value="bcc">BCC</option>
              </select>
              <div className="flex items-center gap-2">
                <Switch checked={newRecipient.send_on_approval} onCheckedChange={(v) => setNewRecipient(r => ({ ...r, send_on_approval: v }))} disabled={!canConfigureEmails}/>
                <span className="text-xs">Approval</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={newRecipient.send_on_reminder} onCheckedChange={(v) => setNewRecipient(r => ({ ...r, send_on_reminder: v }))} disabled={!canConfigureEmails}/>
                <span className="text-xs">Reminder</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={newRecipient.allow_reminder} onCheckedChange={(v) => setNewRecipient(r => ({ ...r, allow_reminder: v }))} disabled={!canConfigureEmails}/>
                <span className="text-xs">Allow reminder</span>
              </div>
              <Button onClick={handleAddRecipient} disabled={!canConfigureEmails} className="bg-[#003594] text-white hover:bg-[#002a6e]">
                Add
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-gray-500 mb-2">
                Click on any field below to edit. Changes will be saved when you click &quot;Save Email Settings&quot; at the bottom.
              </p>
              {recipients.filter(r => r.is_active !== false).map((r, idx) => {
            const actualIdx = recipients.findIndex(rec => rec === r);
            return (<div key={r.id ?? `tmp-${idx}`} className="border rounded-md p-3 flex flex-wrap gap-3 items-center bg-gray-50 hover:bg-gray-100 transition-colors">
                  <div className="flex-1 min-w-[200px]">
                    <Label className="text-xs text-gray-600 mb-1 block">Email Address</Label>
                    <Input type="email" value={r.email} onChange={(e) => handleRecipientChange(r.id, actualIdx, 'email', e.target.value)} disabled={!canConfigureEmails} className="min-w-[200px] bg-white" placeholder="email@example.com"/>
                  </div>
                  <div className="min-w-[120px]">
                    <Label className="text-xs text-gray-600 mb-1 block">Role</Label>
                    <select value={r.role} onChange={(e) => handleRecipientChange(r.id, actualIdx, 'role', e.target.value as 'to' | 'cc' | 'bcc')} disabled={!canConfigureEmails} className="border rounded-md p-2 w-full bg-white">
                      <option value="to">To</option>
                      <option value="cc">CC</option>
                      <option value="bcc">BCC</option>
                    </select>
                  </div>
                  <label className={cn("flex items-center gap-2 text-xs", !canConfigureEmails && "opacity-70")}>
                    <Switch checked={!!r.send_on_approval} onCheckedChange={(v) => handleRecipientChange(r.id, actualIdx, 'send_on_approval', v)} disabled={!canConfigureEmails}/> Approval
                  </label>
                  <label className={cn("flex items-center gap-2 text-xs", !canConfigureEmails && "opacity-70")}>
                    <Switch checked={!!r.send_on_reminder} onCheckedChange={(v) => handleRecipientChange(r.id, actualIdx, 'send_on_reminder', v)} disabled={!canConfigureEmails}/> Reminder
                  </label>
                  <label className={cn("flex items-center gap-2 text-xs", !canConfigureEmails && "opacity-70")}>
                    <Switch checked={!!r.allow_reminder} onCheckedChange={(v) => handleRecipientChange(r.id, actualIdx, 'allow_reminder', v)} disabled={!canConfigureEmails}/> Allow reminder
                  </label>
                  <label className={cn("flex items-center gap-2 text-xs", !canConfigureEmails && "opacity-70")}>
                    <Switch checked={r.send_on_force_close !== false} onCheckedChange={(v) => handleRecipientChange(r.id, actualIdx, 'send_on_force_close', v)} disabled={!canConfigureEmails}/> Force-close
                  </label>
                  <Button variant="destructive" size="sm" onClick={() => handleRemoveRecipient(r.id, actualIdx)} disabled={!canConfigureEmails}>
                    Remove
                  </Button>
                </div>);
        })}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveEmailSettings} className="bg-[#003594] text-white hover:bg-[#002a6e]" disabled={!canConfigureEmails}>
              Save Email Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>);
}
