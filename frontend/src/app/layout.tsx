import type { Metadata } from 'next';
import '@/styles/globals.css';
import DashboardLayoutContent from '@/components/layout/DashboardLayoutContent';
import { AuthContextProvider } from '@/context/AuthContext';
import { Toaster } from "@/components/ui/toaster";
import { NotificationProvider } from '@/context/NotificationContext';
import { withBasePath } from '@/lib/urls';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { CommunicationsShell } from '@/components/communications/CommunicationsShell';
export const metadata: Metadata = {
    title: 'GIMS',
    description: 'Inventory Management System',
    icons: {
        icon: withBasePath('/images/nac_icon.png'),
    },
};
interface LayoutProps {
    children: React.ReactNode;
}
export default function RootLayout({ children }: LayoutProps) {
    return (<html lang="en">
      <body className="font-sans" suppressHydrationWarning>
        <QueryProvider>
        <AuthContextProvider>
          <CommunicationsShell>
          <NotificationProvider>
            <DashboardLayoutContent>
              {children}
            </DashboardLayoutContent>
          </NotificationProvider>
          </CommunicationsShell>
        </AuthContextProvider>
        </QueryProvider>
        <Toaster />
      </body>
    </html>);
}
