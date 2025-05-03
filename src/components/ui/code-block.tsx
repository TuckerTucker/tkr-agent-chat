import { useState, useRef, useEffect, forwardRef } from 'react';
import { cn } from '../../lib/utils';

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  collapsed?: boolean;
  maxHeight?: string;
  theme?: 'light' | 'dark';
  onCopy?: () => void;
  onDownload?: () => void;
  className?: string;
}

declare global {
  interface Window {
    Prism: any;
  }
}

export const CodeBlock = forwardRef<HTMLDivElement, CodeBlockProps>(({
  code,
  language = 'text',
  showLineNumbers = false,
  collapsed = false,
  maxHeight = '500px',
  theme = 'light',
  onCopy,
  onDownload,
  className,
  ...props
}, ref) => {
  const [isPrismLoaded, setIsPrismLoaded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const codeRef = useRef<HTMLElement>(null);
  const normalizedLanguage = getNormalizedLanguage(language);

  // Load Prism.js and language support
  useEffect(() => {
    loadPrismWithLanguage(normalizedLanguage).then(() => {
      setIsPrismLoaded(true);
    });
  }, [normalizedLanguage]);

  // Apply syntax highlighting
  useEffect(() => {
    if (isPrismLoaded && codeRef.current && window.Prism) {
      window.Prism.highlightElement(codeRef.current);
    }
  }, [isPrismLoaded, code, normalizedLanguage]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      if (onCopy) onCopy();
      
      setTimeout(() => {
        setIsCopied(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const handleDownload = () => {
    try {
      const fileExtension = getFileExtension(normalizedLanguage);
      const fileName = `code-snippet.${fileExtension}`;
      const blob = new Blob([code], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      if (onDownload) onDownload();
    } catch (err) {
      console.error('Failed to download code:', err);
    }
  };

  return (
    <div 
      ref={ref}
      className={cn(
        "code-block relative rounded-lg overflow-hidden border",
        "bg-card text-card-foreground",
        "group transition-all duration-theme",
        className
      )}
      {...props}
    >
      {/* Code block header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {normalizedLanguage}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1 hover:bg-accent hover:text-accent-foreground rounded transition-colors"
            title="Copy code"
          >
            {isCopied ? (
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
            )}
          </button>
          <button
            onClick={handleDownload}
            className="p-1 hover:bg-accent hover:text-accent-foreground rounded transition-colors"
            title="Download code"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
            </svg>
          </button>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 hover:bg-accent hover:text-accent-foreground rounded transition-colors"
            title={isCollapsed ? "Expand code" : "Collapse code"}
          >
            {isCollapsed ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path>
              </svg>
            )}
          </button>
        </div>
      </div>
      
      {/* Code content */}
      <div 
        className={cn(
          "overflow-x-auto transition-all duration-theme",
          isCollapsed ? "max-h-0" : `max-h-[${maxHeight}]`
        )}
      >
        <pre className={cn(
          "p-4 m-0 text-sm",
          showLineNumbers && "line-numbers"
        )}>
          <code
            ref={codeRef}
            className={`language-${normalizedLanguage}`}
          >
            {code}
          </code>
        </pre>
      </div>
    </div>
  );
});

CodeBlock.displayName = "CodeBlock";

function getNormalizedLanguage(language: string): string {
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'ts': 'typescript',
    'jsx': 'javascript',
    'tsx': 'typescript',
    'py': 'python',
    'rb': 'ruby',
    'bash': 'shell',
    'shell': 'shell',
    'html': 'html',
    'css': 'css',
    'json': 'json',
    'yml': 'yaml',
    'yaml': 'yaml',
    'md': 'markdown'
  };
  
  return languageMap[language.toLowerCase()] || language.toLowerCase();
}

function isLanguageSupported(language: string): boolean {
  const supportedLanguages = [
    'markup', 'html', 'xml', 'svg', 'mathml', 'ssml', 'atom', 'rss',
    'css',
    'clike',
    'javascript', 'js',
    'typescript', 'ts',
    'jsx', 'tsx',
    'python', 'py',
    'ruby', 'rb',
    'bash', 'shell',
    'sql',
    'json',
    'yaml', 'yml',
    'markdown', 'md'
  ];
  
  return supportedLanguages.includes(language.toLowerCase());
}

function getFileExtension(language: string): string {
  const extensions: Record<string, string> = {
    'javascript': 'js',
    'typescript': 'ts',
    'python': 'py',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'csharp': 'cs',
    'go': 'go',
    'ruby': 'rb',
    'php': 'php',
    'swift': 'swift',
    'kotlin': 'kt',
    'rust': 'rs',
    'scala': 'scala',
    'html': 'html',
    'css': 'css',
    'json': 'json',
    'yaml': 'yaml',
    'markdown': 'md',
    'shell': 'sh',
    'bash': 'sh',
    'sql': 'sql'
  };
  
  return extensions[language.toLowerCase()] || 'txt';
}

function loadPrismWithLanguage(language: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof window !== 'undefined' && !window.Prism) {
      // Load Prism core
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/components/prism-core.min.js';
      script.async = true;
      
      script.onload = () => {
        // Load required components
        const components = [
          'https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/plugins/autoloader/prism-autoloader.min.js'
        ];
        
        if (isLanguageSupported(language)) {
          components.push(
            `https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/components/prism-${language}.min.js`
          );
        }
        
        const languageLoads = components.map(src => {
          return new Promise<void>((resolve) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = () => resolve();
            document.body.appendChild(script);
          });
        });
        
        Promise.all(languageLoads).then(() => resolve());
      };
      
      document.body.appendChild(script);
    } else if (typeof window !== 'undefined' && window.Prism) {
      resolve();
    }
  });
}

export default CodeBlock;
