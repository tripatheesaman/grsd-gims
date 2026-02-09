'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { API } from '@/lib/api';
import { withBasePath } from '@/lib/urls';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Spinner, ContentSpinner } from '@/components/ui/spinner';
export default function WeeklyDieselReportPage() {
    const [startDate, setStartDate] = useState<Date>(new Date());
    const [endDate, setEndDate] = useState<Date>(new Date());
    const [isLoading, setIsLoading] = useState(false);
    const [showFlightDialog, setShowFlightDialog] = useState(false);
    const [flightCount, setFlightCount] = useState<number>(0);
    const [pendingReportMode, setPendingReportMode] = useState<'plain' | 'charts' | null>(null);
    const { toast } = useToast();
    const handleGenerateReport = async () => {
        if (!startDate || !endDate) {
            toast({
                title: 'Error',
                description: 'Please select both start and end dates',
                variant: 'destructive',
            });
            return;
        }
        setIsLoading(true);
        try {
            const checkResponse = await API.get('/api/fuel/reports/diesel/weekly/check', {
                params: {
                    start_date: format(startDate, 'yyyy-MM-dd'),
                    end_date: format(endDate, 'yyyy-MM-dd')
                }
            });
            if (checkResponse.data.has_flight_count) {
                await generateReport();
            }
            else {
                setPendingReportMode('plain');
                setShowFlightDialog(true);
            }
        }
        catch (error: unknown) {
            let errorMessage = 'Failed to check flight count';
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
    const handleGenerateReportWithCharts = async () => {
        if (!startDate || !endDate) {
            toast({
                title: 'Error',
                description: 'Please select both start and end dates',
                variant: 'destructive',
            });
            return;
        }
        setIsLoading(true);
        try {
            const checkResponse = await API.get('/api/fuel/reports/diesel/weekly/check', {
                params: {
                    start_date: format(startDate, 'yyyy-MM-dd'),
                    end_date: format(endDate, 'yyyy-MM-dd')
                }
            });
            if (checkResponse.data.has_flight_count) {
                await generateReportWithCharts();
            }
            else {
                setPendingReportMode('charts');
                setShowFlightDialog(true);
            }
        }
        catch (error: unknown) {
            let errorMessage = 'Failed to check flight count';
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
    const generateReport = async (flightCount?: number) => {
        try {
            const response = await API.get('/api/fuel/reports/diesel/weekly', {
                params: {
                    start_date: format(startDate, 'yyyy-MM-dd'),
                    end_date: format(endDate, 'yyyy-MM-dd'),
                    flight_count: flightCount
                },
                responseType: 'blob'
            });
            const blob = new Blob([response.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const fileName = `diesel_report_${format(startDate, 'yyyy-MM-dd')}_to_${format(endDate, 'yyyy-MM-dd')}.xlsx`;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast({
                title: 'Success',
                description: 'Report downloaded successfully',
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
    };
    const generateReportWithCharts = async (flightCount?: number) => {
        try {
            const reportRes = await API.get('/api/fuel/reports/diesel/weekly', {
                params: {
                  start_date: format(startDate, 'yyyy-MM-dd'),
                  end_date: format(endDate, 'yyyy-MM-dd'),
                  flight_count: flightCount,
                },
                responseType: 'arraybuffer',
              });
            const summaryRes = await API.get('/api/fuel/reports/diesel/weekly/summary', {
                params: {
                    start_date: format(startDate, 'yyyy-MM-dd'),
                    end_date: format(endDate, 'yyyy-MM-dd'),
                },
            });
            const reportBytes = new Uint8Array(reportRes.data as ArrayBuffer);
            let binary = '';
            for (let i = 0; i < reportBytes.length; i += 1) {
                binary += String.fromCharCode(reportBytes[i]);
            }
            const reportBase64 = btoa(binary);
            const token = localStorage.getItem('token') || '';
            if (!token) {
                throw new Error('Authentication token not found. Please log in again.');
            }
            const response = await fetch(withBasePath('/api/reports/fuel/diesel/weekly/excel-with-charts'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                credentials: 'include',
                body: JSON.stringify({
                    ...summaryRes.data,
                    reportBase64,
                    start_date: format(startDate, 'yyyy-MM-dd'),
                    end_date: format(endDate, 'yyyy-MM-dd'),
                    flight_count: flightCount,
                    token,
                }),
            });
            if (!response.ok) {
                const errorBody = await response.json().catch(() => null);
                throw new Error(errorBody?.message || 'Failed to generate report with charts');
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const fileName = `diesel_report_with_charts_${format(startDate, 'yyyy-MM-dd')}_to_${format(endDate, 'yyyy-MM-dd')}.xlsx`;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast({
                title: 'Success',
                description: 'Report with charts downloaded successfully',
            });
        }
        catch (error: unknown) {
            let errorMessage = 'Failed to generate report with charts';
            if (error instanceof Error && error.message) {
                errorMessage = error.message;
            }
            toast({
                title: 'Error',
                description: errorMessage,
                variant: 'destructive',
            });
        }
    };
    const handleFlightCountSubmit = async () => {
        if (flightCount <= 0) {
            toast({
                title: 'Error',
                description: 'Please enter a valid flight count',
                variant: 'destructive',
            });
            return;
        }
        setShowFlightDialog(false);
        if (pendingReportMode === 'charts') {
            await generateReportWithCharts(flightCount);
        }
        else {
            await generateReport(flightCount);
        }
        setPendingReportMode(null);
    };
    return (<div className="container mx-auto py-10">
      <Card className="shadow-lg rounded-xl border border-gray-200 bg-white max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-[#003594]">Weekly Diesel Report</CardTitle>
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
            <div className="flex flex-col md:flex-row gap-3">
              <Button onClick={handleGenerateReport} disabled={isLoading} className="w-full md:w-1/2 bg-[#003594] text-white font-semibold hover:bg-[#d2293b] transition-colors">
                {isLoading ? <Spinner size="sm" variant="white" className="mr-2"/> : null}
                {isLoading ? 'Generating Report...' : 'Generate Detailed Report'}
              </Button>
              <Button type="button" variant="outline" onClick={handleGenerateReportWithCharts} className="w-full md:w-1/2 border-[#003594] text-[#003594] hover:bg-[#003594] hover:text-white transition-colors">
                Generate Report (with Charts)
              </Button>
            </div>
            {isLoading && <ContentSpinner />}
          </div>
        </CardContent>
      </Card>
      <Dialog open={showFlightDialog} onOpenChange={setShowFlightDialog}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle className="text-[#003594]">Enter Number of Flights</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label className="text-[#003594] font-semibold">Number of Flights</Label>
            <Input type="number" value={flightCount} onChange={(e) => setFlightCount(Number(e.target.value))} placeholder="Enter number of flights" min="0" className="bg-white border-[#003594]"/>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFlightDialog(false)} className="border-[#003594] text-[#003594] hover:bg-[#003594] hover:text-white">Cancel</Button>
            <Button onClick={handleFlightCountSubmit} className="bg-[#003594] text-white font-semibold hover:bg-[#d2293b] transition-colors">
              {isLoading ? <Spinner size="sm" variant="white" className="mr-2"/> : null}
              Generate Report
            </Button>
          </DialogFooter>
          {isLoading && <ContentSpinner />}
        </DialogContent>
      </Dialog>
    </div>);
}
