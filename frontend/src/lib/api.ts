import axios, { AxiosRequestHeaders } from "axios";
import { API_BASE_URL } from "@/constants/api";
const isBrowser = typeof window !== 'undefined';
const getToken = () => {
    if (!isBrowser)
        return null;
    return localStorage.getItem('token');
};
export const API = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
});
API.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
        if (!config.headers) {
            config.headers = {} as AxiosRequestHeaders;
        }
        (config.headers as AxiosRequestHeaders).Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});
API.interceptors.response.use((response) => response, (error) => {
    if (error.response?.status === 401 && isBrowser) {
        localStorage.removeItem('token');
        delete API.defaults.headers.common?.Authorization;
    }
    return Promise.reject(error);
});
