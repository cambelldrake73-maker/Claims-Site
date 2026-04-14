# Claims Portal Design System Guide

A comprehensive, scalable design system for the claims management platform. Built with accessibility, performance, and maintainability in mind.

## Quick Start

1. **Link the CSS** in your HTML `<head>`:
   ```html
   <link rel="stylesheet" href="design-system.css">
   ```

2. **Use CSS variables** throughout your custom CSS:
   ```css
   .my-component {
     color: var(--color-primary-600);
     padding: var(--space-6);
     border-radius: var(--radius-lg);
   }
   ```

3. **Build with utility classes** for rapid development:
   ```html
   <div class="flex flex-between gap-4 p-6">
     <h2 class="text-primary">Claims Dashboard</h2>
     <button class="btn btn-primary">New Claim</button>
   </div>
   ```

---

## Design Tokens

### Color Palette

#### Primary (Brand)
- `--color-primary-50` through `--color-primary-900`
- Use `--color-primary-600` for primary actions and interactions
- Use `--color-primary-700` for hover states

**Usage:**
```css
.link { color: var(--color-primary-600); }
.link:hover { color: var(--color-primary-700); }
```

#### Semantic Colors
- **Success**: `--color-success-500`, `--color-success-600`, `--color-success-700`
  - Confirmations, approved claims
- **Warning**: `--color-warning-500`, `--color-warning-600`, `--color-warning-700`
  - Pending actions, review needed
- **Error**: `--color-error-500`, `--color-error-600`, `--color-error-700`
  - Errors, rejected claims, critical alerts

**Usage in claims context:**
```html
<!-- Approved claim -->
<div class="bg-success text-white p-4 rounded">
  <strong class="text-success">✓ Claim Approved</strong>
</div>

<!-- Pending review -->
<div class="bg-warning-light p-4">
  <p class="text-warning">Review Required</p>
</div>

<!-- Rejected claim -->
<div class="bg-error-light p-4">
  <p class="text-error">Claim Rejected</p>
</div>
```

#### Neutrals (Grayscale)
- `--color-slate-50` (lightest) to `--color-slate-900` (darkest)
- `--color-slate-700` for body text (high contrast)
- `--color-slate-600` for secondary text
- `--color-slate-500` for muted/disabled text
- `--color-slate-0` (white) for card backgrounds

### Typography System

#### Font Families
- **Sans Serif (default)**: `--font-family-sans`
  - System fonts for fast loading, excellent readability
- **Monospace**: `--font-family-mono`
  - For code, claim IDs, tracking numbers

#### Font Weights
```css
--fw-light: 300       /* Not common */
--fw-regular: 400     /* Body text */
--fw-medium: 500      /* Secondary headings */
--fw-semibold: 600    /* Headings, emphasis */
--fw-bold: 700        /* Main headings */
```

#### Font Sizes & Line Heights
Pre-paired for excellent readability:
```
--fs-xs (12px) + --lh-xs (1rem)
--fs-sm (14px) + --lh-sm (1.25rem)
--fs-base (16px) + --lh-base (1.5rem)  ← Body default
--fs-lg (18px) + --lh-lg (1.75rem)
--fs-xl (20px) + --lh-xl (1.75rem)     ← Small headings
--fs-2xl (24px) + --lh-2xl (2rem)      ← Section titles
--fs-3xl (30px) + --lh-3xl (2.25rem)
--fs-4xl (36px) + --lh-4xl (2.5rem)    ← Major section headers
--fs-5xl (48px) + --lh-5xl (3.5rem)    ← Hero/page titles
```

**Usage:**
```css
.hero-title {
  font-size: var(--fs-5xl);
  line-height: var(--lh-5xl);
  font-weight: var(--fw-bold);
}

.card-subtitle {
  font-size: var(--fs-sm);
  line-height: var(--lh-sm);
  color: var(--color-slate-600);
}
```

### Spacing Scale (4px Base Unit)

All spacing uses a 4px-based scale for consistency:
```
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px    ← Default padding/margin
--space-6: 24px    ← Section spacing
--space-8: 32px    ← Large padding
--space-12: 48px   ← Between sections
--space-16: 64px   ← Container padding
--space-20: 80px   ← Large section spacing
--space-24: 96px   ← Hero section spacing
```

**Usage:**
```css
.card {
  padding: var(--space-6);
  margin-bottom: var(--space-4);
}

section {
  padding: var(--space-20) var(--space-16);
}
```

### Border Radius
```
--radius-xs: 4px    ← Subtle, minimalist
--radius-sm: 8px    ← Input fields, badges
--radius-md: 12px   ← Default
--radius-lg: 16px   ← Cards, buttons
--radius-xl: 24px   ← Larger cards
--radius-2xl: 28px
--radius-full: 9999px ← Pills, circles
```

### Shadows
- `--shadow-xs`: Subtle lift
- `--shadow-sm`: Default card shadow
- `--shadow-md`: Elevated component
- `--shadow-lg`: Floating element (modals, dropdowns)
- `--shadow-xl`: High emphasis
- `--shadow-2xl`: Maximum depth

---

## Components

### Buttons

All buttons start with `.btn` base class, then add a variant and optional size.

**Variants:**
```html
<!-- Primary (main action) -->
<button class="btn btn-primary">Submit Claim</button>

<!-- Secondary (muted action) -->
<button class="btn btn-secondary">Cancel</button>

<!-- Outline (tertiary action) -->
<button class="btn btn-outline">Learn More</button>

<!-- Ghost (text-only) -->
<button class="btn btn-ghost">Skip</button>

<!-- Success -->
<button class="btn btn-success">Approve</button>

<!-- Error (dangerous action) -->
<button class="btn btn-error">Delete Claim</button>
```

**Sizes:**
```html
<button class="btn btn-sm btn-primary">Small</button>
<button class="btn btn-md btn-primary">Medium (default)</button>
<button class="btn btn-lg btn-primary">Large</button>
```

**Real-world example:**
```html
<div class="flex gap-4">
  <button class="btn btn-primary btn-lg">Submit Claim</button>
  <button class="btn btn-outline">Cancel</button>
</div>
```

### Cards

Container for content with consistent styling.

**Base:**
```html
<div class="card">
  <h3>Revenue Recovery Opportunity</h3>
  <p>Amount at stake: $2,500</p>
  <button class="btn btn-primary">Review Details</button>
</div>
```

**Variants:**
```html
<!-- Compact (less padding) -->
<div class="card card-compact">...</div>

<!-- Large (more padding) -->
<div class="card card-lg">...</div>
```

**Hover interaction:**
Cards lift on hover with increased shadow—no additional classes needed.

### Navigation

**Navbar structure:**
```html
<nav class="navbar">
  <a href="/" class="navbar-brand">Company Name</a>
  <ul class="navbar-menu">
    <li><a href="#services" class="navbar-link">Services</a></li>
    <li><a href="#about" class="navbar-link">About</a></li>
    <li><a href="#contact" class="navbar-link">Contact</a></li>
    <li><a href="/login" class="btn btn-primary">Login</a></li>
  </ul>
</nav>
```

**Active state:**
Add `.active` class to the current page link:
```html
<a href="/" class="navbar-link active">Dashboard</a>
```

### Forms

**Basic form:**
```html
<form>
  <div class="form-group">
    <label for="claimId">Claim ID</label>
    <input type="text" id="claimId" placeholder="Enter claim ID">
  </div>

  <div class="form-group">
    <label for="amount">Claim Amount</label>
    <input type="number" id="amount" placeholder="$0.00">
  </div>

  <div class="form-group">
    <label for="notes">Notes</label>
    <textarea id="notes" rows="4"></textarea>
  </div>

  <button type="submit" class="btn btn-primary">Submit</button>
</form>
```

**Focus states:** Inputs show a blue ring on focus (automatic).

---

## Utility Classes

### Quick reference for common patterns:

**Flexbox:**
```html
<div class="flex gap-4">...</div>           <!-- row, gap -->
<div class="flex flex-col gap-6">...</div>  <!-- column, gap -->
<div class="flex flex-center">...</div>     <!-- centered -->
<div class="flex flex-between">...</div>    <!-- space-between -->
```

**Text:**
```html
<p class="text-primary">Primary text</p>
<p class="text-secondary">Secondary text</p>
<p class="text-center">Centered</p>
<p class="text-muted">Muted/disabled</p>
```

**Spacing:**
```html
<div class="m-6">16px margin all sides</div>
<div class="mb-4">16px margin-bottom</div>
<div class="p-8">32px padding</div>
<div class="px-6 py-4">Horizontal/vertical padding</div>
```

**Display:**
```html
<div class="block">Block element</div>
<span class="inline-block">Inline-block</span>
```

---

## Grid System

**CSS Grid with responsive cols:**
```html
<!-- 2-column on desktop, 1 on mobile -->
<div class="grid grid-2">
  <div class="card">Card 1</div>
  <div class="card">Card 2</div>
</div>

<!-- 3-column -->
<div class="grid grid-3">
  <div class="card">Card 1</div>
  <div class="card">Card 2</div>
  <div class="card">Card 3</div>
</div>

<!-- Auto-fit (responsive) -->
<div class="grid grid-auto">
  <div class="card">...</div>
  <div class="card">...</div>
  <div class="card">...</div>
</div>
```

---

## Real-World Examples

### Claims Dashboard

```html
<div class="container">
  <section>
    <div class="flex flex-between mb-8">
      <div>
        <h1>Claims Dashboard</h1>
        <p class="text-secondary">Review and manage incoming claims</p>
      </div>
      <button class="btn btn-primary btn-lg">+ New Claim</button>
    </div>

    <div class="grid grid-3 mb-12">
      <!-- KPI Cards -->
      <div class="card">
        <h4 class="text-primary">Pending</h4>
        <p style="font-size: var(--fs-4xl); font-weight: var(--fw-bold);">24</p>
      </div>
      <div class="card">
        <h4 class="text-success">Approved</h4>
        <p style="font-size: var(--fs-4xl); font-weight: var(--fw-bold);">156</p>
      </div>
      <div class="card">
        <h4 class="text-error">Rejected</h4>
        <p style="font-size: var(--fs-4xl); font-weight: var(--fw-bold);">18</p>
      </div>
    </div>

    <!-- Claims List -->
    <div class="grid grid-auto">
      <div class="card">
        <div class="flex flex-between mb-4">
          <h4>CLM-2024-001</h4>
          <span class="text-warning">Pending</span>
        </div>
        <p class="text-secondary">Amount: $5,000</p>
        <p class="text-secondary mb-4">Filed: Mar 5, 2026</p>
        <button class="btn btn-primary btn-sm">Review</button>
      </div>

      <div class="card">
        <div class="flex flex-between mb-4">
          <h4>CLM-2024-002</h4>
          <span class="text-success">Approved</span>
        </div>
        <p class="text-secondary">Amount: $3,200</p>
        <p class="text-secondary mb-4">Approved: Mar 3, 2026</p>
        <button class="btn btn-outline btn-sm">View Details</button>
      </div>
    </div>
  </section>
</div>
```

### Claim Review Form

```html
<section>
  <div class="container container-sm">
    <h1 class="text-center mb-12">Review Claim</h1>

    <div class="card card-lg">
      <form>
        <!-- Claim Info -->
        <div class="mb-8">
          <h3>Claim Information</h3>
          <div class="form-group">
            <label>Claim ID: CLM-2024-001</label>
          </div>
          <div class="form-group">
            <label for="amount">Original Amount</label>
            <input type="number" id="amount" value="5000" readonly>
          </div>
        </div>

        <!-- Review Section -->
        <div class="mb-8">
          <h3>Your Review</h3>
          <div class="form-group">
            <label for="decision">Decision</label>
            <select id="decision">
              <option>Select decision...</option>
              <option value="approve">Approve</option>
              <option value="reject">Reject</option>
              <option value="review">Request More Info</option>
            </select>
          </div>

          <div class="form-group">
            <label for="notes">Notes</label>
            <textarea id="notes" rows="6" placeholder="Add your review notes..."></textarea>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-4">
          <button type="submit" class="btn btn-success btn-lg">Approve Claim</button>
          <button type="button" class="btn btn-outline btn-lg">Cancel</button>
        </div>
      </form>
    </div>
  </div>
</section>
```

---

## Accessibility

The design system includes built-in accessibility features:

1. **Color contrast**: All text meets WCAG AA standards (4.5:1)
2. **Focus states**: All interactive elements have visible focus indicators
3. **Motion**: Respects `prefers-reduced-motion`
4. **High contrast**: Responds to `prefers-contrast: more`
5. **Form labels**: Always use `<label>` with proper `for` attributes
6. **Semantic HTML**: Use proper heading hierarchy (h1 → h6)

**Testing checklist:**
- [ ] Tab through all interactive elements
- [ ] Check color contrast with WebAIM
- [ ] Test with a screen reader
- [ ] Verify focus indicators are visible

---

## Dark Mode (Optional)

To add dark mode support, expand the `:root` and `@media (prefers-color-scheme: dark)` section.

**Currently:** Light mode only (you can add dark mode variables if needed)

---

## Responsive Breakpoints

The design system includes mobile-first breakpoints:
- **Mobile**: 480px and below
- **Tablet**: 768px and below
- **Desktop**: 1024px and above
- **Large desktop**: 1280px+ (no explicit breakpoint, inherits from above)

**Example responsive class:**
```css
@media (max-width: 768px) {
  .hide-mobile { display: none; }
}
```

---

## Migration Guide (From Old CSS)

1. **Replace inline `style` attributes** with utility classes:
   ```html
   <!-- Before -->
   <div style="background: white; padding: 28px; border-radius: 18px;">

   <!-- After -->
   <div class="card">
   ```

2. **Update color names** to CSS variables:
   ```css
   /* Before */
   background: #2563eb;

   /* After */
   background: var(--color-primary-600);
   ```

3. **Use button classes** instead of `.login-btn`, `.primary-btn`:
   ```html
   <!-- Before -->
   <a href="/" class="login-btn">Login</a>

   <!-- After -->
   <a href="/" class="btn btn-primary">Login</a>
   ```

4. **Use grid utilities** instead of custom flexbox:
   ```html
   <!-- Before -->
   <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px;">

   <!-- After -->
   <div class="grid grid-auto">
   ```

---

## Next Steps

1. **Integrate into HTML files**: Replace inline styles with the design system
2. **Create component library**: Document reusable patterns (modals, breadcrumbs, tables, etc.)
3. **Add dark mode**: Extend `:root` with dark color overrides
4. **Extend variables**: Add project-specific tokens as needed
5. **Test accessibility**: Audit with WAVE or Axe DevTools

---

## Questions?

Refer back to the CSS variables section or check the `.css` file directly for complete token documentation.
