/**
 * KRON API type definitions.
 *
 * All types here correspond 1:1 with the backend API (docs/API.md).
 * Never define API shapes anywhere else in the codebase.
 */
/** Type guard: checks if an unknown value is an ApiError. */
export function isApiError(value) {
    return (typeof value === 'object' &&
        value !== null &&
        'error' in value &&
        'code' in value &&
        typeof value['error'] === 'string' &&
        typeof value['code'] === 'string');
}
