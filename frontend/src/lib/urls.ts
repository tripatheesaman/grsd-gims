const DEFAULT_BASE_PATH = "/inventory";

const normalizeBasePath = (value: string | undefined, fallback = ""): string => {
  const raw = (value ?? fallback).trim();
  if (!raw || raw === "/") {
    return "";
  }
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeadingSlash.replace(/\/+$/, "");
};

const joinPaths = (base: string, path: string): string => {
  if (!base) {
    return path.startsWith("/") ? path : `/${path}`;
  }
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path.replace(/^\/+/, "");
  return `${normalizedBase}/${normalizedPath}`;
};

const isExternalUrl = (value: string): boolean => {
  return /^(https?:|data:|blob:)/i.test(value);
};

export const getBasePath = (): string => {
  return normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH, DEFAULT_BASE_PATH);
};

export const withBasePath = (path: string): string => {
  if (!path || isExternalUrl(path)) {
    return path;
  }
  const basePath = getBasePath();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!basePath) {
    return normalizedPath;
  }
  if (normalizedPath === basePath || normalizedPath.startsWith(`${basePath}/`)) {
    return normalizedPath;
  }
  return joinPaths(basePath, normalizedPath);
};

export const getApiBaseUrl = (): string => {
  const fallback = joinPaths(getBasePath(), "/backend");
  return normalizeBasePath(process.env.NEXT_PUBLIC_API_BASE_URL, fallback);
};

export const apiUrl = (path: string): string => {
  if (!path || isExternalUrl(path)) {
    return path;
  }
  const apiBase = getApiBaseUrl();
  const normalizedPath = path.replace(/^\/?api(\/|$)/, "/");
  if (normalizedPath === apiBase || normalizedPath.startsWith(`${apiBase}/`)) {
    return normalizedPath;
  }
  return joinPaths(apiBase, normalizedPath);
};

export const getImageBaseUrl = (): string => {
  const fallback = joinPaths(getApiBaseUrl(), "/images");
  return normalizeBasePath(process.env.NEXT_PUBLIC_IMAGE_BASE_URL, fallback);
};

export const withImageBaseUrl = (path: string): string => {
  if (!path || isExternalUrl(path)) {
    return path;
  }
  const base = getImageBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!base) {
    return normalizedPath;
  }
  if (normalizedPath === base || normalizedPath.startsWith(`${base}/`)) {
    return normalizedPath;
  }
  const baseWithoutSlash = base.replace(/\/+$/, "");
  const baseEndsWithImages = baseWithoutSlash.endsWith("/images");
  const cleanedPath = baseEndsWithImages
    ? normalizedPath.replace(/^\/images(\/|$)/, "/")
    : normalizedPath;
  return joinPaths(baseWithoutSlash, cleanedPath);
};

export const resolveImageUrl = (
  imagePath: string | null | undefined,
  fallback: string
): string => {
  if (!imagePath || imagePath === "N/A" || imagePath === "") {
    return withBasePath(fallback);
  }
  if (isExternalUrl(imagePath)) {
    return imagePath;
  }
  const basePath = getBasePath();
  const apiBase = getApiBaseUrl();
  const imageBase = getImageBaseUrl();
  if (
    (basePath && (imagePath === basePath || imagePath.startsWith(`${basePath}/`))) ||
    (apiBase && (imagePath === apiBase || imagePath.startsWith(`${apiBase}/`))) ||
    (imageBase && (imagePath === imageBase || imagePath.startsWith(`${imageBase}/`)))
  ) {
    return imagePath;
  }
  if (imagePath.startsWith("/images/") || imagePath.startsWith("/uploads/")) {
    return withBasePath(imagePath);
  }
  if (imagePath.startsWith("/api/")) {
    return apiUrl(imagePath);
  }
  if (imagePath.startsWith("/")) {
    return withImageBaseUrl(imagePath);
  }
  return withImageBaseUrl(`/images/${imagePath}`);
};
