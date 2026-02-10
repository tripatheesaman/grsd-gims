'use client';
import { useRouter } from 'next/navigation';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Card, CardContent } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/context/AuthContext';
import { useRRP } from '@/hooks/useRRP';
import { Loader2, Receipt, Globe, ArrowRight } from 'lucide-react';
import { API } from '@/lib/api';
import { useState } from 'react';
export default function RRPPage() {
    const router = useRouter();
    const { user } = useAuthContext();
    const { showErrorToast } = useCustomToast();
    const { isLoading, config } = useRRP();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const handleCreateRRP = async (type: 'local' | 'foreign') => {
        if (!user?.UserInfo?.permissions?.includes('can_create_rrp')) {
            showErrorToast({
                title: 'Error',
                message: "You don't have permission to access this page",
                duration: 3000,
            });
            router.push('/dashboard');
            return;
        }
        try {
            setIsSubmitting(true);
            const response = await API.get(`/api/rrp/getlatestrrpdetails/${type}`);
            if (response.status === 200) {
                const rrpDetails = response.data;
                const baseNumber = rrpDetails.rrpNumber ? rrpDetails.rrpNumber.split('T')[0] : '';
                router.push(`/rrp/new?type=${type}&rrpNumber=${baseNumber}`);
            }
            else {
                throw new Error('Failed to fetch RRP details');
            }
        }
        catch {
            showErrorToast({
                title: 'Error',
                message: "Failed to fetch RRP details. Please try again.",
                duration: 3000,
            });
        }
        finally {
            setIsSubmitting(false);
        }
    };
    if (isLoading || !config) {
        return (<div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#003594]"/>
      </div>);
    }
    return (<div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
              Receiving Receipt System
            </h1>
            <p className="text-gray-600 text-lg">
              Choose the type of RRP you want to create
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            <Card className="border-[#002a6e]/10 hover:border-[#d2293b]/20 transition-all duration-300 hover:shadow-lg">
              <CardContent className="p-6">
                <div className="flex flex-col items-center text-center space-y-6">
                  <div className="w-16 h-16 rounded-full bg-[#003594]/10 flex items-center justify-center">
                    <Receipt className="h-8 w-8 text-[#003594]"/>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-[#003594]">Local RRP</h3>
                    <p className="text-gray-600">
                      Create a receiving receipt for local purchases
                    </p>
                  </div>
                  <Button onClick={() => handleCreateRRP('local')} className="w-full bg-[#003594] hover:bg-[#d2293b] text-white transition-colors group" disabled={isSubmitting}>
                    {isSubmitting ? (<Loader2 className="h-4 w-4 animate-spin mr-2"/>) : (<>
                        Create Local RRP
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1"/>
                      </>)}
                  </Button>
                </div>
              </CardContent>
            </Card>

            
            <Card className="border-[#002a6e]/10 hover:border-[#d2293b]/20 transition-all duration-300 hover:shadow-lg">
              <CardContent className="p-6">
                <div className="flex flex-col items-center text-center space-y-6">
                  <div className="w-16 h-16 rounded-full bg-[#003594]/10 flex items-center justify-center">
                    <Globe className="h-8 w-8 text-[#003594]"/>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-[#003594]">Foreign RRP</h3>
                    <p className="text-gray-600">
                      Create a receiving receipt for foreign purchases
                    </p>
                  </div>
                  <Button onClick={() => handleCreateRRP('foreign')} className="w-full bg-[#003594] hover:bg-[#d2293b] text-white transition-colors group" disabled={isSubmitting}>
                    {isSubmitting ? (<Loader2 className="h-4 w-4 animate-spin mr-2"/>) : (<>
                        Create Foreign RRP
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1"/>
                      </>)}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>);
}
