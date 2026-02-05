import { API } from "@/lib/api";
import axios from "axios";
export const loginRequest = async (username: string, password: string) => {
    try {
        const response = await API.post("/api/auth/login", { username, password });
        return response.data;
    }
    catch (error) {
        if (axios.isAxiosError(error)) {
            throw new Error(error.response?.data?.message || "An error occurred during login");
        }
        throw new Error("An unexpected error occurred");
    }
};
