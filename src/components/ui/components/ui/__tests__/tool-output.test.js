import React from 'react';
import { render, screen } from '@testing-library/react';
import { ToolOutput } from '../tool-output';

describe('ToolOutput', () => {
  test('renders successful tool result', () => {
    const mockResult = {
      toolName: 'calculator',
      success: true,
      result: {
        value: 42,
        formattedValue: '42'
      },
      executionTime: 123,
      metadata: {
        name: 'calculator',
        description: 'Performs math calculations',
        category: 'Utilities',
        displayType: 'calculator'
      },
      params: {
        expression: '21 * 2'
      }
    };
    
    render(<ToolOutput result={mockResult} />);
    
    expect(screen.getByText('calculator')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('123ms')).toBeInTheDocument();
    expect(screen.getByText('21 * 2 = 42')).toBeInTheDocument();
  });
  
  test('renders error state', () => {
    const mockResult = {
      toolName: 'calculator',
      success: false,
      error: 'Invalid expression',
      metadata: {
        name: 'calculator',
        description: 'Performs math calculations',
        category: 'Utilities'
      }
    };
    
    render(<ToolOutput result={mockResult} />);
    
    expect(screen.getByText('calculator')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Error: Invalid expression')).toBeInTheDocument();
  });
  
  test('renders web search result', () => {
    const mockResult = {
      toolName: 'webSearch',
      success: true,
      result: {
        results: [
          { 
            title: 'Test Result', 
            url: 'https://example.com',
            snippet: 'Example search result'
          }
        ]
      },
      metadata: {
        name: 'webSearch',
        description: 'Search the web',
        category: 'Web',
        displayType: 'web-search'
      },
      params: {
        query: 'test search'
      }
    };
    
    render(<ToolOutput result={mockResult} />);
    
    expect(screen.getByText('webSearch')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Search query: test search')).toBeInTheDocument();
    expect(screen.getByText('Test Result')).toBeInTheDocument();
    expect(screen.getByText('Example search result')).toBeInTheDocument();
  });
  
  test('renders object result as code block', () => {
    const mockResult = {
      toolName: 'getData',
      success: true,
      result: { 
        items: [1, 2, 3],
        count: 3
      },
      metadata: {
        name: 'getData',
        description: 'Get data',
        category: 'Data'
      }
    };
    
    render(<ToolOutput result={mockResult} />);
    
    expect(screen.getByText('getData')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText(/"items": \[/)).toBeInTheDocument();
    expect(screen.getByText(/"count": 3/)).toBeInTheDocument();
  });
  
  test('returns null with no result', () => {
    const { container } = render(<ToolOutput result={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});