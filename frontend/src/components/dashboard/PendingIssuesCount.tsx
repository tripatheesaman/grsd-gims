'use client';
import { useEffect, useState, useCallback } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { API } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { FileText, Eye, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalTrigger, } from '@/components/ui/modal';
import { useCustomToast } from '@/components/ui/custom-toast';
interface PendingIssue {
    id: number;
    nac_code: string;
    part_number: string;
    issue_quantity: number;
    issue_cost: number;
    remaining_balance: number;
    issue_slip_number: string;
    issue_date: string;
    issued_by: {
        name: string;
        staffId: string;
    };
    issued_for: string;
    item_name: string;
    items?: PendingIssue[];
}
export function PendingIssuesCount() {
    const { permissions, user } = useAuthContext();
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [pendingCount, setPendingCount] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isRejectOpen, setIsRejectOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [pendingIssues, setPendingIssues] = useState<PendingIssue[]>([]);
    const [selectedIssue, setSelectedIssue] = useState<PendingIssue | null>(null);
    const [editingItem, setEditingItem] = useState<{
        id: number;
        quantity: number;
    } | null>(null);
    const [editQuantity, setEditQuantity] = useState('');
    const fetchPendingCount = useCallback(async () => {
        if (!permissions?.includes('can_approve_issues')) {
            setIsLoading(false);
            return;
        }
        try {
            const response = await API.get('/api/issue/pending');
            const nonFuelIssues = response.data.issues.filter((issue: PendingIssue) => issue.nac_code !== 'GT 07986' && issue.nac_code !== 'GT 00000');
            const groupedIssues = nonFuelIssues.reduce((acc: {
                [key: string]: PendingIssue[];
            }, curr: PendingIssue) => {
                if (!acc[curr.issue_slip_number]) {
                    acc[curr.issue_slip_number] = [];
                }
                acc[curr.issue_slip_number].push(curr);
                return acc;
            }, {});
            const uniqueIssues = (Object.entries(groupedIssues) as [
                string,
                PendingIssue[]
            ][]).map(([, items]) => ({
                ...items[0],
                items: items
            }));
            setPendingIssues(uniqueIssues);
            setPendingCount(uniqueIssues.length);
        }
        catch {
        }
        finally {
            setIsLoading(false);
        }
    }, [permissions]);
    useEffect(() => {
        fetchPendingCount();
    }, [fetchPendingCount]);
    useEffect(() => {
        if (isDetailsOpen || isEditOpen || isRejectOpen)
            return;
        const interval = setInterval(() => {
            fetchPendingCount();
        }, 30000);
        return () => clearInterval(interval);
    }, [fetchPendingCount, isDetailsOpen, isEditOpen, isRejectOpen]);
    const handleViewDetails = async (issueSlipNumber: string) => {
        const issue = pendingIssues.find(issue => issue.issue_slip_number === issueSlipNumber);
        if (issue) {
            setSelectedIssue(issue);
            setIsDetailsOpen(true);
        }
    };
    const handleApproveIssue = async () => {
        if (!selectedIssue?.items)
            return;
        try {
            const itemIds = selectedIssue.items.map(item => item.id);
            const response = await API.put(`/api/issue/approve`, {
                itemIds,
                approvedBy: user?.UserInfo?.username
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: "Success",
                    message: "Issue approved successfully",
                    duration: 3000,
                });
                await fetchPendingCount();
                setIsDetailsOpen(false);
            }
            else {
                throw new Error(response.data?.message || 'Failed to approve issue');
            }
        }
        catch (error) {
            showErrorToast({
                title: "Error",
                message: error instanceof Error ? error.message : "Failed to approve issue",
                duration: 5000,
            });
        }
    };
    const handleRejectClick = () => {
        setIsRejectOpen(true);
    };
    const handleRejectIssue = async () => {
        if (!selectedIssue?.items)
            return;
        try {
            const itemIds = selectedIssue.items.map(item => item.id);
            const response = await API.put(`/api/issue/reject`, {
                itemIds,
                rejectedBy: user?.UserInfo?.username
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: "Success",
                    message: "Issue rejected successfully",
                    duration: 3000,
                });
                await fetchPendingCount();
                setIsDetailsOpen(false);
                setIsRejectOpen(false);
            }
            else {
                throw new Error(response.data?.message || 'Failed to reject issue');
            }
        }
        catch (error) {
            showErrorToast({
                title: "Error",
                message: error instanceof Error ? error.message : "Failed to reject issue",
                duration: 5000,
            });
        }
    };
    const handleEditClick = (item: PendingIssue) => {
        setEditingItem({ id: item.id, quantity: item.issue_quantity });
        setEditQuantity(item.issue_quantity.toString());
        setIsEditOpen(true);
    };
    const handleDeleteItem = async (itemId: number) => {
        if (!selectedIssue)
            return;
        try {
            const response = await API.delete(`/api/issue/item/${itemId}`);
            if (response.status === 200) {
                showSuccessToast({
                    title: "Success",
                    message: "Item deleted successfully",
                    duration: 3000,
                });
                await fetchPendingCount();
            }
        }
        catch (error) {
            showErrorToast({
                title: "Error",
                message: error instanceof Error ? error.message : "Failed to delete item",
                duration: 5000,
            });
        }
    };
    const handleUpdateQuantity = async () => {
        if (!editingItem || !editQuantity.trim() || !selectedIssue)
            return;
        const newQuantity = parseInt(editQuantity);
        if (isNaN(newQuantity) || newQuantity <= 0) {
            showErrorToast({
                title: "Error",
                message: "Please enter a valid quantity",
                duration: 3000,
            });
            return;
        }
        try {
            const response = await API.put(`/api/issue/item/${editingItem.id}`, {
                quantity: newQuantity
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: "Success",
                    message: "Quantity updated successfully",
                    duration: 3000,
                });
                await fetchPendingCount();
                setIsEditOpen(false);
                setEditingItem(null);
                setEditQuantity('');
            }
        }
        catch (error) {
            showErrorToast({
                title: "Error",
                message: error instanceof Error ? error.message : "Failed to update quantity",
                duration: 5000,
            });
        }
    };
    if (!permissions?.includes('can_approve_issues')) {
        return null;
    }
    if (isLoading) {
        return (<div className="flex items-center justify-center h-24">
        <div className="animate-spin rounded-full h-8 w-8 border-3 border-[#003594] border-t-transparent"></div>
      </div>);
    }
    return (<>
      <Modal open={isOpen} onOpenChange={setIsOpen}>
        <ModalTrigger asChild>
          <Card className="cursor-pointer hover:bg-[#003594]/5 transition-colors border-[#002a6e]/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base font-semibold text-[#003594]">Pending Spares</CardTitle>
              <FileText className="h-5 w-5 text-[#003594]"/>
            </CardHeader>
            <CardContent>
              {isLoading ? (<div className="text-3xl font-bold text-[#003594]">...</div>) : (<div className="text-3xl font-bold text-[#003594]">{pendingCount ?? 0}</div>)}
              <p className="text-sm text-gray-500 mt-1">Spares awaiting approval</p>
            </CardContent>
          </Card>
        </ModalTrigger>
        <ModalContent className="max-w-4xl bg-white rounded-xl shadow-xl border-[#002a6e]/10">
          <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
            <ModalTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
              Pending Spares
            </ModalTitle>
            <ModalDescription className="text-gray-600 mt-2">
              You have {pendingCount ?? 0} pending spare{pendingCount !== 1 ? 's' : ''} that need your attention.
            </ModalDescription>
          </ModalHeader>
          <div className="mt-6 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {pendingIssues.map((issue) => (<div key={issue.id} className="rounded-lg border border-[#002a6e]/10 p-6 hover:bg-[#003594]/5 transition-all duration-200 hover:shadow-md">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[#003594]">Issue Slip #</p>
                  <p className="text-lg font-semibold text-gray-900">{issue.issue_slip_number}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[#003594]">Issue Date</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {new Date(issue.issue_date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[#003594]">Item</p>
                  <p className="text-lg font-semibold text-gray-900">{issue.item_name}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-[#003594]">Issued By</p>
                  <p className="text-lg font-semibold text-gray-900">{issue.issued_by.name}</p>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => handleViewDetails(issue.issue_slip_number)} className="flex items-center gap-2 bg-[#003594] hover:bg-[#003594]/90 text-white transition-colors">
                    <Eye className="h-4 w-4"/>
                    View Details
                  </Button>
                </div>
              </div>))}
          </div>
        </ModalContent>
      </Modal>

      <Modal open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <ModalContent className="max-w-[95vw] md:max-w-6xl bg-white rounded-xl shadow-xl border-[#002a6e]/10 h-[90vh] flex flex-col">
          <ModalHeader className="border-b border-[#002a6e]/10 pb-4 flex-shrink-0">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="min-w-0 flex-1">
                <ModalTitle className="text-xl md:text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent break-words">
                  Issue Details #{selectedIssue?.issue_slip_number}
                </ModalTitle>
                <div className="mt-2 text-gray-600 space-y-2">
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4">
                    <span className="break-words">Issued By: {selectedIssue?.issued_by.name}</span>
                    <span className="hidden md:block h-1 w-1 rounded-full bg-gray-400 flex-shrink-0"></span>
                    <span className="break-words">Staff ID: {selectedIssue?.issued_by.staffId}</span>
                  </div>
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4">
                    <span className="break-words">Issue Date: {selectedIssue?.issue_date ? new Date(selectedIssue.issue_date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }) : 'N/A'}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto flex-shrink-0">
                <Button variant="default" size="sm" className="flex-1 md:flex-none flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white transition-colors" onClick={handleApproveIssue}>
                  <Check className="h-4 w-4"/>
                  <span className="hidden sm:inline">Approve</span>
                </Button>
                <Button variant="destructive" size="sm" className="flex-1 md:flex-none flex items-center gap-2 bg-[#d2293b] hover:bg-[#d2293b]/90 transition-colors" onClick={handleRejectClick}>
                  <X className="h-4 w-4"/>
                  <span className="hidden sm:inline">Reject</span>
                </Button>
              </div>
            </div>
          </ModalHeader>
          <div className="flex-1 overflow-hidden mt-6">
            <div className="h-full overflow-auto rounded-lg border border-[#002a6e]/10">
              <table className="w-full">
                <thead className="bg-[#003594]/5 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider whitespace-nowrap">Item Name</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider whitespace-nowrap">Part Number</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider whitespace-nowrap">NAC Code</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider whitespace-nowrap">Quantity</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider whitespace-nowrap">Cost</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider whitespace-nowrap">Balance</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider whitespace-nowrap">Issued For</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-[#002a6e]/10">
                  {selectedIssue?.items?.map((item) => (<tr key={item.id} className="hover:bg-[#003594]/5 transition-colors">
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 max-w-[200px] truncate" title={item.item_name}>
                        {item.item_name}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 max-w-[150px] truncate" title={item.part_number}>
                        {item.part_number}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 max-w-[120px] truncate" title={item.nac_code}>
                        {item.nac_code}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.issue_quantity}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                        NPR {item.issue_cost.toFixed(2)}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.remaining_balance}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 max-w-[150px] truncate" title={item.issued_for}>
                        {item.issued_for}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="sm" className="flex items-center gap-1 text-[#003594] hover:bg-[#003594]/10 h-8 px-2" onClick={() => handleEditClick(item)}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                            </svg>
                            <span className="hidden sm:inline">Edit</span>
                          </Button>
                          <Button variant="outline" size="sm" className="flex items-center gap-1 text-[#d2293b] hover:bg-[#d2293b]/10 h-8 px-2" onClick={() => handleDeleteItem(item.id)}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18"/>
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                            </svg>
                            <span className="hidden sm:inline">Delete</span>
                          </Button>
                        </div>
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          </div>
        </ModalContent>
      </Modal>

      <Modal open={isEditOpen} onOpenChange={setIsEditOpen}>
        <ModalContent className="max-w-md bg-white rounded-xl shadow-xl border-[#002a6e]/10">
          <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
            <ModalTitle className="text-xl font-bold text-[#003594]">Edit Quantity</ModalTitle>
            <ModalDescription className="text-gray-600 mt-2">
              Update the quantity for this item.
            </ModalDescription>
          </ModalHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#003594]">Quantity</label>
              <input type="number" value={editQuantity} onChange={(e) => setEditQuantity(e.target.value)} className="w-full p-3 rounded-lg border border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20 transition-colors" min="1" placeholder="Enter quantity..."/>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => {
            setIsEditOpen(false);
            setEditingItem(null);
            setEditQuantity('');
        }} className="border-[#002a6e]/10 hover:bg-gray-50">
              Cancel
            </Button>
            <Button onClick={handleUpdateQuantity} className="bg-[#003594] hover:bg-[#003594]/90 text-white transition-colors">
              Update Quantity
            </Button>
          </div>
        </ModalContent>
      </Modal>

      <Modal open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <ModalContent className="max-w-md bg-white rounded-xl shadow-xl border-[#002a6e]/10">
          <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
            <ModalTitle className="text-xl font-bold text-[#003594]">Reject Issue</ModalTitle>
            <ModalDescription className="text-gray-600 mt-2">
              Are you sure you want to reject this issue?
            </ModalDescription>
          </ModalHeader>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsRejectOpen(false)} className="border-[#002a6e]/10 hover:bg-gray-50">
              Cancel
            </Button>
            <Button onClick={handleRejectIssue} className="bg-[#d2293b] hover:bg-[#d2293b]/90 text-white transition-colors">
              Reject Issue
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </>);
}
