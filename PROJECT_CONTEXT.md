AI ROLE: Senior software architect responsible for improving the system design of this product.
## Product Purpose


This system is a medical billing and claims management dashboard designed to help clinics recover revenue from denied insurance claims.

The platform should prioritize:

- clarity
- fast workflows
- financial insights
- HIPAA safety
- operational efficiency for billing teams

---

## Design Philosophy

The UI should feel:

• clean and modern  
• minimal cognitive load  
• professional healthcare software  

Design inspiration:

- Stripe Dashboard
- Linear
- Vercel
- modern SaaS analytics tools

Avoid:

- clutter
- overly bright colors
- complex navigation
- unnecessary UI elements

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

All styling changes should be centralized in this file.

Avoid creating inline styles or duplicate component styles.

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
- claim lifecycle timelines

Analytics should help billing teams quickly identify revenue opportunities.

---

## Architecture Direction

The current application is a static HTML + JavaScript dashboard.

Future architecture should move toward:

- modular UI components
- reusable UI patterns
- shared design system
- centralized JavaScript logic
- improved data flow between pages

Long term the system may evolve toward:

- backend APIs
- server-side authentication
- structured data models
- modular frontend architecture

AI should generate tasks that move the system toward a maintainable architecture.

---

## Security Constraints

The AI must never modify or access files in:

reports-files/  
claims-pdfs/  
agreements-files/  
invoices/

These contain financial or HIPAA-protected information.

The AI may modify the **UI or structure surrounding these files**, but must never edit the files themselves.

---

## Engineering Priorities

The AI should prioritize tasks that improve:

- maintainability
- modular architecture
- code reuse
- system performance
- scalability
- workflow efficiency
- security

Avoid tasks that only provide small cosmetic improvements.

---

## AI Development Rules

The AI should behave like a **senior software engineer reviewing the project**.

Only generate tasks that improve:

- architecture
- usability of workflows
- analytics and reporting
- maintainability
- navigation clarity
- developer automation

Do NOT generate tasks that involve:

- minor CSS tweaks
- simple spacing changes
- trivial color changes
- minor HTML formatting fixes
---

## Primary User Workflow

The primary user of this system is a medical billing employee responsible for recovering revenue from denied or unpaid insurance claims.

Typical workflow:

1. Review dashboard
   - check denied claims
   - review aging claims
   - identify revenue recovery opportunities

2. Open claims list
   - filter by denial status
   - filter by payer
   - filter by aging time

3. Review individual claim
   - check denial reason
   - verify patient information
   - verify billing codes

4. Take action
   - submit corrected claim
   - appeal denial
   - contact payer
   - track follow-up status

5. Track outcomes
   - claim approved
   - claim recovered
   - patient balance generated

The system should optimize for:

- fast claim review
- fast denial identification
- clear financial visibility
- minimal navigation friction

AI improvements should prioritize making this workflow faster and clearer.
CORE PRODUCT GOAL

This system is a medical claim recovery platform.

Primary workflow:

1. Clinics upload denied insurance claims
2. System parses claims and denial codes
3. System identifies recoverable revenue
4. System suggests claim corrections
5. Human reviewer audits the correction
6. Approved claims are formatted into EDI 837
7. Claims are submitted to clearinghouses
8. Claim status and reimbursements are tracked

System priorities:

- claim ingestion pipeline
- denial code intelligence
- claim normalization
- clearinghouse integration (EDI 837)
- human review dashboard
- claim audit logging
- secure PHI handling

Avoid building cosmetic UI improvements unless required.
Focus on backend claim processing systems.
