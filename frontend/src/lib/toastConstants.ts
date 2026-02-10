export const TOAST_TITLES = {
  success: 'Success',
  error: 'Error',
  info: 'Info',
  warning: 'Warning',
} as const;

export type ToastTitleKind = keyof typeof TOAST_TITLES;
