'use client';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format, startOfDay } from 'date-fns';
import { API } from '@/lib/api';
import { useAuthContext } from '@/context/AuthContext';
import { useCustomToast } from '@/components/ui/custom-toast';
import { getErrorMessage } from '@/lib/errorHandling';
interface LastReceiveData {
    last_receive_date: string;
    last_receive_quantity: number;
}
export default function FuelReceivePage() {
    const [date, setDate] = useState<Date>(new Date());
    const [quantity, setQuantity] = useState<number>(0);
    const [lastReceive, setLastReceive] = useState<LastReceiveData | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { showErrorToast, showSuccessToast } = useCustomToast();
    const { user } = useAuthContext();
    useEffect(() => {
        const fetchLastReceive = async () => {
            try {
                const response = await API.get('/api/fuel/last-receive');
                setLastReceive(response.data);
            }
            catch (error) {
                showErrorToast({
                    title: 'Error',
                    message: getErrorMessage(error, 'Failed to load last receive data'),
                });
            }
        };
        fetchLastReceive();
    }, [showErrorToast]);
    const handleSubmit = async () => {
        if (!user?.UserInfo?.username) {
            showErrorToast({
                title: 'Error',
                message: 'User not authenticated',
            });
            return;
        }
        if (quantity <= 0) {
            showErrorToast({
                title: 'Error',
                message: 'Please enter a valid quantity',
            });
            return;
        }
        setIsSubmitting(true);
        try {
            const utcDate = startOfDay(date);
            const payload = {
                receive_date: format(utcDate, 'yyyy-MM-dd'),
                received_by: user.UserInfo.username,
                quantity: quantity,
            };
            const response = await API.post('/api/fuel/receive', payload);
            if (response.status === 200 || response.status === 201) {
                showSuccessToast({
                    title: 'Success',
                    message: 'Fuel received successfully',
                });
                setQuantity(0);
                setDate(new Date());
            }
            else {
                const errorMessage = response.data?.message || 'Failed to receive fuel';
                showErrorToast({
                    title: 'Error',
                    message: errorMessage,
                });
            }
        }
        catch (error) {
            showErrorToast({
                title: 'Error',
                message: getErrorMessage(error, 'Failed to receive fuel'),
            });
        }
        finally {
            setIsSubmitting(false);
        }
    };
    return (<div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Receive Petrol</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            {lastReceive && (<div className="bg-muted p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Last Receive Information</h3>
                <p>Date: {format(new Date(lastReceive.last_receive_date), 'PPP')}</p>
                <p>Quantity: {lastReceive.last_receive_quantity} liters</p>
              </div>)}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Receive Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4"/>
                      {date ? format(date, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar value={date} onChange={(date: Date | null) => date && setDate(date)}/>
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="space-y-2">
                <Label>Quantity (liters)</Label>
                <Input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} placeholder="Enter quantity" min="0" step="0.01"/>
              </div>
            </div>

            <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full bg-[#003594] text-white cursor-pointer hover:opacity-98">
              {isSubmitting ? 'Receiving...' : 'Receive Petrol'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>);
}
