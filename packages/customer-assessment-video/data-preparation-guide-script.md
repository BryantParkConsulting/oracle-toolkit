# BPC Customer Assessment — Client Data Preparation Guide

**Target duration:** approximately 3 minutes 30 seconds

To complete a Bryant Park Consulting Customer Assessment, prepare two secure inputs: read-only NetSuite access and a full Oracle NSPB backup. For deeper performance analysis, also include level-zero data from each cube and the latest Activity Report.

Start in NetSuite. Before creating credentials, confirm that Token-Based Authentication is enabled and that the approved integration user has a dedicated read-only role.

Go to Setup, Integration, Manage Integrations, and select New. Enter a clear integration name and keep the state Enabled.

On the Authentication tab, select Token-Based Authentication only. Leave OAuth 2.0 Authorization Code Grant unchecked. Then save the integration record.

NetSuite displays the Consumer Key and Consumer Secret only once. Copy both values immediately and store them in the approved secure channel. Never send credentials by email.

Next, go to Setup, Users and Roles, Access Tokens, and select New. Choose the integration under Application Name, the approved integration user, and the dedicated read-only role. Confirm the Token Name and select Save.

The confirmation page displays the Token ID and Token Secret only once. Securely provide BPC with the Account ID, Consumer Key, Consumer Secret, Token ID, and Token Secret. After the assessment is complete, the client can revoke the access token.

Now prepare the NSPB environment. From the Home page, open Tools and then Migration.

For a complete assessment, use Backup instead of selecting individual categories and clicking Export. Backup captures the environment's application artifacts and data, including Core, Data Management, Calculation Manager, Document Repository, and Groups and Membership where available.

Run the backup during a low-activity window. Enter a clear snapshot name and wait for the Migration Status Report to show Completed. Then open Snapshots, select the Actions menu for the new snapshot, and choose Download. Transfer the ZIP without extracting it or changing its internal folder structure.

For deeper performance analysis, export level-zero data from every planning cube. Open Calculation Manager, select System View, and open Database Properties. Expand the Planning application, right-click each cube, and choose Export Level Zero Data. Enter a unique ZIP file name and wait for the export to complete. Repeat this process for every cube.

Return to Planning. Open Application, Overview, Actions, and Inbox/Outbox Explorer. Download each level-zero ZIP.

Finally, open Application, Overview, and Activity Reports. Include the latest Activity Report. It helps BPC evaluate user activity, slow requests, calculations, jobs, and application performance.

Before sending anything, verify that the package contains the NSPB backup ZIP, one level-zero ZIP for each cube, and the latest Activity Report. Transfer all files and credentials only through the approved secure channel.
