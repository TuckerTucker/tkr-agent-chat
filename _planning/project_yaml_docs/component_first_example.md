# Documentation: Component-First YAML Descriptions for Web Apps

## Introduction
This document provides guidelines for structuring YAML descriptions of web applications using a component-first approach. The goal is to create maintainable, self-contained component definitions where each component encapsulates its own behaviors, states, and requirements.

---

## 1. Component Encapsulation
Each component should be self-contained, including:

- **Metadata**: Purpose and unique dependencies (avoid repeating global dependencies)
- **Properties**: Visual and structural attributes
- **State**: Component-specific state management
- **Interactions**: User events and behaviors
- **Accessibility**: ARIA labels and keyboard navigation
- **Validation**: Rules and constraints
- **Responsive**: Screen-size adaptations

> **Best Practice:** Reference global dependencies or documentation links at the top level of your YAML. Only specify unique or component-specific dependencies within each component.

Example of an encapsulated component:
```yaml
button:
  metadata:
    purpose: "Primary action trigger"
    required: true
  properties:
    text: "Submit"
    style: "primary"
  state:
    store: "button_state"
    initial:
      disabled: false
      loading: false
  interactions:
    on_click:
      action: "submit_form"
      behavior:
        animation: "pulse"
        duration: "0.3s"
  accessibility:
    role: "button"
    aria_label: "Submit form"
    keyboard_shortcut: "Enter"
  validation:
    required: true
    min_width: "100px"
  responsive:
    mobile:
      width: "100%"
    desktop:
      width: "auto"
```

---

## 1.1 Documentation and Reference Links

- **Consolidate all documentation, onboarding, and reference links into a single section** (e.g., `documentation_links`) at the top level of your YAML. This reduces redundancy and makes onboarding easier.

Example:
```yaml
documentation_links:
  onboarding: "README.md"
  api_reference: "api_docs.md"
  design_system: "https://ui.shadcn.com"
  storybook: "https://storybook.js.org/"
```

---

## 1.2 Example Configs and Reusability

- **Reference example configs (such as agent metadata) directly within relevant sections** or as comments/examples, rather than duplicating information in multiple places.

Example:
```yaml
# Example agent config for reference (see agents/ directory for real configs)
agent_metadata_example:
  id: "chloe"
  name: "Chloe"
  color: "rgb(34 197 94)"
  description: "Git operations and general help"
  capabilities: ["git", "search", "explain"]
  icon_path: "agents/chloe/src/assets/chloe.svg"
  version: "1.0.0"
```

---

## 1.3 Minimize Repetition

- **Avoid repeating metadata (such as dependencies) in every component.** Use global references or only specify unique values per component.
- **Testing and onboarding documentation** should be explicit but not redundant—reference global sections where possible.

---

## 1.4 Balance Detail and Maintainability

- **Be explicit with context and requirements, but avoid unnecessary repetition.**
- **Use comments and references** to maintain clarity without duplicating information.

---

## 2. Component Structure

### 2.1 Metadata
Defines the component's purpose and relationships:
```yaml
metadata:
  purpose: "Display project phase and progress"
  dependencies: ["theme"]
  required: true
```

### 2.2 Properties
Core visual and functional attributes:
```yaml
properties:
  background_color: "#4CAF50"
  padding: "16px"
  text_align: "center"
```

### 2.3 State Management
Component-specific state handling:
```yaml
state:
  store: "progress"
  initial:
    current_phase: "Understand"
    completed_phases: []
  actions:
    - "update_phase"
    - "mark_complete"
```

### 2.4 Interactions
User events and their behaviors:
```yaml
interactions:
  on_click:
    action: "navigate_slides"
    behavior:
      transition: "slide"
      direction: "next"
      duration: "0.5s"
```

### 2.5 Accessibility
Component-specific accessibility features:
```yaml
accessibility:
  role: "navigation"
  aria_label: "Project progress"
  keyboard_shortcuts:
    "ArrowRight": "next_phase"
    "ArrowLeft": "previous_phase"
```

### 2.6 Validation
Component-specific validation rules:
```yaml
validation:
  states: ["active", "inactive", "complete"]
  transitions:
    - from: "active"
      to: ["complete"]
    - from: "inactive"
      to: ["active"]
```

### 2.7 Responsive Behavior
Component-specific layout adjustments:
```yaml
responsive:
  mobile:
    type: "stack"
    spacing: "16px"
  desktop:
    type: "grid"
    columns: 2
```

---

## 3. Global Configuration
While components encapsulate their specific behaviors, some configurations remain at the global level:

### 3.1 Theme
Global styling tokens:
```yaml
theme:
  colors:
    primary: "#4CAF50"
    secondary: "#607D8B"
  typography:
    font_family: "sans-serif"
  spacing:
    small: "8px"
    large: "24px"
```

### 3.2 System
Application-wide settings:
```yaml
system:
  performance:
    image_optimization:
      formats: ["webp"]
    caching:
      strategy: "stale-while-revalidate"
  security:
    authentication: true
    roles:
      admin: ["edit", "delete"]
```

### 3.3 Development
Project-wide development configuration:
```yaml
development:
  framework: "React"
  testing:
    unit: "Jest"
    coverage_threshold: 80
```

### 3.4 Data Sources
Global data handling:
```yaml
data_sources:
  projects:
    type: "REST API"
    base_url: "/api/v1"
    endpoints:
      get_project:
        path: "/projects/{id}"
        cache_duration: "5m"
```

---

## 4. Benefits of Component Encapsulation

1. **Maintainability**
   - All related functionality is co-located
   - Changes can be made in one place
   - Reduced risk of inconsistencies

2. **Clarity**
   - Clear component boundaries
   - Self-documented behavior
   - Explicit dependencies

3. **Reusability**
   - Components are self-contained
   - Easy to copy between projects
   - Clear requirements

4. **Testing**
   - Validation rules are component-specific
   - Behaviors are clearly defined
   - States are explicitly managed

5. **AI Understanding**
   - Clear relationships between features
   - Explicit context for each component
   - Well-defined boundaries

---

## Conclusion
This component-first approach to YAML descriptions creates more maintainable and understandable components. By encapsulating all related functionality within each component, we create a clearer structure that benefits both human developers and AI agents working with the codebase.
