export default function Loading() {
    return (<div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="h-9 w-64 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-5 w-48 bg-gray-200 rounded mt-2 animate-pulse"></div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-gray-300 animate-pulse"></div>
              <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-[#002a6e]/10 p-6">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (<div key={i} className="h-12 bg-gray-200 rounded"></div>))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>);
}
