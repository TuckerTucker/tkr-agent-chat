import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { ContextIndicator } from '../context-indicator';

describe('ContextIndicator', () => {
    it('renders nothing when usedContext is false', () => {
        const { container } = render(
            <ContextIndicator
                usedContext={false}
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders basic context indicator', () => {
        render(
            <ContextIndicator
                usedContext={true}
                contextCount={1}
            />
        );
        expect(screen.getByText('1 context')).toBeInTheDocument();
    });

    it('renders plural form for multiple contexts', () => {
        render(
            <ContextIndicator
                usedContext={true}
                contextCount={3}
            />
        );
        expect(screen.getByText('3 contexts')).toBeInTheDocument();
    });

    it('displays relevance score when provided', () => {
        render(
            <ContextIndicator
                usedContext={true}
                contextCount={1}
                relevanceScore={0.75}
            />
        );
        expect(screen.getByText('75% relevant')).toBeInTheDocument();
    });

    it('calls onViewContext when view button is clicked', () => {
        const mockOnView = vi.fn();
        render(
            <ContextIndicator
                usedContext={true}
                contextCount={1}
                onViewContext={mockOnView}
            />
        );

        const viewButton = screen.getByTitle('View used context');
        fireEvent.click(viewButton);
        expect(mockOnView).toHaveBeenCalled();
    });

    it('shows correct tooltip for single context', () => {
        render(
            <ContextIndicator
                usedContext={true}
                contextCount={1}
            />
        );
        const indicator = screen.getByTitle('Used 1 shared context');
        expect(indicator).toBeInTheDocument();
    });

    it('shows correct tooltip for multiple contexts', () => {
        render(
            <ContextIndicator
                usedContext={true}
                contextCount={3}
            />
        );
        const indicator = screen.getByTitle('Used 3 shared contexts');
        expect(indicator).toBeInTheDocument();
    });

    it('hides view button when onViewContext is not provided', () => {
        render(
            <ContextIndicator
                usedContext={true}
                contextCount={1}
            />
        );
        const viewButton = screen.queryByTitle('View used context');
        expect(viewButton).not.toBeInTheDocument();
    });
});
