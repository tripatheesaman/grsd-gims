'use client';
import { useState } from 'react';
import { API } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger, } from '@/components/ui/popover';
import { format, startOfDay } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/utils/utils';
import { DailyIssueReport, Issue } from '@/components/reports/DailyIssueReport';
export default function DailyIssueReportPage() {
    const { toast } = useToast();
    const [fromDate, setFromDate] = useState<Date>();
    const [toDate, setToDate] = useState<Date>();
    const [equipmentNumber, setEquipmentNumber] = useState('');
    const [partNumber, setPartNumber] = useState('');
    const [nacCode, setNacCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [totalItems, setTotalItems] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const [issues, setIssues] = useState<Issue[]>([]);
    const fetchIssues = async (page: number) => {
        if (!fromDate || !toDate)
            return;
        try {
            setIsLoading(true);
            const formattedFromDate = format(startOfDay(fromDate), 'yyyy-MM-dd');
            const formattedToDate = format(startOfDay(toDate), 'yyyy-MM-dd');
            const response = await API.get('/api/report/dailyissue', {
                params: {
                    fromDate: formattedFromDate,
                    toDate: formattedToDate,
                    equipmentNumber: equipmentNumber || undefined,
                    partNumber: partNumber || undefined,
                    nacCode: nacCode || undefined,
                    page,
                    limit: itemsPerPage
                }
            });
            if (response.status === 200) {
                setIssues(response.data.issues);
                setTotalItems(response.data.total);
                setCurrentPage(page);
            }
        }
        catch {
            toast({
                title: "Error",
                description: "Failed to generate report",
                variant: "destructive",
                duration: 3000,
            });
        }
        finally {
            setIsLoading(false);
        }
    };
    const handleGenerateReport = async () => {
        if (!fromDate || !toDate) {
            toast({
                title: "Error",
                description: "Please select both from and to dates",
                variant: "destructive",
                duration: 3000,
            });
            return;
        }
        await fetchIssues(1);
    };
    const handlePageChange = async (page: number) => {
        await fetchIssues(page);
    };
    return (<div className="container mx-auto p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
          Daily Issue Report
        </h1>
        
        <div className="space-y-6 bg-white p-6 rounded-lg shadow-sm border border-[#002a6e]/10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="fromDate">From Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !fromDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4"/>
                    {fromDate ? format(fromDate, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar value={fromDate} onChange={(date) => date && setFromDate(startOfDay(date))} className="rounded-md border"/>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="toDate">To Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !toDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4"/>
                    {toDate ? format(toDate, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar value={toDate} onChange={(date) => date && setToDate(startOfDay(date))} className="rounded-md border"/>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="equipmentNumber">Equipment Number (Optional)</Label>
              <Input id="equipmentNumber" value={equipmentNumber} onChange={(e) => setEquipmentNumber(e.target.value)} placeholder="Enter equipment number" className="w-full"/>
            </div>

            <div className="space-y-2">
              <Label htmlFor="partNumber">Part Number (Optional)</Label>
              <Input id="partNumber" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} placeholder="Enter part number" className="w-full"/>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nacCode">NAC Code (Optional)</Label>
              <Input id="nacCode" value={nacCode} onChange={(e) => setNacCode(e.target.value)} placeholder="Enter NAC code" className="w-full"/>
            </div>
          </div>

          <Button onClick={handleGenerateReport} disabled={isLoading || !fromDate || !toDate} className="w-full bg-[#003594] hover:bg-[#003594]/90 text-white">
            {isLoading ? "Generating..." : "Generate Report"}
          </Button>
        </div>

        {issues.length > 0 && (<DailyIssueReport issues={issues} currentPage={currentPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onPageChange={handlePageChange} isLoading={isLoading} fromDate={fromDate || new Date()} toDate={toDate || new Date()} equipmentNumber={equipmentNumber} partNumber={partNumber} nacCode={nacCode}/>)}
      </div>
    </div>);
}
