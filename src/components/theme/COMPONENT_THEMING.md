# Component Theming Guide

This guide explains how to properly theme components in our application using our design system.

## Basic Principles

1. **Use Semantic Colors**
```tsx
// ✅ Good
className="bg-background text-foreground"
className="bg-primary text-primary-foreground"

// ❌ Bad
className="bg-white text-black"
className="bg-[#007bff] text-white"
```

2. **Layer Transparency**
```tsx
// ✅ Good - Uses alpha channel for overlays
className="bg-background/80 backdrop-blur-sm"
className="bg-primary/10"

// ❌ Bad - Hard-coded opacity
className="bg-white opacity-80"
```

3. **Consistent Transitions**
```tsx
// ✅ Good
className="transition-colors duration-theme"
className="transition-all duration-theme"

// ❌ Bad
className="transition-all duration-500"
```

## Component Structure

### 1. Container Elements
```tsx
// Basic container
className={cn(
  "relative w-full",
  "bg-background text-foreground",
  "rounded-lg border-border",
  "shadow-sm"
)}

// Overlay container
className={cn(
  "fixed inset-0",
  "bg-background/80 backdrop-blur-sm",
  "transition-opacity duration-theme"
)}
```

### 2. Interactive Elements
```tsx
// Button
className={cn(
  "flex items-center gap-2",
  "px-4 py-2 rounded-md",
  "bg-primary text-primary-foreground",
  "hover:bg-primary/90",
  "focus:outline-none focus:ring-2 focus:ring-primary",
  "transition-colors duration-theme"
)}

// Input
className={cn(
  "w-full px-3 py-2",
  "bg-background border-input",
  "rounded-md",
  "focus:outline-none focus:ring-2 focus:ring-primary",
  "placeholder:text-muted-foreground"
)}
```

### 3. Status Indicators
```tsx
// Success
className={cn(
  "text-sm font-medium",
  "text-green-500 dark:text-green-400"
)}

// Error
className={cn(
  "text-sm font-medium",
  "text-destructive"
)}

// Loading
className={cn(
  "text-sm font-medium",
  "text-muted-foreground",
  "animate-pulse"
)}
```

## Agent-Specific Theming

### 1. Agent Container
```tsx
className={cn(
  "bg-agent-message-bg",
  "border-l-4 border-agent-message-border",
  "text-foreground"
)}
```

### 2. Agent Controls
```tsx
className={cn(
  "bg-agent-avatar-bg",
  "text-agent-avatar-text",
  "hover:bg-agent-button-hover",
  "active:bg-agent-button-active"
)}
```

## Responsive Design

### 1. Mobile-First Approach
```tsx
className={cn(
  // Base styles
  "w-full p-4",
  // Tablet and up
  "sm:w-[600px] sm:p-6",
  // Desktop
  "lg:w-[800px] lg:p-8"
)}
```

### 2. Sidebar Behavior
```tsx
className={cn(
  // Base styles (mobile)
  "fixed inset-y-0 left-0",
  "w-[280px] bg-sidebar-background",
  "transform transition-transform duration-theme",
  // Tablet and up
  "sm:relative sm:transform-none"
)}
```

## Theme Transitions

### 1. Basic Transitions
```tsx
className="transition-colors duration-theme"  // Color changes only
className="transition-all duration-theme"     // All properties
className="transition-transform duration-theme" // Transforms only
```

### 2. Complex Transitions
```tsx
className={cn(
  "transform transition-all duration-theme",
  "opacity-0 scale-95",
  "group-hover:opacity-100 group-hover:scale-100"
)}
```

## Best Practices

1. **Group Related Classes**
```tsx
className={cn(
  // Layout
  "flex items-center justify-between",
  // Spacing
  "p-4 gap-2",
  // Visual
  "bg-background border-border rounded-lg",
  // Interactive
  "hover:bg-accent focus:ring-2",
  // Transitions
  "transition-colors duration-theme"
)}
```

2. **Use Semantic Variants**
```tsx
// Component definition
const variants = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  outline: "border border-input bg-background hover:bg-accent",
}

// Usage
className={cn(variants[variant], className)}
```

3. **Handle Dark Mode**
```tsx
className={cn(
  "bg-white dark:bg-slate-900",
  "text-slate-900 dark:text-slate-50",
  "border-slate-200 dark:border-slate-800"
)}
```

## Common Patterns

### 1. Card Layout
```tsx
const Card = ({ children, className }) => (
  <div
    className={cn(
      // Base styles
      "rounded-lg border-border",
      "bg-card text-card-foreground",
      "shadow-sm",
      // Spacing
      "p-6",
      // Custom classes
      className
    )}
  >
    {children}
  </div>
)
```

### 2. Dialog/Modal
```tsx
const Dialog = ({ children, className }) => (
  <div
    className={cn(
      // Overlay
      "fixed inset-0 bg-background/80 backdrop-blur-sm",
      // Centering
      "flex items-center justify-center",
      // Animation
      "transition-opacity duration-theme",
      className
    )}
  >
    <div
      className={cn(
        // Base styles
        "relative bg-background",
        "rounded-lg border-border",
        "shadow-lg",
        // Size and spacing
        "w-full max-w-md p-6",
        // Animation
        "transition-all duration-theme"
      )}
    >
      {children}
    </div>
  </div>
)
```

### 3. Form Elements
```tsx
const Input = ({ className, ...props }) => (
  <input
    className={cn(
      // Base styles
      "flex h-10 w-full",
      "rounded-md border-input",
      "bg-background px-3 py-2",
      "text-sm",
      // Focus states
      "focus:outline-none focus:ring-2",
      "focus:ring-primary focus:ring-offset-2",
      // Placeholder
      "placeholder:text-muted-foreground",
      // Disabled state
      "disabled:cursor-not-allowed",
      "disabled:opacity-50",
      className
    )}
    {...props}
  />
)
