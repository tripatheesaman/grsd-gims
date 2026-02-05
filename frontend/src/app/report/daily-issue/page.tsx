'use client';
import { useState, useEffect, useCallback } from 'react';
import { DailyIssueReport } from '@/components/reports/DailyIssueReport';
import { addDays } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
interface Issue {
    issue_slip_number: string;
    issue_date: string;
    part_number: string;
    issued_for: string;
    issued_by: {
        name: string;
        staffId: string;
    };
    issue_quantity: number;
    issue_cost: number;
    remaining_balance: number;
    item_name: string;
}
export default function DailyIssuePage() {
    const [issues, setIssues] = useState<Issue[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const itemsPerPage = 10;
    const [fromDate, setFromDate] = useState<Date>(new Date());
    const [toDate, setToDate] = useState<Date>(addDays(new Date(), 7));
    const fetchIssues = useCallback(async (page: number) => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/report/dailyissue?page=${page}&limit=${itemsPerPage}&fromDate=${fromDate.toISOString()}&toDate=${toDate.toISOString()}`);
            if (!response.ok) {
                throw new Error('Failed to fetch issues');
            }
            const data = await response.json();
            setIssues(data.issues);
            setTotalItems(data.total);
        }
        catch {
        }
        finally {
            setIsLoading(false);
        }
    }, [fromDate, toDate, itemsPerPage]);
    useEffect(() => {
        fetchIssues(currentPage);
    }, [currentPage, fetchIssues]);
    const handlePageChange = (page: number) => {
        setCurrentPage(page);
    };
    return (<div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-[#003594]">Daily Issue Report</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">From:</span>
            <Calendar value={fromDate} onChange={(date) => date && setFromDate(date)} className="w-[200px]"/>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">To:</span>
            <Calendar value={toDate} onChange={(date) => date && setToDate(date)} className="w-[200px]"/>
          </div>
        </div>
      </div>

      <DailyIssueReport issues={issues} currentPage={currentPage} totalItems={totalItems} itemsPerPage={itemsPerPage} onPageChange={handlePageChange} isLoading={isLoading} fromDate={fromDate} toDate={toDate}/>
    </div>);
}
