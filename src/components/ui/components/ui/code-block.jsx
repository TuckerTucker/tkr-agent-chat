import React, { useState, useEffect } from "react";
import { cn, copyToClipboard as copyTextToClipboard } from "../../lib/utils";
import { Button } from "./button";

/**
 * CodeBlock component for displaying and interacting with code snippets
 * @param {Object} props - Component props
 * @param {string} props.code - The code content
 * @param {string} props.language - The programming language
 * @param {boolean} [props.showLineNumbers=false] - Whether to show line numbers
 * @param {boolean} [props.collapsed=false] - Whether the code block is initially collapsed
 * @param {string} [props.maxHeight='500px'] - Maximum height of the code block 
 * @param {string} [props.theme='light'] - Theme for syntax highlighting (light or dark)
 * @param {Function} [props.onCopy] - Callback when code is copied
 * @param {Function} [props.onDownload] - Callback when code is downloaded
 * @returns {JSX.Element} CodeBlock component
 */
export const CodeBlock = React.forwardRef(({
  code,
  language,
  showLineNumbers = false,
  collapsed = false,
  maxHeight = '500px',
  theme = 'light',
  onCopy,
  onDownload,
  className,
  ...props
}, ref) => {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const [isCopied, setIsCopied] = useState(false);
  const [isPrismLoaded, setIsPrismLoaded] = useState(false);
  const [normalizedLanguage, setNormalizedLanguage] = useState(getNormalizedLanguage(language));
  const codeRef = React.useRef(null);
  const [currentTheme, setCurrentTheme] = useState(theme);
  
  // Detect system theme
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Check for dark mode from root element
      const isDarkMode = document.documentElement.classList.contains('dark');
      setCurrentTheme(isDarkMode ? 'dark' : 'light');
      
      // Set up an observer to watch for theme changes
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.attributeName === 'class') {
            const isDark = document.documentElement.classList.contains('dark');
            setCurrentTheme(isDark ? 'dark' : 'light');
          }
        });
      });
      
      observer.observe(document.documentElement, { attributes: true });
      
      return () => {
        observer.disconnect();
      };
    }
  }, []);

  // Load Prism.js dynamically
  useEffect(() => {
    let mounted = true;
    
    if (typeof window !== 'undefined' && !window.Prism) {
      loadPrism().then(() => {
        if (mounted) {
          setIsPrismLoaded(true);
        }
      }).catch(err => {
        console.warn('Failed to load Prism:', err);
      });
    } else if (typeof window !== 'undefined' && window.Prism) {
      setIsPrismLoaded(true);
    }
    
    return () => {
      mounted = false;
    };
  }, []);

  // Apply syntax highlighting when Prism is loaded or theme changes
  useEffect(() => {
    if (isPrismLoaded && codeRef.current && window.Prism) {
      try {
        // Force re-highlighting when theme changes
        setTimeout(() => {
          window.Prism.highlightElement(codeRef.current);
        }, 0);
      } catch (err) {
        console.error('Error applying syntax highlighting:', err);
      }
    }
  }, [isPrismLoaded, code, language, currentTheme]);

  // Copy code to clipboard using utility
  const copyToClipboard = async () => {
    try {
      const success = await copyTextToClipboard(code);
      if (success) {
        setIsCopied(true);
        if (onCopy) onCopy();
        
        // Reset after 2 seconds
        setTimeout(() => {
          setIsCopied(false);
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  // Download code as file
  const downloadCode = () => {
    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
      const filename = `code-${language}-${timestamp}`;
      const fileExt = getFileExtension(language);
      const fullFilename = `${filename}.${fileExt}`;
      
      // Create blob and trigger download
      const blob = new Blob([code], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = fullFilename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      
      // Clean up
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
        "code-block relative rounded-md overflow-hidden border border-border mb-4",
        "light-theme-container",
        className
      )}
      data-testid="code-block"
      data-language={language}
      data-theme="light"
      role="region"
      aria-label={`Code block in ${language}`}
      {...props}
    >
      {/* Toolbar */}
      <div className="code-block-toolbar flex flex-wrap md:flex-nowrap items-center justify-between p-2 bg-gray-100 border-b border-border">
        {/* Language indicator */}
        <div className="code-language flex items-center text-xs sm:text-sm font-mono mr-2">
          <span className="mr-1 sm:mr-2 text-gray-600">{language}</span>
          {isLanguageSupported(language) && (
            <span className="hidden sm:inline-block text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded-full">
              highlighted
            </span>
          )}
        </div>
        
        {/* Controls */}
        <div className="flex items-center space-x-1 md:space-x-2 mt-1 md:mt-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 p-1 text-gray-500 hover:text-gray-700 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
            aria-label="Copy code"
            aria-pressed={isCopied}
            onClick={copyToClipboard}
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
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 p-1 text-gray-500 hover:text-gray-700 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
            aria-label="Download code"
            onClick={downloadCode}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
            </svg>
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 p-1 text-gray-500 hover:text-gray-700 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
            aria-label="Toggle code collapse"
            aria-expanded={!isCollapsed}
            onClick={() => setIsCollapsed(!isCollapsed)}
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
          </Button>
        </div>
      </div>
      
      {/* Code content */}
      <div 
        className={cn(
          "code-block-content overflow-auto transition-all duration-300 ease-in-out",
          isCollapsed ? 'collapsed max-h-0' : ''
        )}
        style={{ 
          maxHeight: isCollapsed ? 0 : maxHeight,
          overflowX: 'auto'
        }}
      >
        <pre className={cn("p-2 sm:p-4 m-0 overflow-auto text-xs sm:text-sm light-theme-code", 
          showLineNumbers ? 'line-numbers' : ''
        )}>
          <code 
            ref={codeRef}
            className={`language-${normalizedLanguage}`}
            data-theme="light"
          >
            {code}
          </code>
        </pre>
      </div>
    </div>
  );
});

CodeBlock.displayName = "CodeBlock";

/**
 * Get normalized language for Prism
 * @param {string} language - The language to normalize
 * @returns {string} Normalized language
 */
function getNormalizedLanguage(language) {
  const languageMap = {
    'js': 'javascript',
    'ts': 'typescript',
    'jsx': 'jsx',
    'tsx': 'tsx',
    'py': 'python',
    'rb': 'ruby',
    'bash': 'bash',
    'shell': 'bash',
    'html': 'html',
    'css': 'css',
    'json': 'json',
    'yml': 'yaml',
    'yaml': 'yaml',
    'md': 'markdown'
  };
  
  return languageMap[language.toLowerCase()] || language.toLowerCase();
}

/**
 * Check if a language is supported by Prism
 * @param {string} language - The language to check
 * @returns {boolean} Whether the language is supported
 */
function isLanguageSupported(language) {
  const normalizedLang = getNormalizedLanguage(language);
  
  // Common supported languages
  const supportedLanguages = [
    'javascript', 'typescript', 'jsx', 'tsx', 'css', 'html', 
    'python', 'ruby', 'bash', 'c', 'cpp', 'csharp', 'go', 
    'java', 'php', 'sql', 'swift', 'json', 'yaml', 'markdown'
  ];
  
  return supportedLanguages.includes(normalizedLang);
}

/**
 * Get file extension for a language
 * @param {string} language - The programming language
 * @returns {string} The file extension
 */
function getFileExtension(language) {
  const extensions = {
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
    'xml': 'xml',
    'yaml': 'yml',
    'markdown': 'md',
    'bash': 'sh',
    'shell': 'sh',
    'sql': 'sql'
  };
  
  return extensions[language.toLowerCase()] || 'txt';
}

/**
 * Load Prism.js dynamically
 * @returns {Promise} Promise that resolves when Prism is loaded
 */
function loadPrism() {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && !window.Prism) {
      // If we don't have Prism yet, we need to load it
      try {
        // First, load the main Prism stylesheet (we'll override it with our CSS)
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css';
        link.id = 'prism-css';
        document.head.appendChild(link);
        
        // Create script element for Prism core
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js';
        script.async = true;
        document.body.appendChild(script);

        // Add script load handler
        script.onload = () => {
          // After Prism core is loaded, load additional language components
          const commonLanguages = ['javascript', 'css', 'markup', 'python', 'bash', 'json'];
          
          // Load language components in parallel
          const languageLoads = commonLanguages.map(lang => {
            return new Promise((resolveLanguage) => {
              const langScript = document.createElement('script');
              langScript.src = `https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-${lang}.min.js`;
              langScript.async = true;
              langScript.onload = resolveLanguage;
              langScript.onerror = resolveLanguage; // Don't fail if a language fails to load
              document.body.appendChild(langScript);
            });
          });
          
          // Wait for all language components to load
          Promise.all(languageLoads).then(() => resolve());
        };
        
        script.onerror = (error) => {
          console.error('Failed to load Prism.js:', error);
          resolve();
        };
        
        // Append elements to document
        document.head.appendChild(link);
        document.body.appendChild(script);
      } catch (err) {
        console.error('Error loading Prism:', err);
        resolve();
      }
    } else if (typeof window !== 'undefined' && window.Prism) {
      // If Prism is already loaded, resolve immediately
      resolve();
    }
  });
}