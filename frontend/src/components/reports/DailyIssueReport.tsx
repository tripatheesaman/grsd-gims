'use client';
import { format, startOfDay } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Download, ChevronLeft, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { API } from '@/lib/api';
export interface Issue {
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
interface DailyIssueReportProps {
    issues: Issue[];
    currentPage: number;
    totalItems: number;
    itemsPerPage: number;
    onPageChange: (page: number) => void;
    isLoading: boolean;
    fromDate: Date;
    toDate: Date;
    equipmentNumber?: string;
    partNumber?: string;
    nacCode?: string;
}
export function DailyIssueReport({ issues, currentPage, totalItems, itemsPerPage, onPageChange, isLoading, fromDate, toDate, equipmentNumber, partNumber, nacCode }: DailyIssueReportProps) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const handleExportToExcel = async () => {
        try {
            const formattedFromDate = format(startOfDay(fromDate), 'yyyy-MM-dd');
            const formattedToDate = format(startOfDay(toDate), 'yyyy-MM-dd');
            const response = await API.post('/api/report/dailyissue/export', {
                fromDate: formattedFromDate,
                toDate: formattedToDate,
                equipmentNumber: equipmentNumber || undefined,
                partNumber: partNumber || undefined,
                nacCode: nacCode || undefined
            });
            if (response.status !== 200)
                throw new Error('Failed to fetch data for export');
            const excelData = response.data.issues.map((issue: Issue) => ({
                'Issue Slip Number': issue.issue_slip_number,
                'Issue Date': format(startOfDay(new Date(issue.issue_date)), 'yyyy-MM-dd'),
                'Item Name': issue.item_name,
                'Part Number': issue.part_number,
                'Issued For': issue.issued_for,
                'Issued By': issue.issued_by.name,
                'Staff ID': issue.issued_by.staffId,
                'Quantity': issue.issue_quantity,
                'Cost': issue.issue_cost.toFixed(2),
                'Remaining Balance': issue.remaining_balance
            }));
            const ws = XLSX.utils.json_to_sheet(excelData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Daily Issue Report');
            XLSX.writeFile(wb, 'daily_issue_report.xlsx');
        }
        catch {
        }
    };
    return (<div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-[#003594]">Daily Issue Report</h2>
        <Button onClick={handleExportToExcel} className="bg-[#003594] hover:bg-[#003594]/90 text-white">
          <Download className="h-4 w-4 mr-2"/>
          Export to Excel
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-[#002a6e]/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#003594]/5">
                <th className="px-6 py-3 text-left text-sm font-semibold text-[#003594]">Issue Slip</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-[#003594]">Date</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-[#003594]">Item Name</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-[#003594]">Part Number</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-[#003594]">Issued For</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-[#003594]">Issued By</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-[#003594]">Quantity</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-[#003594]">Cost</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-[#003594]">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#002a6e]/10">
              {isLoading ? (<tr>
                  <td colSpan={9} className="px-6 py-4 text-center text-gray-500">
                    Loading...
                  </td>
                </tr>) : issues.length === 0 ? (<tr>
                  <td colSpan={9} className="px-6 py-4 text-center text-gray-500">
                    No issues found
                  </td>
                </tr>) : (issues.map((issue, index) => (<tr key={`${issue.issue_slip_number}-${index}`} className="hover:bg-[#003594]/5">
                    <td className="px-6 py-4 text-sm text-gray-900">{issue.issue_slip_number}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {format(startOfDay(new Date(issue.issue_date)), 'yyyy-MM-dd')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{issue.item_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{issue.part_number}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{issue.issued_for}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{issue.issued_by.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{issue.issue_quantity}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">NPR {issue.issue_cost.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{issue.remaining_balance}</td>
                  </tr>)))}
            </tbody>
          </table>
        </div>
      </div>

      
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-700">
          Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} entries
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1 || isLoading} className="border-[#002a6e]/10 hover:bg-[#003594]/5">
            <ChevronLeft className="h-4 w-4"/>
          </Button>
          <span className="text-sm text-gray-700">
            Page {currentPage} of {totalPages}
          </span>
          <Button variant="outline" size="sm" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages || isLoading} className="border-[#002a6e]/10 hover:bg-[#003594]/5">
            <ChevronRight className="h-4 w-4"/>
          </Button>
        </div>
      </div>
    </div>);
}
