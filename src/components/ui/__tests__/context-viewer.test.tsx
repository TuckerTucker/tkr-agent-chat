import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { ContextViewer } from '../context-viewer';
import { useSharedContext, useUpdateContext, useExtendContextTTL } from '../../../services/context';

// Mock the hooks
vi.mock('../../../services/context', () => ({
    useSharedContext: vi.fn(),
    useUpdateContext: vi.fn(),
    useExtendContextTTL: vi.fn()
}));

// Sample context data
const sampleContext = {
    id: 'test-context-1',
    source_agent_id: 'agent1',
    target_agent_id: 'agent2',
    session_id: 'test-session',
    context_type: 'relevant',
    content: { key: 'value' },
    metadata: {},
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    relevance_score: 0.8
};

// Setup QueryClient for tests
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: false,
        },
    },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
        {children}
    </QueryClientProvider>
);

describe('ContextViewer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders loading state', () => {
        (useSharedContext as any).mockReturnValue({ isLoading: true });

        render(<ContextViewer agentId="agent1" sessionId="session1" />, { wrapper });
        expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('renders empty state when no contexts', () => {
        (useSharedContext as any).mockReturnValue({ data: [], isLoading: false });

        render(<ContextViewer agentId="agent1" sessionId="session1" />, { wrapper });
        expect(screen.getByText(/no shared context available/i)).toBeInTheDocument();
    });

    it('renders contexts with relevance scores', () => {
        (useSharedContext as any).mockReturnValue({
            data: [sampleContext],
            isLoading: false
        });

        render(<ContextViewer agentId="agent1" sessionId="session1" />, { wrapper });
        
        expect(screen.getByText(/agent1/)).toBeInTheDocument();
        expect(screen.getByText(/relevant/)).toBeInTheDocument();
        expect(screen.getByText(/80%/)).toBeInTheDocument();
    });

    it('handles TTL extension', async () => {
        const mockExtend = vi.fn().mockResolvedValue({});
        (useSharedContext as any).mockReturnValue({
            data: [sampleContext],
            isLoading: false
        });
        (useExtendContextTTL as any).mockReturnValue({
            mutateAsync: mockExtend
        });

        render(<ContextViewer agentId="agent1" sessionId="session1" />, { wrapper });

        const extendButton = screen.getByTitle(/extend ttl/i);
        fireEvent.click(extendButton);

        await waitFor(() => {
            expect(mockExtend).toHaveBeenCalledWith({
                contextId: sampleContext.id,
                minutes: 30
            });
        });
    });

    it('handles context updates', async () => {
        const mockUpdate = vi.fn().mockResolvedValue({});
        (useSharedContext as any).mockReturnValue({
            data: [sampleContext],
            isLoading: false
        });
        (useUpdateContext as any).mockReturnValue({
            mutateAsync: mockUpdate
        });

        render(<ContextViewer agentId="agent1" sessionId="session1" />, { wrapper });

        const editButton = screen.getByTitle(/edit context/i);
        fireEvent.click(editButton);

        await waitFor(() => {
            expect(mockUpdate).toHaveBeenCalledWith({
                contextId: sampleContext.id,
                updates: expect.any(Object)
            });
        });
    });

    it('handles errors gracefully', () => {
        const mockError = new Error('Test error');
        const onError = vi.fn();
        (useSharedContext as any).mockReturnValue({
            error: mockError,
            isLoading: false
        });

        render(
            <ContextViewer
                agentId="agent1"
                sessionId="session1"
                onError={onError}
            />,
            { wrapper }
        );

        expect(onError).toHaveBeenCalledWith(mockError);
    });
});
