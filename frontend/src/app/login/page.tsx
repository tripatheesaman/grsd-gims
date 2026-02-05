'use client';
import { useAuthContext } from '@/context/AuthContext';
import LoginPage from "../../components/login/loginForm";
import RedirectToDashboard from "@/components/RedirectToDashboard";
const Home = () => {
    const { isAuthenticated } = useAuthContext();
    if (isAuthenticated) {
        return <RedirectToDashboard />;
    }
    return <LoginPage />;
};
export default Home;
