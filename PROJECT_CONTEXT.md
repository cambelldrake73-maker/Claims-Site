# Medical Claims Dashboard – Project Context

## Product Purpose
This system is a medical billing and claims management dashboard designed to help clinics recover revenue from denied insurance claims.

The platform should prioritize:
- clarity
- speed of workflow
- financial insights
- HIPAA safety

---

## Design Philosophy

The UI should feel:

• clean and modern  
• minimal cognitive load  
• professional healthcare software  

Design inspiration:

- Stripe dashboard
- Linear
- Vercel
- modern SaaS analytics

Avoid:

- clutter
- overly bright colors
- complex navigation

---

## Layout Rules

All pages follow this structure:

Sidebar navigation (collapsible)
Top header with account / notifications
Main content area

Sidebar width:
- expanded: 240px
- collapsed: 56px

Navigation icons must always remain visible when collapsed.

---

## UI Components

Use consistent reusable components:

Cards
Tables
Status badges
Charts
Forms

Design system file:

design-system.css

All new styling should go here.

---

## Claims Workflow

Claim lifecycle:

Submitted
Pending
Approved
Denied
Appealed
Recovered

The dashboard should visualize:

- denial rates
- recovered revenue
- aging claims

---

## Security Constraints

The AI must never modify:

reports-files/
claims-pdfs/
agreements-files/
invoices/

These contain financial or HIPAA data.

---

## AI Development Rules

AI should prioritize:

- UI improvements
- workflow improvements
- analytics dashboards
- navigation usability
- form validation
