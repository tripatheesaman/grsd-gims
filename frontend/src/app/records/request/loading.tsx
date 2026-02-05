import { Loader2 } from 'lucide-react';
export default function Loading() {
    return (<div className="container mx-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#003594] mx-auto mb-4"/>
            <p className="text-[#003594] font-medium">Loading Request Records...</p>
            <p className="text-sm text-gray-600 mt-2">Please wait while we fetch the data</p>
          </div>
        </div>
      </div>
    </div>);
}
