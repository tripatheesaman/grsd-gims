'use client';
import { useState, useEffect, useCallback } from 'react';
import { API } from '@/lib/api';
interface DateDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    date: string;
    type: 'issues' | 'requests' | 'receives' | 'rrps';
}
interface IssueItem {
    id: number;
    nac_code: string;
    item_name: string;
    quantity?: number;
    issue_quantity?: number;
    issue_date: string;
    issued_by: string | {
        name: string;
        staffId: string;
    };
    issued_for: string;
    remaining_balance: number;
}
interface RequestItem {
    id: number;
    request_number: string;
    request_date: string;
    requested_by: string;
    part_number: string;
    item_name: string;
    equipment_number: string;
    requested_quantity: number;
    approval_status: string;
    nac_code: string;
    unit: string;
}
interface ReceiveItem {
    id: number;
    receive_date: string;
    received_quantity: number;
    received_by: string;
    approval_status: string;
    item_name: string;
    nac_code: string;
    part_number: string;
    unit: string;
    request_number: string;
    request_date: string;
    requested_by: string;
    equipment_number: string;
}
interface RRPItem {
    id: number;
    rrp_number: string;
    rrp_date: string;
    supplier_name: string;
    currency: string;
    forex_rate: number;
    invoice_number: string;
    invoice_date: string;
    po_number: string;
    airway_bill_number: string;
    approval_status: string;
    created_by: string;
    item_name: string;
    nac_code: string;
    part_number: string;
    received_quantity: number;
    unit: string;
    request_number: string;
    request_date: string;
    requested_by: string;
    equipment_number: string;
}
export function DateDetailModal({ isOpen, onClose, date, type }: DateDetailModalProps) {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<(IssueItem | RequestItem | ReceiveItem | RRPItem)[]>([]);
    const [error, setError] = useState<string | null>(null);
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            let response;
            const formattedDate = new Date(date).toISOString().split('T')[0];
            switch (type) {
                case 'issues':
                    response = await API.get('/api/report/dailyissue', {
                        params: {
                            fromDate: formattedDate,
                            toDate: formattedDate,
                            page: 1,
                            limit: 1000
                        }
                    });
                    setData(response.data?.issues || []);
                    break;
                case 'requests':
                    response = await API.get('/api/report/daily/request/details', {
                        params: {
                            fromDate: formattedDate,
                            toDate: formattedDate
                        }
                    });
                    setData(response.data || []);
                    break;
                case 'receives':
                    response = await API.get('/api/report/daily/receive/details', {
                        params: {
                            fromDate: formattedDate,
                            toDate: formattedDate
                        }
                    });
                    setData(response.data || []);
                    break;
                case 'rrps':
                    response = await API.get('/api/report/daily/rrp/details', {
                        params: {
                            fromDate: formattedDate,
                            toDate: formattedDate
                        }
                    });
                    setData(response.data || []);
                    break;
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load data');
        }
        finally {
            setLoading(false);
        }
    }, [date, type]);
    useEffect(() => {
        if (isOpen && date) {
            fetchData();
        }
    }, [isOpen, date, fetchData]);
    const getTitle = () => {
        const typeNames = {
            issues: 'Issues',
            requests: 'Requests',
            receives: 'Receives',
            rrps: 'RRPs'
        };
        return `${typeNames[type]} for ${new Date(date).toLocaleDateString()}`;
    };
    const renderIssuesTable = () => (<div className="overflow-x-auto overflow-y-visible">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b">
						<th className="text-left p-2">NAC Code</th>
						<th className="text-left p-2">Item Name</th>
						<th className="text-right p-2">Quantity</th>
						<th className="text-left p-2">Issued By</th>
						<th className="text-left p-2">Issued For</th>
						<th className="text-right p-2">Remaining</th>
					</tr>
				</thead>
				<tbody>
					{(data as IssueItem[]).map((item, index) => (<tr key={`issue-${item.id || index}-${item.nac_code || index}`} className="border-b hover:bg-gray-50">
							<td className="p-2 font-medium">{item.nac_code}</td>
							<td className="p-2">{item.item_name}</td>
							<td className="p-2 text-right">{item.issue_quantity || item.quantity || 0}</td> 
							<td className="p-2">
								{typeof item.issued_by === 'object' && item.issued_by !== null
                ? (item.issued_by as {
                    name: string;
                    staffId: string;
                }).name || 'Unknown'
                : item.issued_by || 'Unknown'}
							</td>
							<td className="p-2">{item.issued_for}</td>
							<td className="p-2 text-right">{item.remaining_balance}</td>
						</tr>))}
				</tbody>
			</table>
		</div>);
    const renderRequestsTable = () => (<div className="overflow-x-auto overflow-y-visible">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b">
						<th className="text-left p-2">Request #</th>
						<th className="text-left p-2">Item Name</th>
						<th className="text-left p-2">NAC Code</th>
						<th className="text-right p-2">Quantity</th>
						<th className="text-left p-2">Requested By</th>
						<th className="text-left p-2">Date</th>
						<th className="text-left p-2">Status</th>
					</tr>
				</thead>
				<tbody>
					{(data as RequestItem[]).map((item, index) => (<tr key={`request-${item.id || index}-${item.request_number || index}`} className="border-b hover:bg-gray-50">
							<td className="p-2 font-medium">{item.request_number}</td>
							<td className="p-2">{item.item_name}</td>
							<td className="p-2">{item.nac_code}</td>
							<td className="p-2 text-right">{item.requested_quantity} {item.unit}</td>
							<td className="p-2">{item.requested_by}</td>
							<td className="p-2">{new Date(item.request_date).toLocaleDateString()}</td>
							<td className="p-2">
								<span className={`px-2 py-1 rounded text-xs ${item.approval_status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                item.approval_status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'}`}>
									{item.approval_status}
								</span>
							</td>
						</tr>))}
				</tbody>
			</table>
		</div>);
    const renderReceivesTable = () => (<div className="overflow-x-auto overflow-y-visible">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b">
						<th className="text-left p-2">Request #</th>
						<th className="text-left p-2">Item Name</th>
						<th className="text-left p-2">NAC Code</th>
						<th className="text-right p-2">Quantity</th>
						<th className="text-left p-2">Received By</th>
						<th className="text-left p-2">Date</th>
						<th className="text-left p-2">Status</th>
					</tr>
				</thead>
				<tbody>
					{(data as ReceiveItem[]).map((item, index) => (<tr key={`receive-${item.id || index}-${item.request_number || index}`} className="border-b hover:bg-gray-50">
							<td className="p-2 font-medium">{item.request_number}</td>
							<td className="p-2">{item.item_name}</td>
							<td className="p-2">{item.nac_code}</td>
							<td className="p-2 text-right">{item.received_quantity} {item.unit}</td>
							<td className="p-2">{item.received_by}</td>
							<td className="p-2">{new Date(item.receive_date).toLocaleDateString()}</td>
							<td className="p-2">
								<span className={`px-2 py-1 rounded text-xs ${item.approval_status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                item.approval_status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'}`}>
									{item.approval_status}
								</span>
							</td>
						</tr>))}
				</tbody>
			</table>
		</div>);
    const renderRRPsTable = () => (<div className="overflow-x-auto overflow-y-visible">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b">
						<th className="text-left p-2">RRP #</th>
						<th className="text-left p-2">Item Name</th>
						<th className="text-left p-2">NAC Code</th>
						<th className="text-right p-2">Quantity</th>
						<th className="text-left p-2">Supplier</th>
						<th className="text-left p-2">Date</th>
						<th className="text-left p-2">Status</th>
					</tr>
				</thead>
				<tbody>
					{(data as RRPItem[]).map((item, index) => (<tr key={`rrp-${item.id || index}-${item.rrp_number || index}`} className="border-b hover:bg-gray-50">
							<td className="p-2 font-medium">{item.rrp_number}</td>
							<td className="p-2">{item.item_name}</td>
							<td className="p-2">{item.nac_code}</td>
							<td className="p-2 text-right">{item.received_quantity} {item.unit}</td>
							<td className="p-2">{item.supplier_name}</td>
							<td className="p-2">{new Date(item.rrp_date).toLocaleDateString()}</td>
							<td className="p-2">
								<span className={`px-2 py-1 rounded text-xs ${item.approval_status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                item.approval_status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'}`}>
									{item.approval_status}
								</span>
							</td>
						</tr>))}
				</tbody>
			</table>
		</div>);
    const renderTable = () => {
        switch (type) {
            case 'issues':
                return renderIssuesTable();
            case 'requests':
                return renderRequestsTable();
            case 'receives':
                return renderReceivesTable();
            case 'rrps':
                return renderRRPsTable();
            default:
                return null;
        }
    };
    if (!isOpen)
        return null;
    return (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
			<div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
				<div className="flex items-center justify-between p-6 border-b">
					<h2 className="text-xl font-semibold text-gray-900">{getTitle()}</h2>
					<button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
						<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
						</svg>
					</button>
				</div>
				
				<div className="flex-1 overflow-hidden">
					{loading ? (<div className="flex items-center justify-center h-64">
							<div className="text-center">
								<div className="animate-spin rounded-full h-8 w-8 border-3 border-[#003594] border-t-transparent mx-auto mb-2"></div>
								<div className="text-sm text-gray-600">Loading data...</div>
							</div>
						</div>) : error ? (<div className="flex items-center justify-center h-64">
							<div className="text-center">
								<div className="text-red-500 mb-2">⚠️</div>
								<div className="text-sm text-red-600">{error}</div>
								<button onClick={fetchData} className="mt-2 text-xs text-[#003594] hover:underline">
									Try again
								</button>
							</div>
						</div>) : data.length === 0 ? (<div className="flex items-center justify-center h-64">
							<div className="text-center">
								<div className="text-gray-400 mb-2">📊</div>
								<div className="text-sm text-gray-600">No data found for this date</div>
							</div>
						</div>) : (<div className="p-6 overflow-y-auto h-full max-h-[60vh] scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
							<div className="mb-4 text-sm text-gray-600">
								Found {data.length} {type === 'issues' ? 'items' : type} for this date
							</div>
							{renderTable()}
						</div>)}
				</div>
			</div>
		</div>);
}
