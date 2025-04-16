/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MentionSuggestion } from '../mention-suggestion';

describe('MentionSuggestion component', () => {
  const mockSuggestions = ['chloe', 'parker', 'librarian'];
  const mockAgents = {
    chloe: { 
      name: 'Chloe', 
      primaryColor: '210, 100%, 50%' 
    },
    parker: { 
      name: 'Parker', 
      primaryColor: '150, 100%, 40%' 
    },
    librarian: { 
      name: 'Librarian', 
      primaryColor: '25, 100%, 50%' 
    }
  };
  const mockPosition = { top: 100, left: 50 };
  const mockOnSelect = jest.fn();

  beforeEach(() => {
    mockOnSelect.mockClear();
  });

  it('renders nothing when no suggestions are provided', () => {
    const { container } = render(
      <MentionSuggestion 
        suggestions={[]} 
        onSelect={mockOnSelect} 
      />
    );
    
    expect(container.firstChild).toBeNull();
  });

  it('renders a list of suggestions', () => {
    render(
      <MentionSuggestion 
        suggestions={mockSuggestions} 
        onSelect={mockOnSelect} 
        agents={mockAgents}
        position={mockPosition}
      />
    );
    
    expect(screen.getByText('chloe')).toBeInTheDocument();
    expect(screen.getByText('parker')).toBeInTheDocument();
    expect(screen.getByText('librarian')).toBeInTheDocument();
  });

  it('applies the correct position styles', () => {
    const { container } = render(
      <MentionSuggestion 
        suggestions={mockSuggestions} 
        onSelect={mockOnSelect} 
        position={mockPosition}
      />
    );
    
    const suggestionElement = container.firstChild;
    expect(suggestionElement).toHaveStyle(`top: ${mockPosition.top}px`);
    expect(suggestionElement).toHaveStyle(`left: ${mockPosition.left}px`);
  });

  it('calls onSelect when a suggestion is clicked', () => {
    render(
      <MentionSuggestion 
        suggestions={mockSuggestions} 
        onSelect={mockOnSelect} 
        agents={mockAgents}
      />
    );
    
    fireEvent.click(screen.getByText('chloe'));
    expect(mockOnSelect).toHaveBeenCalledWith('chloe');
  });

  it('applies active state to the selected suggestion', () => {
    render(
      <MentionSuggestion 
        suggestions={mockSuggestions} 
        onSelect={mockOnSelect} 
        activeIndex={1}
        agents={mockAgents}
      />
    );
    
    const items = screen.getAllByRole('option');
    expect(items[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('handles keyboard navigation', () => {
    render(
      <MentionSuggestion 
        suggestions={mockSuggestions} 
        onSelect={mockOnSelect} 
        agents={mockAgents}
      />
    );
    
    const items = screen.getAllByRole('option');
    
    // Pressing Enter should select the suggestion
    fireEvent.keyDown(items[0], { key: 'Enter' });
    expect(mockOnSelect).toHaveBeenCalledWith('chloe');
    
    // Pressing Space should select the suggestion
    mockOnSelect.mockClear();
    fireEvent.keyDown(items[1], { key: ' ' });
    expect(mockOnSelect).toHaveBeenCalledWith('parker');
  });

  it('renders agent avatars with correct colors', () => {
    const { container } = render(
      <MentionSuggestion 
        suggestions={mockSuggestions} 
        onSelect={mockOnSelect} 
        agents={mockAgents}
      />
    );
    
    const avatars = container.querySelectorAll('.w-6.h-6.rounded-full');
    expect(avatars.length).toBe(3);
    
    // Check if the avatars have letters
    expect(avatars[0].textContent).toBe('C');
    expect(avatars[1].textContent).toBe('P');
    expect(avatars[2].textContent).toBe('L');
  });
});