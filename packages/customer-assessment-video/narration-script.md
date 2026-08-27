# BPC Customer Assessment — English narration V2

**Target duration:** approximately 3 minutes

Bryant Park Consulting's Customer Assessment is a focused, evidence-led service for organizations using NetSuite and Oracle NetSuite Planning and Budgeting.

It answers three practical questions: What do you have? What is actually being used? And what should you improve next?

Once the secure, read-only access and NSPB export are received, the assessment is typically completed within one business day.

To begin, we request two controlled inputs. First, NetSuite token-based access through a dedicated integration and a read-only role.

In NetSuite, open Setup, Integrations, Manage Integrations, and create a new integration. Give it a clear name, keep the state Enabled, and select Token-Based Authentication.

Save the integration. Then create an access token using the dedicated integration, the read-only role, and the user approved for the assessment. NetSuite shows the Token ID and Token Secret only once. Copy both values and transfer them through the approved secure channel — never by email.

Second, in NSPB, open Migration and select the application. Choose the application artifacts required for the assessment, click Export, give the snapshot a clear name, and wait until the Migration Status Report shows that the job completed. Download the snapshot ZIP without changing its folder structure.

For deeper performance analysis, open the Calculation Manager database properties, expand the Planning application, and right-click each cube. Choose Export Level Zero Data, enter a ZIP file name, and wait for the export status to complete. Then open the Inbox and Outbox Explorer and download each ZIP. Include the Activity Report as well. Together, these files show actual data volume, calculations, jobs, and user activity.

BPC connects both sources into one current-state view.

The NSPB assessment inventories dimensions, forms, business rules, cubes, dashboards, integrations, scheduled jobs, security, and data volume. We classify each capability as active, partially used, dormant, or no longer relevant.

The NetSuite analysis evaluates enabled modules, actual transaction activity, the chart of accounts, customizations, scripts, connected applications, and readiness for Planning.

Recommendations are grounded in the client's industry and operating model: what to enable, consolidate, clean up, retire, or govern differently.

The performance review identifies stale scenarios, large data footprints, slow calculations, fragile rules, navigation issues, and opportunities to simplify the model.

Each technical finding is translated into business impact: faster cycles, more reliable reporting, lower maintenance effort, stronger adoption, and greater planning flexibility.

The final deliverables include an executive summary, evidence-backed findings, prioritized technical and functional actions, training needs, and a practical roadmap.

You provide the secure exports. Within one business day, Bryant Park Consulting turns them into clarity — and a confident next step.
