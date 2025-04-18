# UI Style Guide

## Color System

### Base Colors
We use HSL values for consistent color manipulation:
```css
--color-white: 0 0% 100%
--color-black: 0 0% 3.9%
--color-gray-{50-900}: /* Grayscale spectrum */
```

### Semantic Colors
Colors are assigned semantic meanings for consistent application:
```css
--background: Base page background
--foreground: Primary text color
--primary: Primary actions and highlights
--secondary: Secondary actions and backgrounds
--accent: Subtle highlights and hover states
--muted: De-emphasized content
--destructive: Error states and destructive actions
```

### Component-Specific Colors
Components use semantic colors with specific modifiers:
```css
/* Example: Message component */
--agent-message-border: color for agent messages
--agent-message-bg: Background for agent messages
--agent-avatar-bg: Avatar background color
```

## Theme System

### Light/Dark Mode
- Uses Tailwind's `dark` class for theme switching
- CSS variables adapt automatically based on theme
- Components should use semantic color variables, not direct color values

### Agent Theming
- Each agent has a unique color scheme
- Uses `data-agent` attribute for styling
- Maintains consistent contrast ratios in both themes

## Typography

### Font Scale
Use Tailwind's built-in size classes:
```css
text-xs: 0.75rem
text-sm: 0.875rem
text-base: 1rem
text-lg: 1.125rem
text-xl: 1.25rem
```

### Prose
Use the `prose` classes for formatted text content:
```css
prose prose-sm: Markdown content
prose-p:my-2: Consistent paragraph spacing
prose-pre:my-2: Code block spacing
```

## Spacing

### Standard Spacing
Use Tailwind's spacing scale:
```css
gap-1: 0.25rem
gap-2: 0.5rem
gap-3: 0.75rem
gap-4: 1rem
```

### Component Spacing
- Maintain consistent internal spacing within components
- Use gap utilities for flex and grid layouts
- Prefer relative units (rem) over fixed units (px)

## Transitions

### Duration
```css
duration-theme: var(--theme-transition-duration)
```

### Properties
```css
transition-colors: Color changes
transition-opacity: Visibility changes
transition-all: Combined property changes
```

## Shadows

### Depth Scale
```css
shadow: Subtle elevation
shadow-md: Medium elevation
shadow-lg: Prominent elevation
```

## Radius

### Scale
```css
rounded-sm: calc(var(--radius) - 4px)
rounded-md: calc(var(--radius) - 2px)
rounded-lg: var(--radius)
```

## Component Patterns

### Interactive Elements
- Use `hover:` and `focus:` states consistently
- Maintain WCAG contrast requirements
- Include focus indicators for accessibility

### Message Component
```css
/* Container */
max-w-[85%] md:max-w-[70%]  /* Responsive width */
rounded-lg shadow-md        /* Consistent elevation */

/* Status Indicators */
text-xs text-muted-foreground  /* De-emphasized text */
```

### Buttons
```css
/* Ghost variant */
hover:bg-accent
hover:text-accent-foreground
transition-colors
```

## Best Practices

1. **Color Usage**
   - Always use semantic color variables
   - Avoid hard-coded color values
   - Maintain consistent contrast ratios

2. **Responsive Design**
   - Use relative units (rem, em)
   - Implement mobile-first breakpoints
   - Test across device sizes

3. **Accessibility**
   - Include ARIA labels
   - Maintain keyboard navigation
   - Ensure sufficient color contrast

4. **Performance**
   - Use CSS transitions sparingly
   - Implement will-change for heavy animations
   - Optimize render performance

5. **Maintenance**
   - Follow BEM-style class naming
   - Keep component styles modular
   - Document custom utilities

## CSS Variable Naming Convention

1. **Base Colors**
   ```css
   --color-{name}: {value}
   ```

2. **Semantic Colors**
   ```css
   --{purpose}: var(--color-{name})
   ```

3. **Component Variables**
   ```css
   --{component}-{property}: var(--{semantic-color})
   ```

## Code Examples

### Proper Color Usage
```tsx
// ✅ Good
className="bg-primary text-primary-foreground"

// ❌ Bad
className="bg-[#007bff] text-white"
```

### Consistent Spacing
```tsx
// ✅ Good
className="space-y-2 px-4 py-3"

// ❌ Bad
className="margin-bottom-10px padding-20px"
```

### Theme Transitions
```tsx
// ✅ Good
className="transition-colors duration-theme"

// ❌ Bad
className="transition-all duration-500"
