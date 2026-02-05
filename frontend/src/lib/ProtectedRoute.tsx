'use client';
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuthContext } from "@/context/AuthContext";
import { getRouteConfig, hasRequiredPermissions } from "@/config/routes";
import Unauthorized from "@/app/(fallback)/unauthorized/page";
interface ProtectedRouteProps {
    children: React.ReactNode;
}
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const { isAuthenticated, permissions } = useAuthContext();
    const router = useRouter();
    const pathname = usePathname();
    const [shouldRedirect, setShouldRedirect] = useState<string | null>(null);
    useEffect(() => {
        const routeConfig = getRouteConfig(pathname);
        if (!routeConfig) {
            setShouldRedirect('/dashboard');
            return;
        }
        if (routeConfig.requiresAuth && !isAuthenticated) {
            setShouldRedirect('/login');
            return;
        }
        if (isAuthenticated && !hasRequiredPermissions(routeConfig, permissions)) {
            setShouldRedirect('/unauthorized');
            return;
        }
    }, [isAuthenticated, pathname, permissions]);
    useEffect(() => {
        if (shouldRedirect) {
            router.push(shouldRedirect);
            setShouldRedirect(null);
        }
    }, [shouldRedirect, router]);
    const routeConfig = getRouteConfig(pathname);
    if (!routeConfig) {
        return null;
    }
    if (routeConfig.requiresAuth && !isAuthenticated) {
        return null;
    }
    if (isAuthenticated && !hasRequiredPermissions(routeConfig, permissions)) {
        return <Unauthorized />;
    }
    return <>{children}</>;
};
export default ProtectedRoute;
