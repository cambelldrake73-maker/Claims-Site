# Design System Tokens - Quick Reference

## Colors

### Primary Brand
```
--color-primary-50   #eff6ff
--color-primary-100  #dbeafe
--color-primary-200  #bfdbfe
--color-primary-400  #60a5fa
--color-primary-500  #3b82f6
--color-primary-600  #2563eb  ← Use this for main CTA
--color-primary-700  #1d4ed8  ← Use for hover
--color-primary-800  #1e40af
--color-primary-900  #1e3a8a
```

### Semantic
```
Success:  #22c55e (500), #16a34a (600), #15803d (700)
Warning:  #eab308 (500), #ca8a04 (600), #a16207 (700)
Error:    #ef4444 (500), #dc2626 (600), #b91c1c (700)
```

### Grayscale (Neutrals)
```
White:    #ffffff (0)
Light:    #f8fafc (50) → #f1f5f9 (100)
Gray:     #e2e8f0 (200) → #cbd5e1 (300)
Silver:   #94a3b8 (400) → #64748b (500)
Dark:     #475569 (600) → #334155 (700)
Darker:   #1e293b (800) → #0f172a (900)
```

---

## Typography

### Font Families
```
Sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif
Mono: 'Monaco', 'Courier New', monospace
```

### Font Weights
```
--fw-light:     300
--fw-regular:   400
--fw-medium:    500
--fw-semibold:  600
--fw-bold:      700
```

### Sizes & Line Heights
| Class | Size | Line Height | Use Case |
|-------|------|-------------|----------|
| --fs-xs | 12px | 1rem | Small labels, badges |
| --fs-sm | 14px | 1.25rem | Captions, help text |
| --fs-base | 16px | 1.5rem | Body text (default) |
| --fs-lg | 18px | 1.75rem | Larger body |
| --fs-xl | 20px | 1.75rem | Small headings |
| --fs-2xl | 24px | 2rem | Card titles |
| --fs-3xl | 30px | 2.25rem | Section headers |
| --fs-4xl | 36px | 2.5rem | Major headers |
| --fs-5xl | 48px | 3.5rem | Page title / hero |

---

## Spacing (4px Base)

| Token | Size | Use |
|-------|------|-----|
| --space-1 | 4px | Tiny gaps |
| --space-2 | 8px | Icon+text gap |
| --space-3 | 12px | Small gaps |
| --space-4 | 16px | **Default padding** |
| --space-5 | 20px | Medium |
| --space-6 | 24px | **Card padding** |
| --space-8 | 32px | Large |
| --space-10 | 40px | Very large |
| --space-12 | 48px | Between sections |
| --space-16 | 64px | **Container padding** |
| --space-20 | 80px | **Section padding** |
| --space-24 | 96px | Hero section |

---

## Border Radius

```
--radius-xs:   4px     (minimal rounding)
--radius-sm:   8px     (inputs, badges)
--radius-md:   12px    (default)
--radius-lg:   16px    (cards, buttons)
--radius-xl:   24px    (large cards)
--radius-2xl:  28px
--radius-full: 9999px  (pills, circles)
```

---

## Shadows

```
--shadow-xs:   0 1px 2px 0 rgba(0,0,0,0.05)
--shadow-sm:   0 1px 3px + 0 1px 2px  (default card)
--shadow-md:   0 4px 6px + 0 2px 4px  (elevated)
--shadow-lg:   0 10px 15px + 0 4px 6px (floating)
--shadow-xl:   0 20px 25px + 0 10px 10px (high)
--shadow-2xl:  0 25px 50px -12px rgba(0,0,0,0.25) (max)
```

---

## Transitions

```
--transition-fast:  150ms ease-in-out
--transition-base:  300ms ease-in-out
--transition-slow:  500ms ease-in-out
```

---

## Z-Index Scale

```
--z-dropdown: 1000  (menus, tooltips)
--z-sticky:   500   (sticky nav)
--z-fixed:    100   (fixed headers)
--z-base:     1     (default)
```

---

## Component Classes

### Buttons
```
.btn                    Base (required)
.btn-primary           Blue, main CTA
.btn-secondary         White/transparent
.btn-outline           Bordered, minimal
.btn-ghost             Text only
.btn-success           Green
.btn-error             Red

.btn-sm                Small (12px)
.btn-md                Medium (14px) — default
.btn-lg                Large (16px)
```

### Cards
```
.card                 Base card
.card-compact         Less padding
.card-lg              More padding
```

### Layout
```
.container            Max-width 1200px
.container-sm         Max-width 800px
.section-title        Centered 36px bold
.section-subtitle     Centered gray text
```

### Grid
```
.grid                 Base grid
.grid-2               2 columns
.grid-3               3 columns
.grid-4               4 columns
.grid-auto            Responsive auto-fit
```

### Flexbox
```
.flex                 Display: flex
.flex-col             Flex direction: column
.flex-center          Align + justify center
.flex-between         Space-between
.gap-2/.gap-4/.gap-6/.gap-8
```

### Text
```
.text-left/.text-center/.text-right
.text-primary         Blue
.text-secondary       Gray
.text-success         Green
.text-error           Red
.text-warning         Yellow
.text-muted           Muted gray
```

### Background
```
.bg-primary           Blue
.bg-primary-light     Light blue
.bg-success           Green
.bg-error             Red
.bg-white             White
```

### Spacing Utilities
```
.m-4/.m-6/.m-8           Margin all
.mb-2/.mb-4/.mb-6        Margin bottom
.mt-4/.mt-6              Margin top
.p-4/.p-6/.p-8           Padding all
.px-4/.px-6              Padding horizontal
.py-4/.py-6              Padding vertical
```

### Display
```
.block               Display: block
.inline              Display: inline
.inline-block        Display: inline-block
.hidden              Display: none
```

---

## Responsive Breakpoints

```
Mobile:         ≤ 480px
Tablet:         ≤ 768px
Desktop:        ≥ 1024px
Large Desktop:  ≥ 1280px
```

---

## Common Patterns

### Hero Section
```html
<section class="hero" style="padding: var(--space-20) var(--space-16);">
  <h1>Title</h1>
  <p>Subtitle</p>
  <div class="flex gap-4">
    <button class="btn btn-primary btn-lg">Primary</button>
    <button class="btn btn-secondary btn-lg">Secondary</button>
  </div>
</section>
```

### Card Grid
```html
<div class="grid grid-auto">
  <div class="card">
    <h3>Title</h3>
    <p>Description</p>
    <button class="btn btn-primary btn-sm">Action</button>
  </div>
  <!-- Repeat -->
</div>
```

### Navigation
```html
<nav class="navbar">
  <a class="navbar-brand">Logo</a>
  <ul class="navbar-menu">
    <li><a class="navbar-link">Link</a></li>
    <li><a class="btn btn-primary">Login</a></li>
  </ul>
</nav>
```

### Form Group
```html
<div class="form-group">
  <label for="id">Label</label>
  <input id="id" type="text" placeholder="...">
</div>
```

### Status Badge
```html
<span class="text-success">✓ Approved</span>
<span class="text-warning">⏱ Pending</span>
<span class="text-error">✕ Rejected</span>
```

---

## CSS Variable Naming Convention

All tokens follow this structure:
```
--[category]-[property]-[value]

Examples:
--color-primary-600
--space-4
--fs-lg
--shadow-md
--radius-xl
--fw-semibold
```

Categories:
- `color-` Color tokens
- `space-` Spacing/sizing
- `fs-` Font size
- `lh-` Line height
- `fw-` Font weight
- `radius-` Border radius
- `shadow-` Box shadow
- `transition-` Animations
- `z-` Z-index

---

## Accessibility Features Built-In

✓ WCAG AA contrast ratios (4.5:1 for text)
✓ Focus indicators on all interactive elements
✓ Respects `prefers-reduced-motion`
✓ Respects `prefers-contrast: more`
✓ Semantic HTML support (proper headings, labels)
✓ High contrast mode support

---

## Quick CSS Tips

**Always use variables:**
```css
/* ❌ Bad */
background: #2563eb;
padding: 24px;

/* ✅ Good */
background: var(--color-primary-600);
padding: var(--space-6);
```

**Combine classes for efficiency:**
```html
<!-- ❌ Long -->
<div style="display: flex; gap: 16px; padding: 24px;">

<!-- ✅ Short -->
<div class="flex gap-4 p-6">
```

**Use semantic colors:**
```html
<!-- ❌ Specific hex -->
<p style="color: #ef4444;">Error</p>

<!-- ✅ Semantic -->
<p class="text-error">Error</p>
```

---

**Last Updated:** March 2026  
**Version:** 1.0  
**Maintainer:** Design System Team
