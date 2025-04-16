import React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

/**
 * Input variants using class-variance-authority
 */
const inputVariants = cva(
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "",
        search: "pl-9", // Extra padding left for search icon
        error: "border-destructive focus-visible:ring-destructive",
      },
      size: {
        default: "h-10",
        sm: "h-8 px-2 text-xs",
        lg: "h-12 px-4 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

/**
 * Input component for text entry
 * @param {Object} props - Component props
 * @param {string} props.className - Additional CSS classes
 * @param {('default'|'search'|'error')} props.variant - Input variant
 * @param {('default'|'sm'|'lg')} props.size - Input size
 * @param {string} [props.id] - Unique identifier for the input
 * @param {string} [props.aria-label] - Accessible label when visible label isn't present
 * @param {string} [props.aria-describedby] - ID of element containing additional description
 * @param {boolean} [props.aria-invalid] - Whether the input contains an invalid value
 * @returns {JSX.Element} Input component
 */
const Input = React.forwardRef(({ 
  className, 
  variant,
  size,
  type = "text",
  "aria-invalid": ariaInvalid,
  ...props 
}, ref) => {
  // Auto set aria-invalid for error variant
  const isInvalid = ariaInvalid || variant === "error";
  
  return (
    <input
      type={type}
      className={cn(inputVariants({ variant, size, className }))}
      ref={ref}
      aria-invalid={isInvalid ? "true" : undefined}
      {...props}
    />
  );
});

Input.displayName = "Input";

export { Input, inputVariants };