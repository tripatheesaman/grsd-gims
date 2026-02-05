"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/context/AuthContext";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";
import { API } from "@/lib/api";
const LoginPage = () => {
    const { login } = useAuthContext();
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [isCheckingReset, setIsCheckingReset] = useState(false);
    const checkPasswordResetEligibility = async (email: string) => {
        try {
            const response = await API.post('/api/auth/check-reset-eligibility', { email });
            return response.data.canReset;
        }
        catch {
            return false;
        }
    };
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsCheckingReset(true);
        try {
            const canReset = await checkPasswordResetEligibility(username);
            if (canReset) {
                router.push(`/reset-password?email=${encodeURIComponent(username)}`);
                return;
            }
            await login(username, password);
            router.push("/dashboard");
        }
        catch (err) {
            if (err instanceof Error) {
                setError(err);
            }
            else {
                setError(new Error("Login failed"));
            }
        }
        finally {
            setIsCheckingReset(false);
        }
    };
    return (<main className="flex min-h-screen items-center justify-center bg-gray-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-8">
        <div className="flex justify-center mb-6">
          <Image src="/images/nepal_airlines_logo.jpeg" alt="Nepal Airlines Logo" width={150} height={150} className="h-auto w-auto" priority/>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input id="email" type="email" value={username} onChange={(e) => setUsername(e.target.value)} required placeholder="you@example.com" className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-red-500 focus:ring-red-500"/>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <div className="relative">
              <input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Enter your password" className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 pr-10 focus:border-red-500 focus:ring-red-500"/>
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-2 flex items-center text-gray-500">
                {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
              </button>
            </div>
          </div>

          {error && (<p className="text-sm text-red-600">{error.message}</p>)}

          <button type="submit" disabled={isCheckingReset} className="w-full rounded-lg bg-red-500 px-4 py-2 text-white font-semibold hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-50 disabled:cursor-not-allowed">
            {isCheckingReset ? "Checking..." : "Login"}
          </button>
        </form>
      </div>
    </main>);
};
export default LoginPage;
