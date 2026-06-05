'use client';
import { useAuthContext } from '@/context/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AssetTypesManagement } from '@/components/assets/AssetTypesManagement';
import { AssetsManagement } from '@/components/assets/AssetsManagement';
import { AssetSettingsPanel } from '@/components/assets/AssetSettingsPanel';
import { AlertCircle } from 'lucide-react';
export default function AssetsPage() {
    const { permissions } = useAuthContext();
    const canAccessAssets = permissions?.includes('can_access_asset_management_system');
    if (!canAccessAssets) {
        return (<div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 bg-[#f6f8fc]/80 p-6 text-center">
        <AlertCircle className="h-10 w-10 text-[#d2293b]"/>
        <h1 className="text-lg font-semibold text-[#003594]">Access Denied</h1>
        <p className="max-w-md text-sm text-gray-600">
          You do not have permission to access the asset management system. If you believe this is a mistake, please contact an administrator.
        </p>
      </div>);
    }
    return (<div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#003594] to-[#d2293b] bg-clip-text text-transparent">
              Asset Management
            </h1>
            <p className="text-gray-600 mt-1">Manage asset types and individual assets</p>
          </div>

          <Tabs defaultValue="assets" className="w-full">
            <TabsList className="grid w-full max-w-lg grid-cols-3">
              <TabsTrigger value="assets">Assets</TabsTrigger>
              <TabsTrigger value="types">Asset Types</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            <TabsContent value="assets" className="mt-6">
              <AssetsManagement />
            </TabsContent>
            <TabsContent value="types" className="mt-6">
              <AssetTypesManagement />
            </TabsContent>
            <TabsContent value="settings" className="mt-6">
              <AssetSettingsPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>);
}
