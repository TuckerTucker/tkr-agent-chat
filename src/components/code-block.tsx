import React, { useEffect, useRef } from 'react';
import Prism from 'prismjs';
// Import necessary language definitions for Prism.
// Start with common ones, add more as needed.
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-yaml';
// Import a Prism theme CSS file (e.g., prism-okaidia)
// Make sure this CSS is loaded globally or imported here
// import 'prismjs/themes/prism-okaidia.css'; // Example: Choose a theme
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ code, language, className }) => {
  const codeRef = useRef<HTMLElement>(null);

  // Determine the Prism language class
  // Fallback to 'markup' if language is unknown or not provided
  const langClass = language && Prism.languages[language] ? `language-${language}` : 'language-markup';

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [code, language]); // Re-highlight if code or language changes

  return (
    <pre className={cn("code-block rounded-md my-2 overflow-x-auto", className)}>
      {/* Add data-prismjs-copy attribute for potential copy button integration */}
      <code ref={codeRef} className={cn(langClass, "block p-4 text-sm")} data-prismjs-copy="Copy">
        {code}
      </code>
    </pre>
  );
};

export default CodeBlock;
