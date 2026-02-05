'use client';
import { useState } from 'react';
import { Card, CardContent } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Fuel, Droplet } from 'lucide-react';
type FuelType = 'petrol' | 'diesel';
export default function FuelIssuePage() {
    const [selectedType, setSelectedType] = useState<FuelType | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const handleTypeSelect = async (type: FuelType) => {
        setIsLoading(true);
        setSelectedType(type);
        router.push(`/fuels/issue/${type}`);
    };
    return (<div className="flex-1 p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#003594]">Fuel Issue</h1>
        <p className="text-gray-500 mt-1">Select the type of fuel to issue</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <Button variant={selectedType === 'petrol' ? 'default' : 'outline'} className="w-full h-40 flex flex-col items-center justify-center gap-4 hover:bg-[#003594]/10" onClick={() => handleTypeSelect('petrol')} disabled={isLoading}>
              <Droplet className="h-12 w-12 text-[#003594]"/>
              <span className="text-xl font-medium">Petrol</span>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <Button variant={selectedType === 'diesel' ? 'default' : 'outline'} className="w-full h-40 flex flex-col items-center justify-center gap-4 hover:bg-[#003594]/10" onClick={() => handleTypeSelect('diesel')} disabled={isLoading}>
              <Fuel className="h-12 w-12 text-[#003594]"/>
              <span className="text-xl font-medium">Diesel</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>);
}
