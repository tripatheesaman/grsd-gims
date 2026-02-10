'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { API } from '@/lib/api';
import { useCustomToast } from '@/components/ui/custom-toast';
import { Label } from '@/components/ui/label';
import { Spinner, ContentSpinner } from '@/components/ui/spinner';
import { getErrorMessage } from '@/lib/errorHandling';
export default function WeeklyPetrolReportPage() {
    const [startDate, setStartDate] = useState<Date>(new Date());
    const [endDate, setEndDate] = useState<Date>(new Date());
    const [isLoading, setIsLoading] = useState(false);
    const { showErrorToast, showSuccessToast } = useCustomToast();
    const handleGenerateReport = async () => {
        if (!startDate || !endDate) {
            showErrorToast({
                title: 'Error',
                message: 'Please select both start and end dates',
            });
            return;
        }
        setIsLoading(true);
        try {
            const response = await API.get('/api/fuel/reports/petrol/weekly', {
                params: {
                    start_date: format(startDate, 'yyyy-MM-dd'),
                    end_date: format(endDate, 'yyyy-MM-dd')
                },
                responseType: 'blob'
            });
            const blob = new Blob([response.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const fileName = `petrol_report_${format(startDate, 'yyyy-MM-dd')}_to_${format(endDate, 'yyyy-MM-dd')}.xlsx`;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            showSuccessToast({
                title: 'Success',
                message: 'Report downloaded successfully',
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
          <CardTitle className="text-2xl font-bold text-[#003594]">Weekly Petrol Report</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[#003594] font-semibold">From Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal bg-white border-[#003594] text-[#003594] hover:bg-[#003594] hover:text-white">
                      <CalendarIcon className="mr-2 h-4 w-4"/>
                      {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-white">
                    <Calendar value={startDate} onChange={(date: Date | null) => date && setStartDate(date)} className="bg-white"/>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label className="text-[#003594] font-semibold">To Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal bg-white border-[#003594] text-[#003594] hover:bg-[#003594] hover:text-white">
                      <CalendarIcon className="mr-2 h-4 w-4"/>
                      {endDate ? format(endDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-white">
                    <Calendar value={endDate} onChange={(date: Date | null) => date && setEndDate(date)} className="bg-white"/>
                  </PopoverContent>
                </Popover>
              </div>
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
