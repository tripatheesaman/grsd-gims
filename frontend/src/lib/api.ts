import axios, { AxiosRequestHeaders } from "axios";
import { getApiBaseUrl } from "@/lib/urls";
const normalizeAbsoluteUrl = (value?: string): string => {
    if (!value) {
        return "";
    }
    let normalized = value.trim();
    if (normalized.startsWith("/http")) {
        normalized = normalized.replace(/^\/+/, "");
    }
    normalized = normalized.replace(/^(https?:)\/(?!\/)/, "$1//");
    return normalized;
};
const isAbsoluteLikeUrl = (value?: string) => {
    if (!value) {
        return false;
    }
    return /^\/?https?:/i.test(value.trim());
};
const isAbsoluteUrl = (value?: string) => {
    if (!value) {
        return false;
    }
    return /^https?:\/\//i.test(value.trim());
};
const isBrowser = typeof window !== 'undefined';
const getToken = () => {
    if (!isBrowser)
        return null;
    return localStorage.getItem('token');
};
const apiBaseUrl = normalizeAbsoluteUrl(getApiBaseUrl());
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
    if (config.baseURL) {
        config.baseURL = normalizeAbsoluteUrl(config.baseURL);
    }
    if (config.url) {
        if (isAbsoluteLikeUrl(config.url)) {
            config.url = normalizeAbsoluteUrl(config.url);
        }
        config.url = normalizeApiPath(config.url);
    }
    if (config.baseURL && config.url && !isAbsoluteUrl(config.url)) {
        const base = normalizeAbsoluteUrl(config.baseURL);
        try {
            const baseWithSlash = base.endsWith("/") ? base : `${base}/`;
            config.url = new URL(config.url.replace(/^\/+/, "/"), baseWithSlash).toString();
            delete config.baseURL;
        }
        catch {
        }
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
