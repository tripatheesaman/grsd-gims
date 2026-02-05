export interface RouteConfig {
    path: string;
    requiresAuth: boolean;
    title: string;
    permissions?: string[];
}
