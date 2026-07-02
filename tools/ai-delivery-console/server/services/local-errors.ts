export type LocalServiceError = Error & {
  code?: string;
  data?: unknown;
};

export function localServiceError(code: string, message: string, data?: unknown): LocalServiceError {
  const error = new Error(message) as LocalServiceError;
  error.code = code;
  error.data = data;
  return error;
}
