'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Eye, EyeOff } from 'lucide-react';
import { API } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { withBasePath } from '@/lib/urls';
export default function ResetPasswordPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [email, setEmail] = useState<string>('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        const emailParam = searchParams.get('email');
        if (!emailParam) {
            router.push('/login');
            return;
        }
        setEmail(emailParam);
        window.history.pushState(null, '', window.location.href);
        window.onpopstate = function () {
            window.history.pushState(null, '', window.location.href);
        };
        return () => {
            window.onpopstate = null;
        };
    }, [searchParams, router]);
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        if (newPassword.length < 8) {
            setError('Password must be at least 8 characters long');
            return;
        }
        setIsResetting(true);
        try {
            await API.post('/api/auth/reset-password', {
                email,
                newPassword
            });
            toast({
                title: "Success",
                description: "Password has been reset successfully",
                className: "bg-green-500 text-white border-none",
                duration: 3000,
            });
            router.push('/login');
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to reset password');
            toast({
                title: "Error",
                description: err instanceof Error ? err.message : 'Failed to reset password',
                variant: "destructive",
                className: "bg-red-500 text-white border-none",
                duration: 3000,
            });
        }
        finally {
            setIsResetting(false);
        }
    };
    return (<main className="flex min-h-screen items-center justify-center bg-gray-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-8">
        <div className="flex justify-center mb-6">
          <Image src={withBasePath("/images/nepal_airlines_logo.jpeg")} alt="Nepal Airlines Logo" width={150} height={150} className="h-auto w-auto" priority/>
        </div>

        <h1 className="text-2xl font-bold text-center text-[#003594] mb-6">
          Reset Password
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-[#002a6e]">
              Email
            </label>
            <input type="email" value={email} disabled className="mt-1 w-full rounded-lg border border-[#002a6e]/10 px-4 py-2 bg-gray-50 text-gray-500"/>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#002a6e]">
              New Password
            </label>
            <div className="relative">
              <input type={showNewPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required placeholder="Enter new password" className="mt-1 w-full rounded-lg border border-[#002a6e]/10 px-4 py-2 focus:border-[#003594] focus:ring-[#003594]"/>
              <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute inset-y-0 right-2 flex items-center text-[#002a6e]">
                {showNewPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#002a6e]">
              Confirm New Password
            </label>
            <div className="relative">
              <input type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required placeholder="Confirm new password" className="mt-1 w-full rounded-lg border border-[#002a6e]/10 px-4 py-2 focus:border-[#003594] focus:ring-[#003594]"/>
              <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-2 flex items-center text-[#002a6e]">
                {showConfirmPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
              </button>
            </div>
          </div>

          {error && (<p className="text-sm text-red-600">{error}</p>)}

          <button type="submit" disabled={isResetting} className="w-full rounded-lg bg-[#003594] px-4 py-2 text-white font-semibold hover:bg-[#003594]/90 focus:outline-none focus:ring-2 focus:ring-[#003594] disabled:opacity-50 disabled:cursor-not-allowed">
            {isResetting ? "Resetting..." : "Reset Password"}
          </button>
        </form>
      </div>
    </main>);
}
