/**
 * Events store.
 *
 * Manages event search results, filter state, and pagination.
 */
import { createStore } from 'solid-js/store';
import { apiClient } from '../api/client';
/**
 * Composable that exposes the event search state and actions.
 */
export function useEvents() {
    const [state, setState] = createStore({
        events: [],
        total: 0,
        queryMs: 0,
        isLoading: false,
        error: null,
        currentQuery: { limit: 50, offset: 0 },
    });
    /**
     * Execute an event search with the given query parameters.
     * Replaces the current result set.
     */
    const searchEvents = async (params) => {
        setState({ isLoading: true, error: null, currentQuery: params });
        try {
            const resp = await apiClient.getEvents(params);
            setState({
                events: resp.events,
                total: resp.total,
                queryMs: resp.query_ms,
                isLoading: false,
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to search events.';
            setState({ isLoading: false, error: message });
        }
    };
    /**
     * Load the next page using the current query parameters.
     * Appends to the existing result set.
     */
    const loadNextPage = async () => {
        const currentOffset = state.currentQuery.offset ?? 0;
        const limit = state.currentQuery.limit ?? 50;
        const nextQuery = { ...state.currentQuery, offset: currentOffset + limit };
        setState({ isLoading: true, error: null, currentQuery: nextQuery });
        try {
            const resp = await apiClient.getEvents(nextQuery);
            setState({
                events: [...state.events, ...resp.events],
                total: resp.total,
                queryMs: resp.query_ms,
                isLoading: false,
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load more events.';
            setState({ isLoading: false, error: message });
        }
    };
    return { state, searchEvents, loadNextPage };
}
