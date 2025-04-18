# Z-Index Guide

This guide outlines the z-index hierarchy used throughout the application to ensure consistent layering of UI elements.

## Z-Index Scale

### Base Layers (0-10)
```css
z-base: 0      /* Default layer */
z-raised: 1    /* Slightly elevated elements */
z-default: 10  /* Standard UI elements */
```

### Message Components (10-30)
```css
z-message-base: 10     /* Message content */
z-message-actions: 20  /* Message action buttons */
z-message-overlay: 30  /* Message overlays (e.g., loading states) */
```

### Navigation and Overlays (40-90)
```css
z-backdrop: 40   /* Modal/drawer backdrops */
z-drawer: 50     /* Slide-out drawers */
z-sidebar: 60    /* Main sidebar */
z-modal: 70      /* Modal dialogs */
z-popover: 80    /* Popovers */
z-tooltip: 90    /* Tooltips */
```

### Top-Level Elements (100+)
```css
z-toast: 100     /* Toast notifications */
z-menu: 110      /* Dropdown menus */
z-dropdown: 120  /* Dropdown panels */
```

### Special Cases
```css
z-max: 9999  /* Maximum z-index for critical overlays */
```

## Usage Guidelines

1. **Component Layering**
   - Use the appropriate z-index range for your component type
   - Stay within the defined ranges to maintain hierarchy
   - Consider the component's context and relationship to other elements

2. **Mobile Considerations**
   - Mobile navigation should use `z-sidebar`
   - Mobile overlays should use `z-backdrop`
   - Ensure touch targets remain accessible

3. **Stacking Context**
   - Be aware of new stacking contexts created by:
     - `position: relative/absolute/fixed`
     - `opacity` less than 1
     - `transform`
     - `filter`
     - `backdrop-filter`
   - Use `isolation: isolate` when needed to create new stacking contexts

4. **Current Implementation**

### Sidebar and Navigation
```tsx
// Mobile backdrop
className="z-backdrop"  // z-40

// Sidebar
className="z-sidebar"   // z-60

// Mobile menu button
className="z-sidebar"   // z-60
```

### Message Components
```tsx
// Message actions container
className="z-message-actions"  // z-20

// Message functions
className="z-message-actions"  // z-20
```

5. **Best Practices**
   - Always use the semantic z-index variables
   - Avoid arbitrary z-index values
   - Document any custom z-index requirements
   - Consider the entire component tree when adding new layers

6. **Troubleshooting**

If elements aren't stacking correctly:
1. Check if parent elements create new stacking contexts
2. Verify z-index values are in the correct range
3. Ensure positioning is set correctly (relative/absolute/fixed)
4. Consider using `isolation: isolate` to create new stacking contexts

## Examples

### Modal Dialog
```tsx
<div className="z-backdrop">  {/* Backdrop */}
  <div className="z-modal">   {/* Modal content */}
    <div className="z-tooltip"> {/* Tooltips within modal */}
      ...
    </div>
  </div>
</div>
```

### Dropdown Menu
```tsx
<button className="z-default">
  <div className="z-dropdown"> {/* Dropdown panel */}
    <div className="z-tooltip"> {/* Tooltips within dropdown */}
      ...
    </div>
  </div>
</button>
```

### Message with Actions
```tsx
<div className="z-message-base">     {/* Message content */}
  <div className="z-message-actions"> {/* Action buttons */}
    ...
  </div>
</div>
