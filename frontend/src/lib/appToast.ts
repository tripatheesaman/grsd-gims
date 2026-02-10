import { toast } from '@/components/ui/use-toast';
import { DEFAULT_ERROR_MESSAGE, getErrorMessage } from '@/lib/errorHandling';
import { TOAST_TITLES } from '@/lib/toastConstants';

type ToastKind = 'success' | 'error' | 'info' | 'warning';

interface AppToastOptions {
  title?: string;
  message: string;
  duration?: number;
}

interface ErrorToastOptions {
  fallbackMessage?: string;
  duration?: number;
}

const styleByKind: Record<ToastKind, string> = {
  success: 'bg-green-600 text-white border-none',
  error: 'bg-red-600 text-white border-none',
  info: 'bg-blue-600 text-white border-none',
  warning: 'bg-yellow-600 text-white border-none',
};

let lastErrorToastKey = '';
let lastErrorToastAt = 0;
const ERROR_TOAST_DEDUPE_WINDOW_MS = 2000;

function show(kind: ToastKind, { message, duration = 5000 }: AppToastOptions) {
  const title = TOAST_TITLES[kind];
  toast({
    title,
    description: message,
    variant: kind === 'error' ? 'destructive' : 'default',
    className: styleByKind[kind],
    duration,
  });
}

export function showSuccessToast(options: AppToastOptions) {
  show('success', options);
}

export function showErrorToast(options: AppToastOptions) {
  show('error', options);
}

export function showInfoToast(options: AppToastOptions) {
  show('info', options);
}

export function showWarningToast(options: AppToastOptions) {
  show('warning', options);
}

export function showErrorToastFromError(error: unknown, options: ErrorToastOptions = {}) {
  if (typeof window === 'undefined') {
    return;
  }

  const title = TOAST_TITLES.error;
  const message = getErrorMessage(error, options.fallbackMessage ?? DEFAULT_ERROR_MESSAGE);
  const dedupeKey = `${title}:${message}`;
  const now = Date.now();

  if (dedupeKey === lastErrorToastKey && now - lastErrorToastAt < ERROR_TOAST_DEDUPE_WINDOW_MS) {
    return;
  }

  lastErrorToastKey = dedupeKey;
  lastErrorToastAt = now;

  showErrorToast({
    title,
    message,
    duration: options.duration,
  });
}
