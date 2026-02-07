import axios, { AxiosRequestHeaders } from "axios";
import { getApiBaseUrl } from "@/lib/urls";
const isBrowser = typeof window !== 'undefined';
const getToken = () => {
    if (!isBrowser)
        return null;
    return localStorage.getItem('token');
};
const apiBaseUrl = getApiBaseUrl();
const shouldStripApiPrefix = apiBaseUrl.endsWith("/api");
export const API = axios.create({
    baseURL: apiBaseUrl,
    withCredentials: true,
});

const normalizeApiPath = (url?: string) => {
    if (!url || /^https?:\/\//i.test(url)) {
        return url;
    }
    if (!shouldStripApiPrefix) {
        return url;
    }
    return url.replace(/^\/?api(\/|$)/, "/");
};

API.interceptors.request.use((config) => {
    if (config.url) {
        config.url = normalizeApiPath(config.url);
    }
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
