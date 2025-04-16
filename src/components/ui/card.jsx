import React from "react";
import { cn } from "../../lib/utils";

/**
 * Card component for grouping related content
 * @param {Object} props - Component props
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Child components
 * @param {string} [props.role] - ARIA role for the card
 * @returns {JSX.Element} Card component
 */
const Card = React.forwardRef(({ className, role = "region", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className
    )}
    role={role}
    tabIndex={role === "region" ? 0 : undefined}
    {...props}
  />
));
Card.displayName = "Card";

/**
 * Card header for title and description
 * @param {Object} props - Component props
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Child components
 * @returns {JSX.Element} Card header component
 */
const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

/**
 * Card title component
 * @param {Object} props - Component props
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Child components
 * @param {string} [props.id] - ID for the title element
 * @returns {JSX.Element} Card title component
 */
const CardTitle = React.forwardRef(({ className, id, ...props }, ref) => (
  <h3
    ref={ref}
    id={id}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

/**
 * Card description component
 * @param {Object} props - Component props
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Child components
 * @param {string} [props.id] - ID for the description element
 * @returns {JSX.Element} Card description component
 */
const CardDescription = React.forwardRef(({ className, id, ...props }, ref) => (
  <p
    ref={ref}
    id={id}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

/**
 * Card content component
 * @param {Object} props - Component props
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Child components
 * @returns {JSX.Element} Card content component
 */
const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div 
    ref={ref} 
    className={cn("p-6 pt-0", className)} 
    {...props} 
  />
));
CardContent.displayName = "CardContent";

/**
 * Card footer component
 * @param {Object} props - Component props
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Child components
 * @returns {JSX.Element} Card footer component
 */
const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };