'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { API } from '@/lib/api';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Spinner, ContentSpinner } from '@/components/ui/spinner';
import { getErrorMessage } from '@/lib/errorHandling';
export default function PetrolConsumptionReportPage() {
    const [date, setDate] = useState<Date>(new Date());
    const [isLoading, setIsLoading] = useState(false);
    const { showErrorToast, showSuccessToast } = useCustomToast();
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
            showSuccessToast({
                title: 'Success',
                message: 'Report generated successfully',
            });
        }
        catch (error) {
            showErrorToast({
                title: 'Error',
                message: getErrorMessage(error, 'Failed to generate report'),
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
