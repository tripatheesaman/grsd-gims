export const DEFAULT_ERROR_MESSAGE = 'Something went wrong. Please try again.';

type ErrorPayload = {
  message?: string;
  error?: string;
  detail?: string;
  errors?: string[] | Record<string, unknown>;
};

type AxiosLikeError = {
  message?: string;
  response?: {
    data?: unknown;
  };
};

const isAxiosLikeError = (value: unknown): value is AxiosLikeError => {
  return Boolean(value && typeof value === 'object' && 'response' in value);
};

const getFirstErrorFromObject = (value: Record<string, unknown>): string | null => {
  for (const nestedValue of Object.values(value)) {
    if (typeof nestedValue === 'string' && nestedValue.trim()) {
      return nestedValue.trim();
    }
    if (Array.isArray(nestedValue)) {
      const first = nestedValue.find((entry) => typeof entry === 'string' && entry.trim()) as
        | string
        | undefined;
      if (first) {
        return first.trim();
      }
    }
  }
  return null;
};

export function getErrorMessage(error: unknown, fallback = DEFAULT_ERROR_MESSAGE): string {
  if (isAxiosLikeError(error)) {
    const responseData = error.response?.data;

    if (typeof responseData === 'string' && responseData.trim()) {
      return responseData.trim();
    }

    if (responseData && typeof responseData === 'object') {
      const payload = responseData as ErrorPayload;
      if (typeof payload.message === 'string' && payload.message.trim()) {
        return payload.message.trim();
      }
      if (typeof payload.error === 'string' && payload.error.trim()) {
        return payload.error.trim();
      }
      if (typeof payload.detail === 'string' && payload.detail.trim()) {
        return payload.detail.trim();
      }
      const errors = payload.errors;
      if (Array.isArray(errors)) {
        const first = errors.find((entry) => typeof entry === 'string' && entry.trim());
        if (first) {
          return first.trim();
        }
      }
      if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
        const nested = getFirstErrorFromObject(errors);
        if (nested) {
          return nested;
        }
      }
    }

    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message.trim();
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}
