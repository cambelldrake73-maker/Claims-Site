## Development Memory

This file records important architectural decisions and completed improvements.

The AI planner must review this file before generating new tasks to avoid repeating work.

---

## System Purpose

Medical claims recovery dashboard for clinics.

Primary goals:

- streamline denied claim workflows
- surface financial recovery insights
- maintain HIPAA-safe data handling
- support fast operational workflows

---

## Completed Improvements

- Sidebar navigation standardized across pages
- Design system centralized in design-system.css
- HIPAA-sensitive directories locked from modification
- Navigation graph added to planner
- Product workflow defined in project context

---

## Architecture Decisions

- Global styling lives in `design-system.css`
- All pages follow the sidebar / header / content layout
- Static HTML is currently used for UI rendering
- Protected directories contain sensitive data and cannot be modified

Protected directories:

reports-files/
claims-pdfs/
agreements-files/
invoices/

---

## System Components

Frontend UI:
- HTML pages
- CSS design system
- page-level JavaScript

AI Development System:
- ai-planner.sh
- ai-suggest.sh
- ai-task-maker.sh
- ai-executor.sh
- agent-worker.sh
- openclaw-supervisor.sh

AI runs in an automated loop with cooldown intervals.

---

## Known Technical Gaps

The system currently lacks:

- backend API layer
- authentication system
- database persistence
- audit logging
- structured error handling
- automated testing

These areas should be prioritized over cosmetic UI improvements.

---

## System Rules

- design-system.css controls global styling
- sidebar layout must remain consistent
- HIPAA directories must never be modified
- AI should prioritize architecture over UI tweaks
- AI should avoid repeating completed tasks

---

## Future Direction

The platform should eventually support:

- backend claims API
- claim lifecycle tracking
- denial analytics
- revenue recovery metrics
- role-based access control
- secure document storage
## Completed Tasks Log
