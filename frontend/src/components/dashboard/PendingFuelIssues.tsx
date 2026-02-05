'use client';
import { useEffect, useState, useCallback } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { API } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { Fuel, Eye, X, Check, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription, ModalTrigger, } from '@/components/ui/modal';
import { useCustomToast } from '@/components/ui/custom-toast';
interface PendingFuelIssue {
    id: number;
    nac_code: string;
    issue_date: string;
    issue_quantity: number;
    issue_cost: number;
    remaining_balance: number;
    issue_slip_number: string;
    issued_by: {
        name: string;
        staffId: string;
    };
    issued_for: string;
    fuel_type?: string;
    fuel_rate?: number | string;
    previous_kilometers?: number | string;
    kilometers?: number | string;
    previous_issue_date?: string | null;
    items?: PendingFuelIssue[];
}
export function PendingFuelIssues() {
    const { permissions, user } = useAuthContext();
    const { showSuccessToast, showErrorToast } = useCustomToast();
    const [pendingCount, setPendingCount] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isRejectOpen, setIsRejectOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [pendingFuelIssues, setPendingFuelIssues] = useState<PendingFuelIssue[]>([]);
    const [selectedIssue, setSelectedIssue] = useState<PendingFuelIssue | null>(null);
    const [editingItem, setEditingItem] = useState<PendingFuelIssue | null>(null);
    const [editFormData, setEditFormData] = useState({
        fuel_rate: '',
        quantity: '',
        kilometers: ''
    });
    const fetchPendingFuelCount = useCallback(async () => {
        if (!permissions?.includes('can_approve_issues')) {
            setIsLoading(false);
            return;
        }
        try {
            const response = await API.get('/api/issue/pending/fuel');
            const groupedIssues = response.data.issues.reduce((acc: {
                [key: string]: PendingFuelIssue[];
            }, curr: PendingFuelIssue) => {
                if (!acc[curr.issue_slip_number]) {
                    acc[curr.issue_slip_number] = [];
                }
                acc[curr.issue_slip_number].push(curr);
                return acc;
            }, {});
            const uniqueIssues = (Object.entries(groupedIssues) as [
                string,
                PendingFuelIssue[]
            ][]).map(([, items]) => ({
                ...items[0],
                items: items
            }));
            setPendingFuelIssues(uniqueIssues);
            setPendingCount(uniqueIssues.length);
        }
        catch {
        }
        finally {
            setIsLoading(false);
        }
    }, [permissions]);
    useEffect(() => {
        fetchPendingFuelCount();
    }, [fetchPendingFuelCount]);
    useEffect(() => {
        if (isDetailsOpen || isEditOpen || isRejectOpen || isDeleteOpen)
            return;
        const interval = setInterval(() => {
            fetchPendingFuelCount();
        }, 30000);
        return () => clearInterval(interval);
    }, [fetchPendingFuelCount, isDetailsOpen, isEditOpen, isRejectOpen, isDeleteOpen]);
    const handleViewDetails = async (issueSlipNumber: string) => {
        const issue = pendingFuelIssues.find(issue => issue.issue_slip_number === issueSlipNumber);
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
                    message: "Fuel issue approved successfully",
                    duration: 3000,
                });
                await fetchPendingFuelCount();
                setIsDetailsOpen(false);
            }
            else {
                throw new Error(response.data?.message || 'Failed to approve fuel issue');
            }
        }
        catch (error) {
            showErrorToast({
                title: "Error",
                message: error instanceof Error ? error.message : "Failed to approve fuel issue",
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
                    message: "Fuel issue rejected successfully",
                    duration: 3000,
                });
                await fetchPendingFuelCount();
                setIsDetailsOpen(false);
                setIsRejectOpen(false);
            }
            else {
                throw new Error(response.data?.message || 'Failed to reject fuel issue');
            }
        }
        catch (error) {
            showErrorToast({
                title: "Error",
                message: error instanceof Error ? error.message : "Failed to reject fuel issue",
                duration: 5000,
            });
        }
    };
    const handleEditClick = (item: PendingFuelIssue) => {
        setEditingItem(item);
        setEditFormData({
            fuel_rate: item.fuel_rate?.toString() || '',
            quantity: item.issue_quantity?.toString() || '',
            kilometers: item.kilometers?.toString() || ''
        });
        setIsEditOpen(true);
    };
    const handleEditSubmit = async () => {
        if (!editingItem)
            return;
        try {
            const response = await API.put(`/api/issue/item/${editingItem.id}`, {
                fuel_rate: Number(editFormData.fuel_rate),
                quantity: Number(editFormData.quantity),
                kilometers: Number(editFormData.kilometers)
            });
            if (response.status === 200) {
                showSuccessToast({
                    title: "Success",
                    message: "Fuel issue updated successfully",
                    duration: 3000,
                });
                await fetchPendingFuelCount();
                if (selectedIssue && selectedIssue.id === editingItem.id) {
                    setIsDetailsOpen(false);
                    setSelectedIssue(null);
                }
                setIsEditOpen(false);
                setEditingItem(null);
                setEditFormData({ fuel_rate: '', quantity: '', kilometers: '' });
            }
            else {
                throw new Error(response.data?.message || 'Failed to update fuel issue');
            }
        }
        catch (error) {
            showErrorToast({
                title: "Error",
                message: error instanceof Error ? error.message : "Failed to update fuel issue",
                duration: 5000,
            });
        }
    };
    const handleDeleteClick = (item: PendingFuelIssue) => {
        setEditingItem(item);
        setIsDeleteOpen(true);
    };
    const handleDeleteSubmit = async () => {
        if (!editingItem)
            return;
        try {
            const response = await API.delete(`/api/issue/item/${editingItem.id}`);
            if (response.status === 200) {
                showSuccessToast({
                    title: "Success",
                    message: "Fuel issue deleted successfully",
                    duration: 3000,
                });
                await fetchPendingFuelCount();
                if (selectedIssue && selectedIssue.id === editingItem.id) {
                    setIsDetailsOpen(false);
                    setSelectedIssue(null);
                }
                setIsDeleteOpen(false);
                setEditingItem(null);
            }
            else {
                throw new Error(response.data?.message || 'Failed to delete fuel issue');
            }
        }
        catch (error) {
            showErrorToast({
                title: "Error",
                message: error instanceof Error ? error.message : "Failed to delete fuel issue",
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
              <CardTitle className="text-base font-semibold text-[#003594]">Pending Fuel</CardTitle>
              <Fuel className="h-5 w-5 text-[#003594]"/>
            </CardHeader>
            <CardContent>
              {isLoading ? (<div className="text-3xl font-bold text-[#003594]">...</div>) : (<div className="text-3xl font-bold text-[#003594]">{pendingCount ?? 0}</div>)}
              <p className="text-sm text-gray-500 mt-1">Fuel issues awaiting approval</p>
            </CardContent>
          </Card>
        </ModalTrigger>
        <ModalContent className="max-w-4xl bg-white rounded-xl shadow-xl border-[#002a6e]/10">
          <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
            <ModalTitle className="text-2xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
              Pending Fuel Issues
            </ModalTitle>
            <ModalDescription className="text-gray-600 mt-2">
              You have {pendingCount ?? 0} pending fuel issue{pendingCount !== 1 ? 's' : ''} that need your attention.
            </ModalDescription>
          </ModalHeader>
          <div className="mt-6 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {pendingFuelIssues.map((issue) => (<div key={issue.id} className="rounded-lg border border-[#002a6e]/10 p-6 hover:bg-[#003594]/5 transition-all duration-200 hover:shadow-md">
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
                  <p className="text-sm font-medium text-[#003594]">Fuel Type</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {issue.fuel_type || (issue.nac_code === 'GT 07986' ? 'Diesel' : 'Petrol')}
                  </p>
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
                  Fuel Issue Details #{selectedIssue?.issue_slip_number}
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
                                         <th className="px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider whitespace-nowrap">Fuel Type</th>
                     <th className="px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider whitespace-nowrap">Fuel Rate</th>
                     <th className="px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider whitespace-nowrap">Previous KM</th>
                     <th className="px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider whitespace-nowrap">Current KM</th>
                     <th className="px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider whitespace-nowrap">Quantity</th>
                     <th className="px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider whitespace-nowrap">Total Cost</th>
                     <th className="px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider whitespace-nowrap" title="Running balance after this issue">Remaining Balance</th>
                     <th className="px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider whitespace-nowrap">Issued For</th>
                     <th className="px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider whitespace-nowrap">NAC Code</th>
                     <th className="px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider whitespace-nowrap">Previous Issue Date</th>
                     <th className="px-3 py-3 text-left text-xs font-medium text-[#003594] uppercase tracking-wider whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-[#002a6e]/10">
                  {selectedIssue?.items
            ?.slice()
            .sort((a, b) => {
            const balanceA = typeof a.remaining_balance === 'number'
                ? a.remaining_balance
                : typeof a.remaining_balance === 'string' && !isNaN(Number(a.remaining_balance))
                    ? Number(a.remaining_balance)
                    : -Infinity;
            const balanceB = typeof b.remaining_balance === 'number'
                ? b.remaining_balance
                : typeof b.remaining_balance === 'string' && !isNaN(Number(b.remaining_balance))
                    ? Number(b.remaining_balance)
                    : -Infinity;
            return balanceB - balanceA;
        })
            .map((item) => (<tr key={item.id} className="hover:bg-[#003594]/5 transition-colors">
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.fuel_type || (item.nac_code === 'GT 07986' ? 'Diesel' : 'Petrol')}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                        NPR {typeof item.fuel_rate === 'number' ? item.fuel_rate.toFixed(2) :
                typeof item.fuel_rate === 'string' && !isNaN(Number(item.fuel_rate)) ? Number(item.fuel_rate).toFixed(2) : 'N/A'}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                        {typeof item.previous_kilometers === 'number' ? item.previous_kilometers :
                typeof item.previous_kilometers === 'string' && !isNaN(Number(item.previous_kilometers)) ? Number(item.previous_kilometers) : 'N/A'}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                        {typeof item.kilometers === 'number' ? item.kilometers :
                typeof item.kilometers === 'string' && !isNaN(Number(item.kilometers)) ? Number(item.kilometers) : 'N/A'}
                      </td>
                                             <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                         {item.issue_quantity}
                       </td>
                                                                       <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                          NPR {(() => {
                const rate = typeof item.fuel_rate === 'number' ? item.fuel_rate :
                    typeof item.fuel_rate === 'string' && !isNaN(Number(item.fuel_rate)) ? Number(item.fuel_rate) : 0;
                const qty = typeof item.issue_quantity === 'number' ? item.issue_quantity :
                    typeof item.issue_quantity === 'string' && !isNaN(Number(item.issue_quantity)) ? Number(item.issue_quantity) : 0;
                return rate > 0 && qty > 0 ? (rate * qty).toFixed(2) : 'N/A';
            })()}
                        </td>
                                                 <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                           {typeof item.remaining_balance === 'number' ? item.remaining_balance :
                typeof item.remaining_balance === 'string' && !isNaN(Number(item.remaining_balance)) ? Number(item.remaining_balance) : 'N/A'}
                         </td>
                        <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 max-w-[150px] truncate" title={item.issued_for}>
                          {item.issued_for}
                        </td>
                      <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 max-w-[120px] truncate" title={item.nac_code}>
                        {item.nac_code}
                      </td>
                                             <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                         {item.previous_issue_date ? new Date(item.previous_issue_date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            }) : 'N/A'}
                       </td>
                       <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                         <div className="flex items-center gap-2">
                           <Button variant="outline" size="sm" onClick={() => handleEditClick(item)} className="h-8 w-8 p-0 border-[#003594]/20 hover:bg-[#003594]/5 hover:text-[#003594]">
                             <Edit className="h-4 w-4"/>
                           </Button>
                           <Button variant="outline" size="sm" onClick={() => handleDeleteClick(item)} className="h-8 w-8 p-0 border-red-500/20 hover:bg-red-500/5 hover:text-red-500">
                             <Trash2 className="h-4 w-4"/>
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

             <Modal open={isRejectOpen} onOpenChange={setIsRejectOpen}>
         <ModalContent className="max-w-md bg-white rounded-xl shadow-xl border-[#002a6e]/10">
           <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
             <ModalTitle className="text-xl font-bold text-[#003594]">Reject Fuel Issue</ModalTitle>
             <ModalDescription className="text-gray-600 mt-2">
               Are you sure you want to reject this fuel issue?
             </ModalDescription>
           </ModalHeader>
           <div className="mt-6 flex justify-end gap-3">
             <Button variant="outline" onClick={() => setIsRejectOpen(false)} className="border-[#002a6e]/10 hover:bg-[#003594]/5">
               Cancel
             </Button>
             <Button onClick={handleRejectIssue} className="bg-[#d2293b] hover:bg-[#d2293b]/90 transition-colors">
               Reject Fuel Issue
             </Button>
           </div>
         </ModalContent>
       </Modal>

       
       <Modal open={isEditOpen} onOpenChange={setIsEditOpen}>
         <ModalContent className="max-w-md bg-white rounded-xl shadow-xl border-[#002a6e]/10">
           <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
             <ModalTitle className="text-xl font-bold text-[#003594]">Edit Fuel Issue</ModalTitle>
             <ModalDescription className="text-gray-600 mt-2">
               Update the fuel issue details below. Total cost will be automatically calculated as Fuel Rate × Quantity.
             </ModalDescription>
           </ModalHeader>
                       <div className="mt-6 space-y-4">
              <div>
                <Label htmlFor="fuel_rate" className="text-sm font-medium text-[#003594]">
                  Fuel Rate (NPR per liter)
                </Label>
                <Input id="fuel_rate" type="number" step="0.01" value={editFormData.fuel_rate} onChange={(e) => setEditFormData(prev => ({ ...prev, fuel_rate: e.target.value }))} className="mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20" placeholder="Enter fuel rate"/>
              </div>
             <div>
               <Label htmlFor="quantity" className="text-sm font-medium text-[#003594]">
                 Quantity
               </Label>
               <Input id="quantity" type="number" step="0.01" value={editFormData.quantity} onChange={(e) => setEditFormData(prev => ({ ...prev, quantity: e.target.value }))} className="mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20" placeholder="Enter quantity"/>
             </div>
             <div>
               <Label htmlFor="kilometers" className="text-sm font-medium text-[#003594]">
                 Current Kilometers
               </Label>
               <Input id="kilometers" type="number" value={editFormData.kilometers} onChange={(e) => setEditFormData(prev => ({ ...prev, kilometers: e.target.value }))} className="mt-1 border-[#002a6e]/10 focus:border-[#003594] focus:ring-[#003594]/20" placeholder="Enter kilometers"/>
             </div>
           </div>
           <div className="mt-6 flex justify-end gap-3">
                            <Button variant="outline" onClick={() => {
            setIsEditOpen(false);
            setEditingItem(null);
            setEditFormData({ fuel_rate: '', quantity: '', kilometers: '' });
        }} className="border-[#002a6e]/10 hover:bg-[#003594]/5">
                 Cancel
               </Button>
             <Button onClick={handleEditSubmit} className="bg-[#003594] hover:bg-[#003594]/90 text-white transition-colors">
               Update
             </Button>
           </div>
         </ModalContent>
       </Modal>

       
       <Modal open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
         <ModalContent className="max-w-md bg-white rounded-xl shadow-xl border-[#002a6e]/10">
           <ModalHeader className="border-b border-[#002a6e]/10 pb-4">
             <ModalTitle className="text-xl font-bold text-[#003594]">Delete Fuel Issue</ModalTitle>
             <ModalDescription className="text-gray-600 mt-2">
               Are you sure you want to delete this fuel issue? This action cannot be undone.
             </ModalDescription>
           </ModalHeader>
           <div className="mt-6 flex justify-end gap-3">
             <Button variant="outline" onClick={() => {
            setIsDeleteOpen(false);
            setEditingItem(null);
        }} className="border-[#002a6e]/10 hover:bg-[#003594]/5">
               Cancel
             </Button>
             <Button onClick={handleDeleteSubmit} className="bg-red-600 hover:bg-red-700 text-white transition-colors">
               Delete
             </Button>
           </div>
         </ModalContent>
       </Modal>
     </>);
}
