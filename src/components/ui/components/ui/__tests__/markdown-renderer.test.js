/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MarkdownRenderer } from '../markdown-renderer';

describe('MarkdownRenderer component', () => {
  it('renders plain text content', () => {
    render(<MarkdownRenderer content="Hello world" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders markdown formatted text', () => {
    render(<MarkdownRenderer content="**Bold text**" />);
    expect(screen.getByText('Bold text')).toBeStyled();
  });

  it('renders code blocks with the CodeBlock component', () => {
    const content = "```javascript\nconst x = 1;\n```";
    render(<MarkdownRenderer content={content} />);
    
    // Since we're not testing the CodeBlock component itself,
    // just check that the content is rendered somewhere
    expect(screen.getByText('const x = 1;')).toBeInTheDocument();
  });

  it('skips rendering code blocks when skipCodeBlocks is true', () => {
    const content = "```javascript\nconst x = 1;\n```";
    render(<MarkdownRenderer content={content} skipCodeBlocks={true} />);
    
    // Code should still be rendered, but as a pre/code element
    expect(screen.getByText('const x = 1;')).toBeInTheDocument();
  });

  it('renders multiple blocks of text and code', () => {
    const content = "First paragraph\n\n```javascript\nconst x = 1;\n```\n\nSecond paragraph";
    render(<MarkdownRenderer content={content} />);
    
    expect(screen.getByText('First paragraph')).toBeInTheDocument();
    expect(screen.getByText('const x = 1;')).toBeInTheDocument();
    expect(screen.getByText('Second paragraph')).toBeInTheDocument();
  });

  it('renders segmented content with @mentions', () => {
    const segmentedContent = [
      { type: 'text', content: 'Hello ' },
      { 
        type: 'mention', 
        content: '@chloe', 
        agentName: 'chloe',
        color: 'blue' 
      },
      { type: 'text', content: ', how are you?' }
    ];
    
    render(<MarkdownRenderer content={segmentedContent} />);
    
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('@chloe')).toBeInTheDocument();
    expect(screen.getByText(', how are you?')).toBeInTheDocument();
  });

  it('applies agent colors to @mentions', () => {
    const segmentedContent = [
      { type: 'text', content: 'Hello ' },
      { 
        type: 'mention', 
        content: '@chloe', 
        agentName: 'chloe' 
      }
    ];
    
    const agentColors = {
      'chloe': 'blue'
    };
    
    const { container } = render(
      <MarkdownRenderer 
        content={segmentedContent}
        agentColors={agentColors}
      />
    );
    
    // Check that the mention has the correct styling
    const mentionElement = screen.getByText('@chloe');
    expect(mentionElement).toHaveClass('mention');
  });

  it('handles empty content gracefully', () => {
    const { container } = render(<MarkdownRenderer content="" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('handles null content gracefully', () => {
    const { container } = render(<MarkdownRenderer content={null} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders mixed markdown and @mentions correctly', () => {
    const segmentedContent = [
      { type: 'text', content: 'Hello **bold** ' },
      { 
        type: 'mention', 
        content: '@chloe', 
        agentName: 'chloe' 
      },
      { type: 'text', content: ', how are *you*?' }
    ];
    
    render(<MarkdownRenderer content={segmentedContent} />);
    
    // Check that both markdown and mentions are rendered
    expect(screen.getByText('bold')).toBeStyled();
    expect(screen.getByText('@chloe')).toBeInTheDocument();
    expect(screen.getByText('you')).toBeStyled();
  });
});