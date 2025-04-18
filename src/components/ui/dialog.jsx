import React from "react";
import { cn } from "../../lib/utils";

/**
 * Dialog context for managing dialog state
 */
const DialogContext = React.createContext({
  open: false,
  setOpen: () => {},
});

/**
 * Dialog provider component
 * @param {Object} props - Component props
 * @param {boolean} props.open - Whether the dialog is open
 * @param {Function} props.onOpenChange - Function to call when open state changes
 * @param {React.ReactNode} props.children - Child components
 * @returns {JSX.Element} Dialog provider
 */
const Dialog = ({ 
  children, 
  open = false, 
  onOpenChange = () => {} 
}) => {
  // Use effect to manage body scroll lock when dialog is open
  React.useEffect(() => {
    if (open) {
      // Save the current scroll position
      const scrollY = window.scrollY;
      // Add styles to prevent body scrolling
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      
      // Return a cleanup function
      return () => {
        // Remove styles to restore body scrolling
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        // Restore scroll position
        window.scrollTo(0, scrollY);
      };
    }
  }, [open]);
  
  return (
    <DialogContext.Provider value={{ open, setOpen: onOpenChange }}>
      {children}
    </DialogContext.Provider>
  );
};

/**
 * Dialog trigger component
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 * @param {string} [props.aria-controls] - ID of the dialog being controlled
 * @param {string} [props.aria-haspopup] - Indicates the trigger opens a dialog
 * @returns {JSX.Element} Dialog trigger
 */
const DialogTrigger = ({ 
  children, 
  "aria-controls": ariaControls,
  "aria-haspopup": ariaHasPopup = "dialog",
  ...props 
}) => {
  const { setOpen } = React.useContext(DialogContext);
  
  return React.cloneElement(React.Children.only(children), {
    ...props,
    "aria-haspopup": ariaHasPopup,
    "aria-controls": ariaControls,
    "aria-expanded": false, // This would ideally be updated based on dialog state
    onClick: (e) => {
      children.props.onClick?.(e);
      setOpen(true);
    },
  });
};

/**
 * Dialog portal component
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 * @returns {JSX.Element|null} Dialog portal or null if not open
 */
const DialogPortal = ({ children }) => {
  const { open } = React.useContext(DialogContext);
  
  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {children}
    </div>
  );
};

/**
 * Dialog overlay component
 * @param {Object} props - Component props
 * @param {string} props.className - Additional CSS classes
 * @returns {JSX.Element} Dialog overlay
 */
const DialogOverlay = ({ className, ...props }) => {
  const { setOpen } = React.useContext(DialogContext);
  
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm transition-all duration-100",
        className
      )}
      onClick={() => setOpen(false)}
      aria-hidden="true"
      {...props}
    />
  );
};

/**
 * Dialog content component
 * @param {Object} props - Component props
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Child components
 * @param {string} [props.aria-labelledby] - ID of the element labeling the dialog
 * @param {string} [props.aria-describedby] - ID of the element describing the dialog
 * @returns {JSX.Element} Dialog content
 */
const DialogContent = ({ 
  className, 
  children, 
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
  ...props 
}) => {
  const { setOpen } = React.useContext(DialogContext);
  const contentRef = React.useRef(null);
  
  // Prevent click events from propagating to overlay
  const handleContentClick = (e) => {
    e.stopPropagation();
  };
  
  // Focus trap management
  React.useEffect(() => {
    const dialogElement = contentRef.current;
    if (!dialogElement) return;
    
    // Focus the dialog when it opens
    dialogElement.focus();
    
    // Trap focus inside dialog
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      
      // Trap focus inside the dialog
      if (e.key === "Tab") {
        const focusableElements = dialogElement.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        if (e.shiftKey && document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };
    
    dialogElement.addEventListener("keydown", handleKeyDown);
    return () => {
      dialogElement.removeEventListener("keydown", handleKeyDown);
    };
  }, [setOpen]);
  
  return (
    <div
      ref={contentRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledby}
      aria-describedby={ariaDescribedby}
      className={cn(
        "fixed z-50 grid w-full max-w-lg scale-100 gap-4 bg-background p-6 shadow-lg duration-200 sm:rounded-lg",
        className
      )}
      onClick={handleContentClick}
      tabIndex={-1}
      {...props}
    >
      {children}
      <button
        className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
        onClick={() => setOpen(false)}
        aria-label="Close dialog"
        type="button"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
};

/**
 * Dialog header component
 * @param {Object} props - Component props
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Child components
 * @returns {JSX.Element} Dialog header
 */
const DialogHeader = ({ className, ...props }) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
);

/**
 * Dialog footer component
 * @param {Object} props - Component props
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Child components
 * @returns {JSX.Element} Dialog footer
 */
const DialogFooter = ({ className, ...props }) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
);

/**
 * Dialog title component
 * @param {Object} props - Component props
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Child components
 * @param {string} [props.id] - ID to reference this title from aria-labelledby
 * @returns {JSX.Element} Dialog title
 */
const DialogTitle = ({ className, id = "dialog-title", ...props }) => (
  <h2
    id={id}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
);

/**
 * Dialog description component
 * @param {Object} props - Component props
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Child components
 * @param {string} [props.id] - ID to reference this description from aria-describedby
 * @returns {JSX.Element} Dialog description
 */
const DialogDescription = ({ className, id = "dialog-description", ...props }) => (
  <p
    id={id}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
);

Dialog.displayName = "Dialog";
DialogTrigger.displayName = "DialogTrigger";
DialogPortal.displayName = "DialogPortal";
DialogOverlay.displayName = "DialogOverlay";
DialogContent.displayName = "DialogContent";
DialogHeader.displayName = "DialogHeader";
DialogFooter.displayName = "DialogFooter";
DialogTitle.displayName = "DialogTitle";
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};