import { ContentSpinner } from "@/components/ui/spinner";
export default function RequestLoading() {
    return (<div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Request Items</h1>
        <ContentSpinner />
      </div>
    </div>);
}
