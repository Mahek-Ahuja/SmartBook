# SmartBook SRS Traceability (REQ-1 to REQ-58)

Based on the uploaded SmartBook SRS, Version 1.0 (August 2026). The project demonstrates all 14 feature areas in a local academic prototype. The mapping below distinguishes working demo behavior from production integrations.

| SRS feature | Requirements | Demonstration in this project | Important limitation |
|---|---|---|---|
| Authentication and roles | REQ-1–6 | Email/password registration and login; Admin, Faculty and Student roles; protected role-specific APIs; logout by clearing browser token; invalid credentials show errors | JWT/local SQLite demo, not Firebase Authentication; HTTPS must be supplied by deployment |
| AI slot recommender | REQ-7–10 | Ranked available spaces using availability, capacity fit and prior use; refreshes on each request; select/book recommended room or search manually | Explainable rule-based recommendation, not a trained AI model; no continuous push update |
| Instant drop-in | REQ-11–14 | Quick Book uses a short current-time slot; configurable duration; booking conflict checks | Grace-period auto-release for failure to check in is not fully enforced; QR/check-in flow is demo-level |
| Group and equipment booking | REQ-15–18 | Group size/member fields; equipment IDs linked to booking; checks overlapping equipment reservations; in-app notifications | Group notification delivery is in-app, not external push |
| Dynamic QR access | REQ-19–22 | Unique random QR token on confirmed booking; QR image generated on request; booking-window validation; single-use verification and check-in | Staff verifies token through API; physical scanner hardware integration is not included |
| Waitlist and spot claiming | REQ-23–26 | Join waitlist; priority/time ordering; cancellation triggers offer; offer acceptance/decline; expiry job advances queue; position returned on join | Scheduled job runs while local server is running |
| Notifications/reminders | REQ-27–30 | In-app alerts for booking, approval, cancellation, waitlist, maintenance; scheduled 15-minute reminders; preference settings | Firebase Cloud Messaging/email/SMS push are not configured |
| Faculty coordination | REQ-31–34 | Faculty views bookings/approvals; approve/decline/reschedule via booking update; recurring day/time blocks; requester notified | Course/department timetable integration is not connected |
| Space management | REQ-35–38 | Admin adds/edits/deactivates rooms, sets category/capacity/facilities/approval requirement; inactive spaces excluded from search | Real-time means updated on next API fetch, not websocket push |
| Equipment configuration | REQ-39–42 | Admin adds/edits/removes equipment; links room IDs; booking overlap check; API returns configuration errors | Quantity greater than one is stored but simultaneous quantity allocation is simplified to one-record conflict |
| Priority student report | REQ-43–46 | Configurable score inputs; ranked student report; CSV export | PDF export and advanced date/type filters are not implemented in this prototype |
| Maintenance/construction | REQ-47–50 | Admin records unavailable date range and reason; conflicting bookings are cancelled and notified; future bookings blocked | Alternative-room suggestions are not automatically reserved |
| Approval workflow | REQ-51–54 | Approval-required rooms create Pending bookings; Admin/Faculty approves/declines with optional comment; requester gets in-app notification | Approver routing is role-wide, not mapped to individual department ownership |
| Priority waitlist | REQ-55–58 | Priority score, timestamp tie-break; configurable weights; score recalculated on waitlist join; offer goes to highest priority | Re-ranking is performed at queue promotion; no external student-information-system integration |

## Other SRS requirements
- Responsive UI: desktop and mobile layouts are supported by CSS breakpoints.
- Error handling: API validation errors are displayed in the UI.
- Data persistence: SQLite stores users, spaces, bookings, equipment, waitlists, maintenance, notifications and settings.
- Password security: bcrypt password hashing.
- Modularity: API and UI are separated into server/database and public assets.
- Localization: strings are centralized in frontend source for future extraction; multiple translations are not supplied.
- Privacy: local demo data only; do not use real student personal information for public deployment.
- Production hardening: use HTTPS, a strong environment-based JWT secret, stricter rate limiting/audit logs, transactional multi-resource booking, external notification provider and load tests before production.

**Presentation guidance:** Say that this is a prototype implementing the SRS workflows with local substitutes for cloud services. Do not claim Firebase push notifications, trained AI, production security, or physical scanner integration.
