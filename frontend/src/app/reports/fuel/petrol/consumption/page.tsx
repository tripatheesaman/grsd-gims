'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { API } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Spinner, ContentSpinner } from '@/components/ui/spinner';
export default function PetrolConsumptionReportPage() {
    const [date, setDate] = useState<Date>(new Date());
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    const handleGenerateReport = async () => {
        setIsLoading(true);
        try {
            const startDate = startOfMonth(date);
            const endDate = endOfMonth(date);
            await API.get('/api/fuel/reports/petrol/consumption', {
                params: {
                    start_date: format(startDate, 'yyyy-MM-dd'),
                    end_date: format(endDate, 'yyyy-MM-dd')
                }
            });
            toast({
                title: 'Success',
                description: 'Report generated successfully',
            });
        }
        catch (error: unknown) {
            let errorMessage = 'Failed to generate report';
            if (error &&
                typeof error === 'object' &&
                'response' in error &&
                typeof (error as {
                    response?: unknown;
                }).response === 'object' &&
                (error as {
                    response?: unknown;
                }).response !== null) {
                const response = (error as {
                    response?: unknown;
                }).response;
                if (typeof response === 'object' &&
                    response !== null &&
                    'data' in response &&
                    typeof (response as {
                        data?: unknown;
                    }).data === 'object' &&
                    (response as {
                        data?: unknown;
                    }).data !== null) {
                    const data = (response as {
                        data?: unknown;
                    }).data;
                    if (typeof data === 'object' &&
                        data !== null &&
                        'message' in data &&
                        typeof (data as {
                            message?: unknown;
                        }).message === 'string') {
                        errorMessage = (data as {
                            message: string;
                        }).message;
                    }
                }
            }
            else if (error instanceof Error && error.message) {
                errorMessage = error.message;
            }
            toast({
                title: 'Error',
                description: errorMessage,
                variant: 'destructive',
            });
        }
        finally {
            setIsLoading(false);
        }
    };
    return (<div className="container mx-auto py-10">
      <Card className="shadow-lg rounded-xl border border-gray-200 bg-white max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-[#003594]">Petrol Consumption Report</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-8">
            <div className="space-y-2">
              <h3 className="font-semibold text-[#003594]">Select Month</h3>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal bg-white border-[#003594] text-[#003594] hover:bg-[#003594] hover:text-white">
                    <CalendarIcon className="mr-2 h-4 w-4"/>
                    {date ? format(date, "MMMM yyyy") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-white">
                  <Calendar value={date} onChange={(date: Date | null) => date && setDate(date)}/>
                </PopoverContent>
              </Popover>
            </div>
            <Button onClick={handleGenerateReport} disabled={isLoading} className="w-full bg-[#003594] text-white font-semibold hover:bg-[#d2293b] transition-colors">
              {isLoading ? <Spinner size="sm" variant="white" className="mr-2"/> : null}
              {isLoading ? 'Generating Report...' : 'Generate Report'}
            </Button>
            {isLoading && <ContentSpinner />}
          </div>
        </CardContent>
      </Card>
    </div>);
}
