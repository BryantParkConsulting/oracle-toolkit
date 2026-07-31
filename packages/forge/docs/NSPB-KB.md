<!--
  NSPB Knowledge Base — product documentation for Oracle NetSuite Planning & Budgeting.

  Generated from the internal Notion KB by tools/sanitize-kb.js. Client-identifying
  references have been replaced with neutral placeholders (Region A / Region B / ...);
  the underlying product knowledge is unchanged.

  This file answers "how does NSPB work" — modules, forms, dimensionality, Smart View,
  the business-rule sequences, administration and integration. Read it before inferring
  how a module behaves from a single client's LCM export: an export tells you which
  rules a tenant happens to have, not which sequence is correct.
-->

# NSPB Knowledge Base Documentation

Generated for Gemini Context

## Getting Started

### NSPB How to access your Application

To access your Oracle NSPB (NetSuite Planning and Budgeting) application, follow these steps:

1. Open your web browser and navigate to the following URL:

    ```

    https://epm-<INSTANCE>.epm.<REGION>.oraclecloud.com/HyperionPlanning

    ```

    Replace `<INSTANCE>` with your specific instance number or tenancy.

2. Enter your login credentials provided by your administrator.
3. Once logged in, you will have access to your NSPB Planning environment, where you can manage budgets, forecasts, and financial plans.

---

### Setting your user preferences

In Oracle PBCS, the **Preferences** section allows users to configure their individual environment for optimal usability. One important component within Preferences is the **Variables** tab. These variables help customize how data and forms behave for each user, improving efficiency and personalizing the experience.

### Types of Variables

1. **User Variables**:

    These are substitution-like variables that users can set for themselves. They typically filter data displayed in forms, dashboards, and reports. For example:

    - `Entity`: Allows a user to set their default business unit.
    - `Scenario`: Can be set to always show "Forecast" or "Budget".
    - `Version`, `Period`, and `Year` are also common variables.

Enter a member selection for each dimension.

Save

---

### Monthly Substitution Variables

# **Monthly Updates (Substitution Variables)**

This guide provides step-by-step instructions for managing substitution variables within your NetSuite Planning and Budgeting (NSPB) application.

### 1. Accessing Variables
From the homepage, click on the **Navigator** icon (three horizontal lines) on the top left.

Towards the middle of the navigator, under **Tools**, click on **Variables**.

Click on **Substitution Variables** in the submenu.

### 2. Updating Monthly & Yearly Variables
Change the variable value to the right of **LastClosedMonth** and **LastClosedYr** by typing the period corresponding to the most recently closed month loaded into NSPB.

**Naming Conventions:**
*   **Months**: Use "TP" followed by the period number (e.g., November = **TP11**).
*   **Years**: Use "FY" followed by the last two digits of the fiscal year (e.g., Year 2025 = **FY25**).

> [!IMPORTANT]
> The **LastClosedYr** variable must always align with the year of the **LastClosedMonth**. For example, if December 2025 is being closed, the variable should be FY25.

### 3. Updating Calculation Drivers
Make sure to update the **QtrBegin** variable. This controls the data calculations for saved searches (Income Statement transaction data) and metadata creation. This should match the beginning of the semester or period sequence you are loading (e.g., TP1 for January).

To process metadata changes for Income Statement (IS) parent-child relationships, update **MetaSEnd** and **MetaSStart**. These variables control the push of metadata for the Customer structure.

### 4. Saving Changes
When finished making changes to all substitution variables, click on **Save**.

Click on **OK** to confirm the update.

---

## Application Modules

### Sales & Cogs

# Sales  & Cogs

Before loading and calculating the forecast, it is essential to understand how clusters, cards, tabs, and forms are displayed in PBCS. Gaining clarity on this structure ensures a smoother workflow and prevents errors. Once this is established, we will proceed with a step-by-step review of the forecasting process to ensure accuracy and completeness.

# Understanding clusters, Cards, tabs, and forms:

This section provides a visual understanding of clusters, cards, tabs, and forms in PBCS. By familiarizing yourself with these components, you will better grasp how data is organized and navigated within the system, ensuring correct visibility for the following table description process

Tab and form Example

# Step by Step process to forecast Sales and Cogs (Table)

This table outlines the step-by-step process for forecasting Sales and COGS in PBCS.

- **Cluster / Module  Column**: Represents the main cluster icons on the PBCS welcome page, such as Forecast, Workforce, etc.
- **Card Column**: Displays the sub-icons that appear under each cluster, like Sales/COGS, Inventory, etc.
- **Tab Column**: Refers to the specific sections within a card that organize related actions.
- **Task Column**: Specifies the type of task to be performed, such as modifying settings or variables, running a business rule, or loading data.

| Step  | Cluster / Moduule | Card | Tab | Form | Task | Task |
| --- | --- | --- | --- | --- | --- | --- |
| Step 0 | Any Module |  |  |  | Settings | Update Substitution variables **LastClosedMonth** (Current Actual Period) **FcstStartMonth** (Forecast Start Period) |
| Step 1 | Any Module |  |  |  | Run Rule | Run the  "Actual to Forecast Copy" Business Rule, such as "**ADMIN - Datacopy - Actual to Forecast"**, or a similar rule. This process will copy the actual data from past months into the first forecasted months, ensuring continuity and accuracy in the forecasting model. |
| Step 2 | Open Forecast | Open Sales/Cogs | Open Product Revenue | Open the revenue forms involved (Each customer has different revenue forms names)  | Load data | Load Forecast Data for Income accounts by customer , item , and class  . When saving the form, a small part will be calculated.
Alternatively, input forecast data with SmartView  |
| Step 4 | Any Module |  |  |  | Run Rule | Alternatively, execute the business rule **“AGG - IncStmt - Forecast”** or **“Agg - Select “** to see all consolidated Forecast Data. |
| Step 5 | Financials | Income Statement | Income Statement Reports | Income Statement Report | Review Data | Review all consolidated data.  |

### Step 0
Ensure the variables are correct

[Changing  Monthly Substitution Variables](Monthly%20Daily%20tasks/Changing%20Monthly%20Substitution%20Variables%202aac8b8c36a8812b99e0c1360e09ed3d.md)

### Step 1
Run the bussines rule

### Step 2
Open the Input Form and input data , also you can load the revenue data using SmartView.

[Smart View Training ](Smart%20View%20Training%202aac8b8c36a881deb645fa12974d717e.md)

On the Form:
Select Subsidiary, Currency, Class and Item

Select New Customer drop-down or Action Menu Add New Customer to add new customer for data input

Calculation Runs on Save

Save the form.

### Step 4
 Run the “AGG - IncStmt- Forecast” to see all consolidated Forecast Data.

### Step 5
Review aggregated data
|

---

### Opex Module

The OPEX (Operating Expenses) module in Oracle PBCS is designed to streamline and control operating expense planning. It allows users to budget, forecast, and analyze expenses across departments, helping to ensure alignment with financial goals. The module includes features for setting up expense drivers, allocating costs, and tracking variances against budget. By using OPEX, organizations can gain better visibility into their expense structure, make data-driven decisions, and improve overall cost management throughout the budgeting cycle.

# Understanding Cluster, Cards, tabs and forms

The following screenshoot displays what is Called: Cluster, card, tabs and forms inside PBCS. This information will describe the forecast process on a step table.

# Step by step on how to Forecast Opex

The folloing table describes a step by step process on how to

| Step | Task | Cluster | Card | Tab | Form | Type | Purpose / Description |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Settings  |  |  |  |  |  | Update Substitution variables<br>**LastClosedMonth** (Current Actual Period)<br>**FcstStartMonth** (Forecast Start Period) |
| 1 | Run Rule |  |  |  |  | Execute Rule | Run the designated Actual to forecast copy Business Rule.<br>”**ADMIN - Datacopy - Actual to Forecast”**  or similar. |
| 2 | Load data | Forecast | Opex | Opex Planning | Opex | Input | Load Forecast Data for Opex accounts by department and subsidiary Input currency . When saving a small part will be calculated.  |
| 3 | Load data |  |  |  | OpEx, All Departments | Input | Input by department. This is another way to input data. When saving a small part will be calculated.  |
| 4 | Load data  |  |  |  | OpEx Top Level Adjustment | Input | Top-level adjustment. Alternative top-level input<br>Alternatively use  smart view to input forecast c please go to S[martview training](#article:Smart%20View%20Training)  |
| 5 | Run Rule |  |  |  |  | Execute Rule | Execute Bussines rule **“AGG - IncStmt - Forecast”** or<br>**“Agg - Select “** to see all consolidated Forecast Data.  |
| 6 | Review Data |  |  | Opex Dashboard | Opex Report | Review | Review all consolidated data.  |
| 7 | Review Data |  |  |  | OpEx Dashboard | Review  | Review all consolidated data.  |

**Notes**:  To load Budget at level zero using smart view Ad Hoc please go to S[martview training](https://www.notion.so/c9730dfc48fa49319656de79703784f6?pvs=21)

# Select the Rolling Forecast type

Open the dashboard Forecast - Opex

Select Opex - Opex Planning and select the Rolling Forecast for each account.

The load

Select a member combination

Select the actual data

Select the workforce Opex accounts

load forecast into the specific needed intersection

# Review the calculated Opex Forecast

Open Opex dashboard- Opex Report

---

### Workforce Module

#### Workforce Start Guide

The beginning employee data can be loaded from other sources or entered manually into the system. SmartView can be utilized to submit the data from another source system.

>
📢

Workforce uses Budget Scenario

# Workforce Introduction

[https://www.youtube.com/embed/51fYQ9WZlWg?rel=0&autoplay=1](https://www.youtube.com/embed/51fYQ9WZlWg?rel=0&autoplay=1)

If at any time you need to modify the information loaded for an employee, you will need to make the necessary changes in the Company Roster form.

[https://www.youtube.com/watch?v=BMSn03-cCQc&ab_channel=OracleEPMTutorials](https://www.youtube.com/watch?v=BMSn03-cCQc&ab_channel=OracleEPMTutorials)

# Workforce Tabs/Forms

# Workforce Tabs/Forms

There are 3 tabs that contain forms to perform specific tasks or provide specific views of the data.

- Tab1 **Manage Employees** contains forms Company Roster, Department Roster, Employee Status, Add Department Employee, and Add New Hires by Department
- Tab2 **Employee Review** and contains forms Company Emp Expenses, Department Emp Expenses, Company Expenses, and Department Employee Review
- Tab3 **Setup** contains forms Pay Schedule, Annual Assumptions, Monthly Assumptions and Location Assumptions

## Company Roster Form
**Data load Form.** There is a list of all the employees on the company roster denoting their department.
Additional information to be completed. Eg; hire date, termination date, job title, employment type, salary, pay rate, etc.

## Department Roster Form
**Display Form .** This is the same information as on the company roster but by individual department, aligning employee by their department.

## Employee Status Form
**Display Form. I**n the event an employee is active it will reflect in system, if not, the system will display 0 (zero) indicating that the employee has not begun their employment. When an employee resigns or is terminated, to stop their associated compensation expenses from being included in calculations as of their departure, put “Departure” in the months they will no longer be employed.

---

#### Load Assumtions

**5.3 Setup Tab**

These are input forms. This is where you enter the data that will drive the business rules and calculations for your employee expenses.

**5.3.1 Company Pay Schedule**

This is where you enter the workdays and the pay periods per month for your business.

**5.3.1 Annual Assumptions**

This is where you enter tax capabilities for the budget year.

Monthly Assumptions

This is where you enter the data to compute the cost of employee benefits.

5.3.1 Location Assumptions

---

#### Add Existing Employees

# Add the emplooye to the dimension

To add a new employee  open the dimension editor to to Employee dimension.

Add Existing Employee under “Existing_Emps” hierarchy

Go to the last member in that roll-up and select the button to add a sibling.

For the name use employee number. If there aren’t assigned employee numbers use the next sequential number. For alias enter the employee name. The other selections should be set the same as the example below (for example the Data Storage should be Store).

**Employee detail**

Refresh the database

# Assign a Department to the employee

Open “Add Department Employee” Form

This form is for adding existing employees between departments.  For example, if employee 1 is in dept 1, they would use this form to add him to dept 2.

Save.

# Complete the salary and additional information for each employee

**Open the Company Roster Form**

The company roster is a list of all the employees and their department.   Additional information to be completed: e.g. hire date, termination date, job title, employment type, salary, pay rate, etc.

Enter all the information for each employee.

Click Save . The Bussines rules associated will run and calculate expenses.

# **Company Roster Columns Detail**

**Subsidiary** - The subsidiary or organization where the employee works.

**Currency** - The currency used for the employee’s compensation (USD in this case).

**Job Title** - The employee's job title within the company.

**WC Code** - The worker’s compensation code that applies to the job.

**Hire Date** - The date the employee was hired.

**Termination Date** - The date the employee is set to leave or has left the company.

**Salary Basis** - Indicates if the employee is paid hourly, salary, or per diem.

**Input Rate** - The input salary rate or hourly wage.

**Hours per Day** - The number of hours the employee works per day.

**Pay Rate** - The employee’s compensation rate.

**Grant Allocation %** - The percentage of salary allocated through grants.

**Total Allocation %** - The total allocation of salary, combining grants and other sources.

**Bonus %** - The percentage of bonus the employee is eligible to receive.

**Bonus $** - The dollar amount of the bonus.

**Raise %** - The percentage increase in salary due to raises.

**403(b) Withholding %** - The withholding percentage for the employee’s 403(b) retirement plan.

**Benefits Plan** - The type of benefits plan the employee is enrolled in (e.g., High Employee & Spouse, Base Employee Only, etc.).

**AD&D Plan** - Indicates whether the employee is enrolled in an Accidental Death & Dismemberment (AD&D) insurance plan.

**STD Plan** - Short-term disability plan enrollment.

**LTD Plan** - Long-term disability plan enrollment.

---

#### Add To Be Hired Employees

To add a new employee or a new To be Hired Employee open the dimension editor to to Employee dimension.

Add a To be Hired Employee under “New_Emps” hierarchy

Go to the last member in that roll-up and select the button to add a sibling.

For the name use employee number. If there aren’t assigned employee numbers use the next sequential number. For alias enter the employee name. The other selections should be set the same as the example below (for example the Data Storage should be Store).

**Employee detail**

For the name use the next sequential number. The other selections should be set the same as the example below (for example the Data Storage should be Store).

Refresh the database

# Add New Hires by Department

A hiring requisition adds placeholder (TBH) expenses to the workforce budget until someone is hired to fill the requisition. When an employee is hired to fill the hiring requisition, the place holder hiring requisition expense is transferred to and associated with the hired employee. Use this form to create the placeholder for each department.

---

#### Transfer a Employee to Another Department

**Open  Add Department Employee**

This form is for adding/transferring existing employees between departments.  For example, if employee 1 is in dept 1, they would use this form to add him to dept 2.

Below there is an example of an employee, *Avery Connor* that was transferred from one department (Sales) to another (Engineering), there is no *drop-down box* that states the *transferred* status but the system shows the *termination date* in one department, giving the employee a *new hire* date on the new department.

After the information is added for the *exiting employees* list and the *new employees* list the system will calculate the expenses for both (salary, bonuses, 401K etc) .

In the following example notice that *Tom Anderson* didn’t begin working until April 2019, therefore there is no previous data. Collection of data will commence on the first day

Calcualtions

---

#### Give Rises

**Open Annual Assumptions Form.**

Select the Merit Month. This will apply to all employees.

**Open the Company Roster Form**

 Enter the designated raise to the employe and save.

Click Save .  A Bussines rule “CalcComp” will calculate the “Pay rate” and “Total Salary” using “Salary Basis” and “Input Rate”

**Open the Company Emp Expenses**

Review the “Total Salary” row

Note that the **Merit** member formula must include both forecast Years to avoid Raises in all forecast years.

```jsx
IF ("Status" ==1 )

		IF( @ISMBR(&FcstYr1) )
			IF("MeritMonth"->BegBalance->&NoIntersection->&FcstYr1 != #Missing)
    		/* Forecast Year 1 - Calculate merit starting with the time period input on the Annual Assumptions form and the Merit% entered on the Company Roster */
      				IF ( @ISMBR(@MEMBER(@CONCATENATE("HSP_ID_",@HspNumToString("MeritMonth"->&FcstYr1->BegBalance->&NoIntersection))):TP12) )
      				"Salary" * "Merit%"->&NoYear;
      				ELSE #missing; ENDIF
           		ELSE #missing; ENDIF
    /* Forecast Year 2 */
		ELSEIF ( @ISMBR(&FcstYr2) )
				IF("Merit"->TP12->&FcstYr1 == #missing)
					IF( @ISMBR(@MEMBER(@CONCATENATE("HSP_ID_",@HspNumToString("MeritMonth"->&FcstYr2->BegBalance->&NoIntersection))):TP12) )
						"Salary" * "Merit%"->&NoYear;
					ELSE #missing;
					ENDIF
				ELSEIF("Merit"->TP12->&FcstYr1 != #missing)
					IF ( @ISMBR(@MEMBER(@CONCATENATE("HSP_ID_",@HspNumToString("MeritMonth"->"No Currency"->&FcstYr2->No_Employee->No_Department->BegBalance))):TP12) 	)
						(("Salary"->TP12->&FcstYr1 + "Merit"->TP12->&FcstYr1) * "Merit%"->&NoYear) + "Merit"->TP12->&FcstYr1;
					ELSE
					"Salary" * "Merit%"->&NoYear;
					ENDIF
				ENDIF
		ELSE #missing; ENDIF
ELSE #missing; ENDIF
```

---

#### Terminate a Employee

**Open the Company Roster Form**

Etner a termination date . Click Save . The Bussines rules associated will run and calculate expenses.
On the expenses form this employee information will be empoty for the following months.

## Employee Status Form
Display Form. In the event an employee is active it will reflect in system, if not, the system will display 0 (zero) indicating that the employee has not begun their employment. When an employee resigns or is terminated, to stop their associated compensation expenses from being included in calculations as of their departure, put “Departure” in the months they will no longer be employed.

‘

---

#### Workforce Calculating data

##### Workforce Review Forms

To review the calculated data use the folowing forms

## Department Roster Form
**Display Form .** This is the same information as on the company roster but by individual department, aligning employee by their department.

## Employee Status Form
**Display Form. I**n the event an employee is active it will reflect in system, if not, the system will display 0 (zero) indicating that the employee has not begun their employment. When an employee resigns or is terminated, to stop their associated compensation expenses from being included in calculations as of their departure, put “Departure” in the months they will no longer be employed.

‘

 **Employee Review Tab**

These forms give you different level views of expenses that incurred by the company/department for the budget year.

 **Company Emp Expenses**

This form gives you a view of the expenses for all employees at the company level.

**Department Emp Expenses**

This form gives you a view of the expenses for all employees in a specific department.

 **Company Expenses**

This form gives you a view of the expenses incurred by the company for a single employee.

**Department Employee Review**

This form gives you a dashboard view of the expenses for all employees in a specific department.

---

#### Error detected while attempting to Run job: Update Workforce”

**Error:**

```jsx
“Error detected while attempting to Run job: Update Workforce”
```

**Resolution**:
If this error occurs after saving a form or running a calculation, please ensure that all assumptions have been properly loaded. Missing or incorrect assumption data can cause validation issues and calculation errors. Review the relevant data sources, confirm that all required inputs are present, and reload any missing assumptions before attempting the operation again.

Please check:

[Load Assumtions](Load%20Assumtions%202aac8b8c36a881f5a8d0c6cd71f148a7.md)

---

#### Additional Video Tutorials

Workforce is used to manage and track headcount expenses. This can be accomplished by analyzing, calculating and reporting on headcount, salary, bonuses, taxes, health care expenses, etc. It can also help with planning for new hires, transfers, promotions, terminations, and so on for the new budget year.

The beginning employee data can be loaded from other sources or entered manually into the system.

/l

# Workforce Introduction

[https://www.youtube.com/embed/51fYQ9WZlWg?rel=0&autoplay=1](https://www.youtube.com/embed/51fYQ9WZlWg?rel=0&autoplay=1)

If at any time you need to modify the information loaded for an employee, you will need to make the necessary changes in the Company Roster form.

[https://www.youtube.com/watch?v=BMSn03-cCQc&ab_channel=OracleEPMTutorials](https://www.youtube.com/watch?v=BMSn03-cCQc&ab_channel=OracleEPMTutorials)

sdf

Manage Employees Tab

**Company Roster**

There is a list of all the employees on the company roster denoting their department.

**Additional information to be completed.**

- **Hire date**
- **Termination date**
- **Job title**
- **Employment type
Salary**
- **Pay rate**

After implementing the necessary adjustments, click Save.

This form is set up to automatically run specific business rules crucial for computing accurate values in the Workforce Cube.

To keep track of the business rule execution, navigate to the main menu, select Jobs, and you can review the status of executed business rules.

It's important to be aware that opting for an alternative approach may require manual execution of the corresponding business rules.

To verify that the accurate values have been successfully loaded into the system, you can review the Company Emp Expenses form.

Employee Review Tab

**Company Emp Expenses**

---

#### Workforce Admin Guide

Workforce is used to manage and track headcount expenses. This can be accomplished by analyzing, calculating and reporting on headcount, salary, bonuses, taxes, health care expenses, etc. It can also help with planning for new hires, transfers, promotions, terminations, and so on for the new budget year.

The beginning employee data can be loaded from other sources or entered manually into the system. SmartView can be utilized to submit the data from another source system.

# Dimensionality

Workforce has its own cube and the dimensions included in the cube are exclusive to the module. It’s important to note that any changes made within Workforce will not affect the other cubes.

The Workforce cube has 10 dimensions as compared to the Plan cube which has 13 (as seen in the screen shots below). The Class, Item, Relationship and Tracker dimensions are not configured for use in Workforce and the Employee dimension is not configured for us in Plan

# Plan Account Dimension vs Workforce Account Dimension

The account dimension in the Workforce cube has much fewer members than the account dimension for the Plan cube (see screenshots below). Workforce doesn’t need all the income statement and balance sheet accounts that part of the dimension for Plan and Detail cubes. The earnings, taxes, benefits, etc. employee information that is calculated in Workforce is pushed into the Expense accounts through a business rule so that they are included on the OpEx forms/reports. This process will be further explained later in this document.

# Adding New and New ‘To Be Hired’ (TBH) Employees

Employee Numbers/Names must be added to the Employee Dimension for them to show on the Company Roster. Under the Existing_Emps roll-up an employee’s number/name is added to the outline. It is usually set up with an employee number for the member name and the employee’s actual name as the Alias. If there are open position to be filled in the upcoming budget year the member names under the New_Emps roll-up can be used to hold a position. This will allow for salary, bonus, employer part of benefits, etc. to be calculated for that position.

When adding a new employee, you go to the Employee Dimension and drill down to the roll-up for Existing_Emps. Next you go to the last member in that roll-up and select the button to add a sibling.

For the name use employee number. If there aren’t assigned employee numbers use the next sequential number. For alias enter the employee name. The other selections should be set the same as the example below (for example the Data Storage should be Store).

If there are open positions to be filled in the upcoming budget year the member names under the New_Emps roll-up can be used to hold a position. Drill down to the roll-up for New_Emps. Next you go to the last member in that roll-up and select the button to add a sibling. For the name use the next sequential number. The other selections should be set the same as the example below (for example the Data Storage should be Store).

# Transferring Employees from One Department to Another

The following is an example of an employee,

*Avery Connor*

that was transferred from one department (Sales) to another (Engineering), there is no

*drop-down box*

that states the

*transferred*

status but the system shows the

*termination date*

in one department, giving the employee a

*new hire*

date on the new department.

After the information is added for the *exiting employees* list and the *new employees* list the system will calculate the expenses for both (salary, bonuses, 401K etc) .

In the following example notice that *Tom Anderson* didn’t begin working until April 2019, therefore there is no previous data. Collection of data will commence on the first day

# Workforce Tabs/Forms

There are 3 tabs that contain forms to perform specific tasks or provide specific views of the data.

- Tab1 **Manage Employees** contains forms Company Roster, Department Roster, Employee Status, Add Department Employee, and Add New Hires by Department
- Tab2 **Employee Review** and contains forms Company Emp Expenses, Department Emp Expenses, Company Expenses, and Department Employee Review
- Tab3 **Setup** contains forms Pay Schedule, Annual Assumptions, Monthly Assumptions and Location Assumptions
-

**5.1 Manage Employees Tab**

These forms give you different level views of expenses that incurred by the company/department for the budget year.

**5.1.1 Company Roster**

All fields associated with an individual employee will be under 'Emp Props' in the outline, seen in the image below. These are the same fields in the column titles on the Company Roster. If you need to add to the Company Roster form, you would need to add the field to the list under Employee Properties.

Note: Accounts under Employee Properties in the outline store a value but do not actually calculate that value.

**Example:**

**5.1.2 Company Roster**

The company roster is a list of all the employees and their department.

Additional information to be completed: e.g. hire date, termination date,

job title, employment type, salary, pay rate, etc.

**5.1.2 Department Roster**

This is the same information as on the company roster but by individual department, aligning employee by their department.

**5.1.3 Employee Status**

In the event an employee is active it will reflect in system, if not, the system will display 0 (zero) indicating that the employee has not begun their employment. When an employee resigns or is terminated, to stop their associated compensation expenses from being included in calculations as of their departure, put “Departure” in the months they will no longer be employed.

**5.1.4 Add Department Employee**

This form is for adding/transferring existing employees between departments.  For example, if employee 1 is in dept 1, they would use this form to add him to dept 2.

df

5.1.5 Add New Hires by Department

A hiring requisition adds placeholder (TBH) expenses to the workforce budget until someone is hired to fill the requisition. When an employee is hired to fill the hiring requisition, the place holder hiring requisition expense is transferred to and associated with the hired employee. Use this form to create the placeholder for each department.

**5.2 Employee Review Tab**

These forms give you different level views of expenses that incurred by the company/department for the budget year.

**5.2.1 Company Emp Expenses**

This form gives you a view of the expenses for all employees at the company level.

**5.2.2 Department Emp Expenses**

This form gives you a view of the expenses for all employees in a specific department.

**5.2.3 Company Expenses**

This form gives you a view of the expenses incurred by the company for a single employee.

**5.2.4 Department Employee Review**

This form gives you a dashboard view of the expenses for all employees in a specific department.

**5.3 Setup Tab**

These are input forms. This is where you enter the data that will drive the business rules and calculations for your employee expenses.

**5.3.1 Company Pay Schedule**

This is where you enter the workdays and the pay periods per month for your business.

**5.3.1 Annual Assumptions**

This is where you enter tax capabilities for the budget year.

5.3.1 Monthly Assumptions

This is where you enter the data to compute the cost of employee benefits.

5.3.1 Location Assumptions

---

#### Load and calculate Workforce Forecast (Review Data)

# Load information

Select a member combination

Select the actual data

Select the workforce opex accounts

load forecast into the specific needed intersection

# Review the calculated Opex Forecast

Open Opex dashboard- Opex Report

---

## SmartView & Reporting

### Understanding Multidimensionality

# Understanding  Multidimensionality

The image displays a data block visualization for Caffeine Free Cola in New York, showing how Essbase organizes multi-dimensional data.

## Core Concept of Essbase Multidimensionality

Essbase is a multidimensional database management system that organizes business data across multiple perspectives or "dimensions." In the visualization, we see:

- **Time dimension**: Representing periods like months, quarters, years
- **Measures dimension**: Containing metrics like sales, costs, margin
- **Scenario dimension**: Showing different contexts like Actual, Budget, Forecast

The power of Essbase is in how these dimensions intersect. Each cell in the data block represents a specific intersection of these dimensions - for example, "January Actual Sales" or "Q2 Budget Costs."

## Scenario: Caffeine Free Cola in New York

| Time | Measure | Actual | Budget | Forecast |
| --- | --- | --- | --- | --- |
| January | Sales Units | 1,200 | 1,000 | 1,100 |
| January | Revenue | $2,400 | $2,000 | $2,200 |
| January | Profit | $600 | $500 | $550 |
| February | Sales Units | 1,300 | 1,050 | — |
| February | Revenue | $2,600 | $2,100 | — |
| February | Profit | $650 | $525 | — |
| March | Sales Units | 1,400 | — | — |
| March | Revenue | $2,800 | — | — |
| March | Profit | $700 | — | — |

## Business Application

For your company, this means:

- Data can be viewed from multiple perspectives simultaneously
- Analysis can be performed at various levels of granularity
- Information can be "sliced and diced" to reveal different insights

Here's a simplified tabular representation of this multidimensional data structure:

Essbase Multidimensional Data StructureCode

## Business Benefits

1. **Consolidated Analysis**: Examine data across multiple dimensions simultaneously
2. **Dynamic Reporting**: Generate reports from any dimensional perspective
3. **Variance Analysis**: Compare actual results against budgets or forecasts
4. **Data Integrity**: Maintain a single source of truth for business metrics
5. **Scalability**: Add new dimensions (like Region, Product) without restructuring data

This multidimensional approach is particularly valuable for financial analysis, sales reporting, and performance management, allowing business users to quickly pivot from high-level summaries to detailed breakdowns without needing multiple separate reports or complex data manipulation.

---

### Smart View Training

#### How to install Smartview (win)

>
👉

**You can alternativly Download Smartview to your computer with this direct link**   [Smartview Here](https://appriver3651000683-my.sharepoint.com/:u:/g/personal/bgallo_company_com/EdN10SXKiQ9Gsz4l5F2BDhoBuDaMCWCQB0R3UJNRSTYlAQ?e=LUH9gh)

Login to your PBCS implementation

Click on the arrow next to your account name/email address in the upper right cover, then click the link for “Downloads…”

/image.png)

In the next screen, scroll down to the “Smart View” section and click on “Download from Oracle Technology Network”

/image%201.png)

This will take you to Oracle’s homepage with a link to downloads for “Oracle Smart View for Office.” Click “Downloads”

/image%202.png)

You will then be on a page with a list of a variety of downloads related to Hyperion Performance Management and BI Tools. Scroll down and select “Oracle Smart View for Office.”

/image%203.png)

You will then be taken to the page to actually download the tool. Click “Download Now.”

/image%204.png)

Next you will be prompted to accept Oracle’s License Agreement. Check the box and click the option to download the file.

/image%205.png)

Next you will be prompted to sign into your Oracle account.

>
📢

**Note:** this account is separate from the account you use to login to Netsuite or PBCS. If you do not have an Oracle account already, you can use the link on the form to create an account, and then return to this screen.

/image%206.png)

After logging in successfully, you will finally begin to download the file.

/image%207.png)

Open the Smart View application file and follow the steps to install. **Note:** you will need to close all Microsoft Office programs during the installation, including Word, Outlook, and Excel.

After the installation is complete, open Excel. You will now have a Smart View menu at the top of your Excel screen

/e62a0337-408e-4218-b260-0050a5d43704.png)

---

#### SmartView Mac Install (Office 365)

To deploy SmartView for Office 365 Users, follow the video instructions below. You will need a manifest file, which must be deployed by the Office 365 to local user. After deployment, users will need to manually add the add-in inside Excel.

[https://www.youtube.com/watch?v=qAgCQyTw4A8&t=216s&ab_channel=OracleEPMTutorials](https://www.youtube.com/watch?v=qAgCQyTw4A8&t=216s&ab_channel=OracleEPMTutorials)

Users should see the Smart View ribbon the next time they log into Office 365 and launch Excel on a Mac or in a browser.

/image.png)

/image%201.png)

/image%202.png)

/image%203.png)

/image%204.png)

**Request to Enable Custom Add-ins in Microsoft 365**

In corporate environments, the tenant administrator can disable sideloading of Office add-ins.

Currently, I can only see **AppSource** when I try to add an add-in in Excel (on Mac/Office Online), which means sideloading is disabled.

To enable this, please go to:

**Microsoft 365 Admin Center → Settings → Integrated apps**

and allow users to **upload their own add-ins (manifest files)**.

This will let me upload the **Smart View manifest XML** provided by Oracle.

Enable smartview office online

/image%205.png)

/image%206.png)

---

#### Setup Smart View (Mac) (Legacy)

# Step 1 - Creating "Wef" Folder

In order to install SmartView on Mac, we first need to create a folder called “wef” This is where we will save the manifest file. First, we need to determine our home user. To do this, open the terminal and write-out the following command: whoami

%20(Legacy)/Untitled.png)

As can be seen, the home user for me is jared. We now need to create the “wef” folder. It will be nested here and will look like this:

**/users/(user)/Library/Containers/com.microsoft.Excel/Data/Documents/wef**

In my instance, is jared, so my folder would look like this:

**/users/jared/Library/Containers/com.microsoft.Excel/Data/Documents/wef**

In order to create this folder, we will again use the terminal. Input this command into the terminal:

%20(Legacy)/Untitled%201.png)

**mkdir /users/jared/Library/Containers/com.microsoft.Excel/Data/Documents/wef**

We will now want to navigate to this folder in finder. We can do this pressing ↑ Shift + ⌘ Cmd + G at the same time on our keyboard. This will make our screen look like this:

%20(Legacy)/Untitled%202.png)

You may or may not see recent folders that you have gone to. In the search bar, paste the folder that was just created and then hit the return key

%20(Legacy)/Untitled%203.png)

Your screen should now look like this:

%20(Legacy)/Untitled%204.png)

This is where we will be putting the XML file that will be generated in the next step. We will come back to this finder window. Minimize it for now.

# Step 2 - Generating an XML File

First, we need to log-in to the PBCS environment. The service URL should look like this: [epm-a999999.epm.us6.oraclecloud.com](http://epm-a999999.epm.us6.oraclecloud.com/)). Paste this link into your browser. Your screen should look like this:

%20(Legacy)/Untitled%205.png)

Log-in to your PBCS environment. By clicking “Sign-in”. Your screen should look like this

%20(Legacy)/Untitled%206.png)

---
Pay attention to the URL. Delete the highlighted portion of the URL below and add /CreateManifest.html to the end of the URL.

%20(Legacy)/Untitled%207.png)

The new URL should look like this:

%20(Legacy)/Untitled%208.png)

And your screen should now look like this:

%20(Legacy)/Untitled%209.png)

In the Domain URL section, add [https://login.oci.oraclecloud.com](https://login.oci.oraclecloud.com/) by clicking the plus button.

%20(Legacy)/Untitled%2010.png)

After adding, delete the original App Domain listed by selecting it and then click the trash icon.

You do not need to check anything here unless you will be updating dimension members. (Note: For admins who will be updating dimensions, you will need to check EPM Admin Extension in the bottom right box). Select “Create Manifest.”

%20(Legacy)/Untitled%2011.png)

This will prompt the XML file to be downloaded to your Mac.

%20(Legacy)/Untitled%2012.png)

Navigate to where this XML file was downloaded to and move it manually to “wef” folder that was created in Step 1. Your “wef” folder should now look like this:

%20(Legacy)/Untitled%2013.png)

Open the XML file in a text editor.

---
Once the XML file is open it should look like this. Do not get overwhelmed. Only one small line needs to be added.

%20(Legacy)/Untitled%2014.png)

Once inside the XML file, press cc and search for <AppDomains> inside the document.

%20(Legacy)/Untitled%2015.png)

Underneath <AppDomains>, we are going to write a new line. This line will contain the link in your browser that appears when you log out of PBCS. It is used to trigger the pop-up box in Smart View and is for security. Minimize the text editor and return to your PBCS environment.

Your screen should look like this:

%20(Legacy)/Untitled%2016.png)

Click “Sign Out”

%20(Legacy)/Untitled%2017.png)

Now, turn your attention to the link in the browser. It should look like this:

---
%20(Legacy)/Untitled%2018.png)

Take this URL and add this to the end of it /u1/v1/adminconsole . It should now look like this.

---
%20(Legacy)/Untitled%2019.png)

Copy this URL to your clipboard and return to the XML file. Underneath <AppDomains>, you are going to create a new line that begins with <AppDomain> and ends with </AppDomain>, and has the URL sandwiched in between. It should look like this.

%20(Legacy)/Untitled%2020.png)

Save the file by pressing ⌘ Cmd + S at the same time. You can now close the XML file.

---

# Step 3 - Launch SmartView in Excel

Open Excel 365. (If already have it open, you will need to close Excel and re-open it). Go to the “Insert” tab and select the drop-down icon next to My Add-ins. The Smart View add-in should now be listed under Developer Add-ins. Select Smart View to add it to your Excel.

%20(Legacy)/Untitled%2021.png)

To login to your environment, select the “Smart View” ribbon and select the “Home” button to the left. This will open a panel in the right side of your excel prompting you to login.

%20(Legacy)/Untitled%2022.png)

Enter your credentials and login to be connected to your environment.

---
%20(Legacy)/Untitled%2023.png)

Smart View is now ready to use.

---
#### How to connect SmartView to NSPB (Planning)

SmartView uses **two different URLs** depending on the connection type. It is important to use the right one.

**Your EPM host** is the domain in your browser when logged into Planning (everything before `/HyperionPlanning/`).
Example host: `enfinityglobal-test-enfinityglobal.epm.us-ashburn-1.ocs.oraclecloud.com`

| Connection type | URL pattern | Example |
| --- | --- | --- |
| **Private Connection** | `https://<host>/HyperionPlanning/SmartView` | `https://enfinityglobal-test-enfinityglobal.epm.us-ashburn-1.ocs.oraclecloud.com/HyperionPlanning/SmartView` |
| **Shared Connection** | `https://<host>/workspace/SmartViewProviders` | `https://enfinityglobal-test-enfinityglobal.epm.us-ashburn-1.ocs.oraclecloud.com/workspace/SmartViewProviders` |

---

#### Private Connections — saved inside the workbook

A Private Connection is stored inside the Excel file. When you distribute a workbook, the connection travels with it.

**Steps:**
1. In Excel, open the **SmartView Panel** (SmartView → Panel)
2. Click **Private Connections**
3. In the URL field enter:
   `https://<your-host>/HyperionPlanning/SmartView`
   Example: `https://enfinityglobal-test-enfinityglobal.epm.us-ashburn-1.ocs.oraclecloud.com/HyperionPlanning/SmartView`
4. Press Enter — SmartView will ask for your NSPB username and password
5. Navigate: **NetSuite Planning and Budgeting → [AppName] → Planning → [Cube] → Forms → [Form name]**
6. Double-click the form — it opens as a grid in Excel
7. Save the workbook to preserve the Private Connection in the file

---

#### Shared Connections — configured once, available to all workbooks

A Shared Connection URL is set once in SmartView options. After that it appears in the SmartView panel for every workbook on that machine without re-entering the URL.

**Steps:**
1. In Excel, go to **SmartView → Options → Advanced**
2. In the **Shared Connections URL** field enter:
   `https://<your-host>/workspace/SmartViewProviders`
   Example: `https://enfinityglobal-test-enfinityglobal.epm.us-ashburn-1.ocs.oraclecloud.com/workspace/SmartViewProviders`
3. Click **OK**
4. Open the SmartView Panel (SmartView → Panel)
5. Click **Shared Connections** and log in with your NSPB credentials
6. Navigate: **EPM Cloud → NetSuite Planning and Budgeting → [AppName] → Planning → [Cube] → Forms → [Form name]**
7. Double-click the form to open it

---

**Private vs Shared — when to use which:**

| | Private | Shared |
| --- | --- | --- |
| URL | `/HyperionPlanning/SmartView` | `/workspace/SmartViewProviders` |
| Saved in | The Excel workbook | SmartView Options (machine-wide) |
| Who sees it | Anyone who opens that workbook | Anyone using that machine/profile |
| Best for | Distributing pre-connected workbooks | Daily users who work across many files |

---

#### Smart View - Planning Extension plugin

Oracle Smart View Planning Extension enables users to efficiently manage and modify metadata directly from the familiar Excel interface. This capability streamlines organizational data structures while maintaining integration with Oracle EPM Cloud.

## Key Metadata Management Capabilities

- **Dimension Editing**: Add, modify, or delete members within hierarchies across various dimensions (accounts, entities, periods, scenarios, etc.)
- **Property Management**: Update member properties, descriptions, aliases, and data types
- **Parent-Child Restructuring**: Reorganize hierarchical relationships between dimension members
- **Attribute Assignment**: Modify attribute associations to enrich reporting capabilities
- **Smart List Maintenance**: Update selection lists for enhanced data entry validation
- **Cross-Dimensional References**: Manage relationships between different dimensions
- **Batch Processing**: Import and export metadata changes in bulk through Excel
- **Security Control**: Apply access restrictions based on metadata hierarchies

[https://www.youtube.com/watch?v=rf5AFZ_LeWY&list=PLFPF-EEAm1xTuOPbyXjXsGySSSc9XQGWv&index=14](https://www.youtube.com/watch?v=rf5AFZ_LeWY&list=PLFPF-EEAm1xTuOPbyXjXsGySSSc9XQGWv&index=14)

# **Install & Enable Planning Extension**

On the home page, click the drop down button next to the user ID, then select **Downloads**.

We will need to download the **Planning Extensions**.

Then follow the instructions via the installation wizard.

After installation, launch Excel. Firstly, we would like to check that the **Planning Admin Extension** got enabled.

# **Maintain and modify Metadata**

**Edit Member**

Establish a Smart View Connection Planning connection and link to the Sample application by using the planning connection.

We will notice that there is a **Dimension** folder. All the dimensions are stored in this folder.

Double click on one of the dimension or right click then select Edit dimension. For example, let’s edit Account dimension.

Double click on the Account dimension. We see that the top member of the dimension cannot be edited, so the properties will be grayed out. Others are editable.

Some properties have a drop down menu, just like the web version, for example, Data Storage.

For others, we could just manually type in the value, for example, Parent Member.

Then **Submit** the changes.

# **Add New Member(s)**

Enter a new member name in the first column and then click Refresh. The new member is marked with a *, and the default properties will be displayed. We could edit those default properties. Then submit the changes.

**Move Member**

Click on the Parent Member, then type in a new parent member name. Then submit the changes.

**Shared Member**

Add the member as a shared member to a new shared member row. Type in the Parent Member name and Set the Data Storage property as Shared.  Then Submit the changes.

When we click Refresh, we notice that the Parent Member and Data Storage have changed back. But, actually, this member has been added as a shared member correctly.

Let’s check the web version to make sure everything has been set up correctly.

# **Refresh Database**

All changes to metadata require Essbase to be refreshed.  Essbase can be refreshed from Smart View.

Right click on the **Dimension** folder, and then select **Refresh Database**.

Check the **Database** checkbox and click the **Refresh** button.

Then click **OK**.

When the database is refreshed, click **Finish**.

Hope this post could give you some ideas on how to use Planning Extension to manage metadata in Excel. In the future posts, I will discuss something other Office add-ins. See you next time.

---

#### Standard Formatting in Smart View

Open Excel. Go to the **Smart View** tab in the ribbon. Click **Panel** and log in with your credentials.

Navigate to the **Smart View** tab in your Excel ribbon. Click on **Options**.

In the Options menu, select **Formatting** from the left-hand panel.

Ensure your settings match the ones shown below:

Still in the Options menu, select **Cell Styles** from the left-hand panel.

Compare your settings to the screenshot below:

If any discrepancies are found, adjust your settings to match those shown in the screenshots.

---

## Administrator Tasks

### Monthly / Daily tasks

#### Change the Scheduled time of the integration

# Change the Scheduled  time of the integration

Oracle PBCS supports automated job scheduling for tasks like data loads, metadata updates, and report generation. These jobs can run at set intervals or on-demand, streamlining processes and ensuring data accuracy.

**Job Types Supported:**

- **Data Load Jobs:** Automate loading of external data into PBCS to keep reports and forecasts up-to-date.
- **Metadata Management Jobs:** Update dimensions and hierarchies automatically at scheduled times.
- **Clear Data Jobs:** Regularly clear out old data to optimize system performance and prepare for new cycles.
- **Business Rule Execution:** Trigger business rules to recalculate data or update scenarios automatically.

# How to access Jobs console

Go to you PBCS environment and select “Jobs”

By default, your PBCS implementation includes a scheduled job that handles all integrations. This job runs tasks such as loading metadata and data from NetSuite and performing all necessary calculations. It’s important to regularly review the job’s execution time to ensure it aligns with your business processes and system requirements.

To change your schedule click on the three icons on the right and Edit.

Change the schedule and time zone.

Click Next and Save.

---
#### Manually run the integration

# Manually run the  integration

Oracle PBCS supports automated job scheduling for tasks like data loads, metadata updates, and report generation. These jobs can run at set intervals or on-demand, streamlining processes and ensuring data accuracy.

**Job Types Supported:**

- **Data Load Jobs:** Automate loading of external data into PBCS to keep reports and forecasts up-to-date.
- **Metadata Management Jobs:** Update dimensions and hierarchies automatically at scheduled times.
- **Clear Data Jobs:** Regularly clear out old data to optimize system performance and prepare for new cycles.
- **Business Rule Execution:** Trigger business rules to recalculate data or update scenarios automatically.

# How to run the integration

Go to you PBCS environment and select “Jobs”

By default, your PBCS implementation includes a scheduled job that handles all integrations. This job runs tasks such as loading metadata and data from NetSuite and performing all necessary calculations. It’s important to regularly review the job’s execution time to ensure it aligns with your business processes and system requirements.

Click on the three dots on the right of the main Job .

To change your schedule click on the three icons on the right and Edit.

Select “Run Now” then ,  Next and Save.

---
#### Manually run a specific aspect of the integration

# Batches

To manually execute the batch that runs overnight, follow these instructions:

1. In the main menu, under **Integration**, select **Data Management**.

1. Select **Process Details** to review the name of the batch that runs nightly.

1.  Navigate to **Batch Execution**, select the batch you identified from the process details, and click **Execute**.

## Running a metadata Manual Update

In **Batch Execution**, select **Batch_MD_Ongoing** (or the appropriate batch for your application) and click **Execute**.

**Note:** Batch names may differ across integrations. To verify the correct batch for your application:

Go to **Process Details** to identify the batch name.

Select the **Setup** tab, then **Batch Definition**. Choose the batch name you identified from the nightly process details, such as **Batch_MD_Data_Ongoing**.

You can now view the list of batches. Typically, the first one in the list handles metadata loading — in this example, **Batch_MD_Ongoing**.

## Running a Data Manual Update

Click on the **Workflow** tab.  In **Batch Execution**, select **Batch_Data_Ongoing** (or the correct batch) and click **Execute**.

**Note:** Batch names may differ across integrations. To verify the correct batch for your application:

Go to **Process Details** to identify the batch name.

Select the **Setup** tab, then **Batch Definition**. Choose the batch name you identified from the nightly process details, such as **Batch_MD_Data_Ongoing**.

You can now view the list of batches. Typically, the second one in the list handles data loading — in this example, **Batch_Data_Ongoing**.

# Data Load Rules

If you'd prefer not to execute the entire batch and only update values **for a specific period**, follow these steps:

1.  Select **Process Details** to identify the **Location** responsible for the data you wish to load.

Example: **IncStmt_Trans** for Income Statement values.

1.  Go to **Data Load Rule**, click the **Location**, and modify it to reflect the correct one for the data you need to load.

1.   **Select the Data Load Rule**, then click on **Execute**.

In the dialog that appears, **check the boxes for "Import from Source" and "Export to Target"**.

Specify the time range by selecting the period you want to reload, from the starting period to the ending period.

**Important:** If the Data Load Rule has an associated business rule, executing it will also run the business rule.

If you wish to avoid this, go to **Data Load Workbench**, select **Import** and **Export** manually. Only the selected period will be executed, and the business rule will not trigger. You can only load one period at a time from **Data Load Workbench**.

---
#### Setting Oracle Daily Maintenance Schedule

A business process instance requires one hour every day to perform routine maintenance. Service Administrators can select (and change) the most convenient time to start the hour-long daily maintenance process.

For example, if you view the jobs listed on the **Clear Cube** page while daily maintenance is running and then you click **Actions** and then **Submit**, an error message will display and the job will not start. Similarly, if you create a **Clear Cube** job on the **Schedule Job** page during daily maintenance and select **Run Now**, the system will prevent the job from starting and you'll see an error message.

The following jobs are prevented from starting during daily maintenance:

- Import Data
- Import Metadata
- Export Data
- Export Metadata
- Refresh Database
- Clear Cube
- Restructure Cube
- Compact Outline
- Merge Data Slices
- Optimize Aggregation

---

#### Updating Period Mappings for a New Fiscal Year

When changing the fiscal year, you need to add the periods for the new year to ensure new values can be loaded. Follow these steps to update the period mappings:

From the main menu, select **Data Exchange**.

Click **Actions → Period Mapping**.

Go to the **Source Mapping** tab. In **Source Type**, select **NetSuite**.

Ensure the selected **Calendar** is **SS_CAL**.

**Add the New Periods:** Click the **+** icon to manually add mappings for the new periods.

**Alternative: Upload multiple periods at once**

Click **Actions → Export to Excel** to download the current mappings.

Add the new periods in the Excel file and save it.

Click **Import from Excel** to upload multiple periods at once.

---

### How to add or change users in NSPB?

#### OCI: How to login?

1. To log into OCI console visit the Oracle Cloud sign-in page at [https://www.oracle.com/cloud/sign-in.html](https://www.oracle.com/cloud/sign-in.html).
2. Enter your domain or Account Name when prompted.

Go to users

Click “Here”

Use your admin credentials

This is what the OCI first screen should look like.

**Issue "You are not allowed to Perform this Action"**

---

#### OCI: Create Users

Sign into OCI

 [https://www.oracle.com/ar/cloud/sign-in.htmlhttps://www.oracle.com/ar/cloud/sign-in.html](https://www.oracle.com/ar/cloud/sign-in.htmlhttps://www.oracle.com/ar/cloud/sign-in.html)

# Create the user

Complete the user details

---

#### OCI: Add User Roles & Assign to Planning

Login into OCI

[OCI: How to login? ](OCI%20How%20to%20login%202aac8b8c36a88140a0e9d29d0dcc7531.md)

With an administration user access:

1 Go to three lines icons on the top left. Identity & Security> Domains.

2 Go to **OracleidendityCloudService** or **Default**

3 Click on the name of your prod epm server on the right . Ex: Planning_Planning

4 Click Application Roles

5 Next to role you want to select, click the drop-down arrow on the far left

6 Click Manage under Assigned users

7 At the bottom, click show available users and select the users.

8 Check the box next to the first name and click Assign.

9 Try the new user access (will receive a email )

---

#### OCI: Add Domain Admin users

In your organization, you might want administrators to have different rights of access to various tasks and resources in Oracle Identity Cloud Service. For example, the identity domain administrator has superuser privileges for an Oracle Identity Cloud Service identity domain. This administrator may want to delegate some of their responsibilities to other users to carry out the tasks associated with these responsibilities, such as managing system configuration and security settings, applications, users, groups, group memberships, and so on. To do this, the administrator assigns these users to other Oracle Identity Cloud Service administrator roles. Users who are assigned to these roles will be able to perform specific tasks that are associated with the roles.

With an administration user access:

Login into OCI

[OCI: How to login? ](OCI%20How%20to%20login%202aac8b8c36a88140a0e9d29d0dcc7531.md)

1) Go to three lines icons on the top left. Identity & Security> Domains.

In the following topic, you learn about Oracle Identity Cloud Service administrator roles and the privileges associated with each role.

Under OCI Go to  Domains

Add the selected users to the OCI domain Admin Role or  service Administrator (PBCS)

**Alternatively you can also add users as Applications Administrator in the same section**

[https://docs.oracle.com/en/cloud/paas/identity-cloud/uaids/understand-administrator-roles.html](https://docs.oracle.com/en/cloud/paas/identity-cloud/uaids/understand-administrator-roles.html)

---

#### How User and Roles Work?

# Step 1: **Create Users in OCI (Identity Domain) and assign “Predefined Roles”**

[OCI: Create Users](OCI%20Create%20Users%202aac8b8c36a88177bb0bcb78cad881ae.md)

- In **Oracle Cloud Infrastructure (OCI)**, create users and assign **Predefined Roles**:
    - **Service Administrator**: Full control over services.
    - **Power User**: Can manage services but with limited admin rights.
    - **User**: Can access services with minimal management rights.
    - **Viewer**: Read-only access.

# Step 2: **Create Groups in PBCS**

- Inside **PBCS**, create **Groups** to organize users. This simplifies role management.

Go to access Control

Example: Create a group called "Finance Team" and assign users like **John** and **Sarah** to it.

# Step 3: **Assign “Application Roles" in PBCS**

- Now, assign **Application-Specific Roles** to the created groups. Some available roles in **PBCS** include:
    - **Approvals Administrator**: Resolves approval issues.
    - **Planner**: Modifies planning data and interacts with grids.
    - **Ad Hoc Grid Creator**: Can create, modify, and save ad-hoc grids.
    - **Task List Access Manager**: Manages task lists for others.

- Example: Assign the **Ad Hoc - User** role to the **Finance Team**, giving all users in this group the ability to modify planning data.

### Step 4: **Review Role Assignment Report**

- In PBCS, use the **Role Assignment Report** to see which users and groups have been assigned specific application roles. This allows admins to track and manage permissions easily.

---

### How to Copy versions and Archive Forecasts?

# Create a new Version

Open Navegator and select Dimensions

Select Version Dimension. Select any other Version and click “Add Sibling:”

Name the new version. Make sure the store property is Store and is enabled for all cubes

Refresh the database

# Copy Data between Versions

Open PBCS , select Copy versions

Select the source scenario “Forecast” and “Base”.
Enter the destination version Ex: Archive1.
Click Go

Select all entities.

Execute the copy data

---

## How do I escalate to Oracle Support?

This section provides key information on using Oracle Support, including how to create a ticket, find your Support Identifier, and more. It highlights the importance of timely support, the types available, and the benefits of Oracle’s support network.

If you need to escalate an issue, follow the step-by-step instructions to submit a ticket via **Oracle Support Cloud** for a smooth resolution process.

To create a support ticket, navigate to the following URL:

[https://support.oracle.com/](https://support.oracle.com/)

# Sign In to Oracle

Select **“Sign in with your commercial cloud account.”**

If this is your first time logging in, choose **“Sign in with a different user account.”**

Provide your **tenancy name**, then click **Continue.**

Select **OracleIdentityCloudService** and click **“Next.”**

Sign in using your **PBCS credentials.**

If this is your first time accessing Oracle Support, you will be required to set up **two-factor authentication (2FA)** using an **Authenticator App.** Follow the on-screen prompts to complete this step.

# Create Service Request.

Once logged in, click **“Create Service Request.”**

Fill in the required details based on the issue you are experiencing. Below is an example of how to complete the form:

After submitting your service request, an **Oracle representative** will contact you to assist with resolving your issue.

By following these steps, you can efficiently escalate a ticket to Oracle and receive the necessary support.

---

## Advanced NSPB Tutorials

### How to create new Customers or Relationship members?

# Create a new member

Go into PBCS/ Select ‘Dimensions”

Select the desired dimension. Go to a sibling of the new desired member to be created. Click the icon “Add a new sibling”

Enter the name, alias of the new member and click. Save.

# Refresh the database

---

### How to move Customers or Relationship members to other Hierarchy?

#### Refresh the database.

# How to  Refresh the Database ?

After creating new members, scenarios, versions, relationships or customers you need to refresh the database.

Navigate to Dimensions in the main menu.

Select Actions → Refresh Database.

---
### How to create or modify a form in PBCS?

# Create a Form

Log into PBCS

Select your navigator, under ***Create and Manage***, select ***Forms.***

You have two options: you can either create your own form or select an existing one to view or edit. To create a new form, choose the folder where you want it to be stored, then click on the following icon.

Name the form and give your form a brief description.

Select ***Layout***

# **Form Layout**

1. **POV**: The Point of View (POV) setting determines the fixed dimensions that cannot be altered within the form. It's advisable to reserve dimensions not utilized for viewing or inputting data specifically for the POV.
2. **Page**: Dimensions placed in the Page area of the form will be interactive, allowing users to select and manipulate data for various members within those dimensions.
3. **Rows & Columns**: Dimensions that you want to see listed one after the other will go in the Rows and Columns sections. This ensures that all members of the dimension are visible and accessible within these sections.

>
📢

*Note: Drag and drop the dimensions into the correct field. Make sure to drop the dimension directly onto the field's name. (Example: Drag and drop the Department dimension onto the label 'Page'.)*

To choose the member you wish to use on your form, you'll find a Member Selector Icon next to each respective dimension.

On the Member Selection page, you have the option to choose your members. Simply select the desired member and click the 'Add' icon (>). If you need to refine your selection further, you can utilize the Function Selector tool (fx icon). For example, suppose you're creating a form where you want to be able to select both Location and Department, and pick any location under 'Total Location'. This is why I specify Level 0 Descendants. Similarly, you want the same flexibility for Department. Additionally, you can adjust your Dimensions simultaneously by selecting the drop down next to “Account”.

# **Adding a Formula to your Dimension**

Specify the dimension for which you wish to add a formula, choose the corresponding number on the rows. Then, navigate to the right-hand panel and select 'Segment Properties'. Select the pencil icon next to Formula.

Within this dropdown menu, you'll find various mathematical functions to incorporate into your formula. Click [here](https://docs.oracle.com/en/cloud/saas/freeform/freef/formula_functions.html#planning_fuse_admin_book_cloud_329) to access an Oracle Page for detailed definitions of each function.

# **Property Settings**

# **Grid Properties**

- **Suppress Missing Blocks:** Improves the efficiency of hiding rows or columns with missing data. It's recommended to test performance before and after using this setting, especially if only a few rows are suppressed. Some suppressed blocks may not follow Dynamic Calc members. Row members may lose their indentation.
- **Suppress Missing Data:** Hides rows or columns without data. When data is missing, "#MISSING" is displayed in cells.
- **Suppress Invalid Data:** Hides rows or columns with invalid data. Cells with invalid data become read-only.
- **Use Database Suppression:** Applies row suppression at the Oracle Essbase level, reducing data at the business process level and impacting query thresholds.
- **Default Row Height & Column Width:** Sets the default height of rows. Options include Medium, Size-to-Fit, and Custom pixel size. Sets the default width of columns. Options include Small, Medium, Large, Size-to-Fit, and Custom pixel size.
- **Suppress Invalid Scenario/Time Periods:** Ties the form grid display to the scenario's time period range, hiding time periods outside of it.
- **Global Assumptions Form:** Transfers global assumptions from test to production environments for a form.
- **Suppress Missing also Suppresses Zero:** When enabled, suppresses rows or columns containing both #Missing and zeros.
- **Remove Form Suppressions in Ad Hoc:** Allows Smart View users to perform ad hoc analysis on a form with suppression options specified.

# **Dimension Properties**

- **Show Consolidation Operators:** Reveals consolidation operators.
- **Start Expanded:** Exclusive to dimensions on rows or columns, this option opens the dimension member list in an expanded view initially.
- **Enable Custom Attributes:** Only applicable to dimensions on rows or columns, this option allows custom attributes.
- **Drill on Shared Members:** Pertaining to row or column dimensions, this feature enables drilling on shared members if the shared member resides on a parent member within the main hierarchy.

# **Display Properties**

- **Make Form Read-Only:** Restrict users from making changes to the form.
- **Hide Form:** Keep forms out of view, especially if they're part of a dashboard or accessed from menus or task lists.
- **Display Missing Values as Blank:** Show empty cells for missing data instead of displaying "#MISSING".
- **Enable Mass Allocate:** Allow users with the Mass Allocate role to redistribute data.
- **Enable Grid Spread:** Enable spreading data across the grid.
- **Enable Cell-Level Document:** Permit users to attach, edit, and view documents within individual cells, based on their permissions.
- **Message for Forms with No Data:** Add a custom message to inform users when there's no valid data in the form.
- **Hide Save Confirmation Message:** Prevent the display of a confirmation message when saving the form.

# **Smart View Options**

- **Disable spreading:** Stops you from using spreading options in Smart View, like spreading data for certain time periods or using mass allocations.
- **Disable formatting:** Disables the formatting options (Save, Clear, Apply) on the provider ribbon in Smart View.
- **Repeat Member Labels:** Enables the use of repeated member labels in forms. If this option is disabled, you can still opt for repeated members in forms via Smart View. Simply navigate to the Smart View Options dialog, Formatting tab, and select Repeat Member Labels. For forms with the 'Enable drop-down for dimensions' feature activated (Segment property), the form layout will automatically adopt the behavior of having repeated member labels, irrespective of the setting.

# **Adding Business Rules**

Select the Business Rules tab to review. Select the Business Rule and click **“Add”**.

Under Business Rule Properties, there are four selections.

**Run Before Load:** This should not be checked on any form. If this is checked then the business rule executes before the form loads, meaning before any data is displayed or manipulated in the form.

**Run After Save:** When the 'Save' button is selected, the business rule will be triggered and executed.

**Use Members on Forms:** When a word within {} braces is on a business rule, it signifies a variable. Upon selection of this variable on a form, it implies that whatever is chosen in the POV (Point of View) will be transmitted to this business rule, provided the rule uses variables.

**Hide Prompt:** When this is checked, this option hides the presence of variables or prompts on a form.

***Usually, if the data is being derived from the Point of View (POV), it's advisable to use 'Members on Forms' and 'Hide Prompt' together."***

**Saving your form**

To preview your form's appearance, navigate to the Layout tab and choose Preview. This will showcase your form, allowing you to assess any necessary adjustments. If you're satisfied with the form and wish to save it, click on Save & Save As, then proceed to Finish.

---

### How to create a Dashboard?

This tutorial is designed to guide users through the process of creating and editing dashboards in Oracle's Planning and Budgeting Cloud Service (PBCS). The video starts by walking users through the login process into the PBCS environment and demonstrates how to access the dashboard creation tools.

Key steps covered in the tutorial include:

1. **Accessing the Dashboard Section:** The tutorial shows how to navigate to the dashboards section after logging into PBCS, ensuring that users are familiar with the interface.
2. **Creating a New Dashboard:** Viewers are guided through the process of naming and setting up a new dashboard. This includes selecting the appropriate options and entering the necessary details to customize the dashboard according to specific requirements.
3. **Editing Dashboards:** The tutorial also covers how to modify existing dashboards, explaining how to adjust various elements, add new data sources, and customize the visual layout to meet business needs.
4. **Using PBCS Tools:** The video explores different tools and features within PBCS that can be utilized to enhance the functionality of the dashboards, such as applying filters, creating visualizations, and configuring data integration settings.
5. **Finalizing and Saving Dashboards:** The tutorial concludes with instructions on how to save the completed dashboard and make it available for use within the organization.

[https://youtu.be/-PxTFYoBryM](https://youtu.be/-PxTFYoBryM)

Edit the desired dashboard

Edit the source form for a dash board by clicking on the gear icon

And select the source form for the dashboard panel

---

### PBCS Copy Data Tool

---

### How to push data from Plan to Reporting Cube?

Data maps in Planning modules can be utilized to transfer data between modules, models, or cubes. Pushing data from **Plan Cube** to **Reporting Cube** enables instant aggregation of data from relationships and other large dimensions using Reporting's ASO technology. Once data from Plan is pushed to ASO reporting cube, all data, including all dimensions, will be instantly aggregated. In some cases, **Plan Cube** is used to perform complex calculations, while the Reporting cube is used to instantly aggregate all data.

# **Manually Pushing  data**

1. From the Home page, click **Application** , then **Data Exchange** , and then **Data Maps**.

Select  de desired  data map, and then from **Actions**, click **Push Data**.

**Note:**

When the data map has a Source with changed labels, and the labels do not match in the Target, the data map gives warnings for the years that do not match. However, Push is not pushing data. When the Data map has a Target with changed labels and the labels do not match in the Target, the data map is successful, and the Years in the Source are matched by using the period ID’s.

**Do you want to know more about how to push data works?** Follow this video tutorial

[https://www.youtube.com/embed/-EUc7vauSV0?rel=0&autoplay=1](https://www.youtube.com/embed/-EUc7vauSV0?rel=0&autoplay=1)

---

### How to add a Business Rule to a Form ?

# How to add  a Business Rule to a Form ?

When adding a business rule to a form in PBCS (Planning and Budgeting Cloud Service), you can run specific calculations or validations within the form. This allows you to aggregate the submitted data or define and apply complex business logic to ensure data accuracy and consistency or

To add a business rule to a form, you need to follow these steps:

Open the form in PBCS

To make changes, select the desired form and then click the edit pencil.

Next, navigate to the "Business rule" tab.

To add the desired business rule to be executed, click on "Add". Then, specify the condition as "Run after save".

Save and apply the rule to the form.

Now, every time you save the form after submitting data, the desired business rule will be executed. By adding a business rule to a form, you can automate calculations. This helps maintain data integrity and make informed decisions based on accurate information.

---

### How to reset a user password?

If you are having trouble accessing your PBCS environment or Smartview addin due to "Invalid Credentials" error, follow these steps to reset your password.

Access your PBCS environment using a web browser:

Click “Forgot Password”

Enter your email and “Next”

You will receive and email to reset your password.

---

### PBCS Pipelines

#### Datamanagement : Batch to Pipeline migration

**Migrating Old Scheduled Jobs**

To support the migration of all existing scheduled jobs in Data Management/Data Integration to the EPM Platform Job Scheduler console, a new migration script titled "Migrate Schedules to Platform Jobs Scheduler" is available from System Maintenance Tasks in Data Management.

[](data:image/jpeg;base64,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gdzLgYyTjHPOcdaQGxketGR60bV9BRtX0FABketGR60bV9BRtX0FABketGR60bV9BRtX0FABketGR60bV9BRtX0FABketGR60bV9BRtX0FABketGR60bV9BRtX0FABketGR60bV9BRtX0FABketGR60bV9BRtX0FABketGR60bV9BRtX0FACMRlee9LketNZVyvA607avoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aMj1o2r6CjavoKADI9aZMR5EnP8J/lT9q+gqOZVEEnA+6f5UAUtW0ePVljDyvGYw20ocHkYrEg8LaxbqkcevyCNFUAbDkgADb16cHHfmutooA42Twfqskkcz6/K00asquQ3y5UDI565H61raTo1/ZXYnvNUkuFEZCwjIRSWJ455ABAGfStCa9kSxa4hs5pXDYEOArNzjvWe2tXVtue+sxBGHCZDFsZXdycY9vrVKLewm0jcorEfxGnlRGK0maZ22vExCGI/7Weme1X7C+N6jloHiZGwQeQfoe9Dg0rsE0y5RRRUjCiiigAooooAKKKKACiiigDO1CSGKZZbggQpE7SFhkbQOeKhM+i6jIEd7WZlSNxvUcK2dvX154qXUoPtMy25Yr5sTpuAyRmsi78G20yGO3meCNvvoU3BjknP1GePTFNgakkujw2shka0SFAWdSoGAeCSP0oSDR4H3RpZqc8sFXggZ5Pas2PwhbR2jQ+aWdixMjRKScqBg+o4ziol8GRtfm6uLsysXV3UQgB8HPI/T6UuoGxdX+m2AgaVowsgby2SLc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FFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFKKAEoqUYprYpAMooopgFFFFABRRRQAUUUUAFFFFABRRRQAUj/AOrf/dP8qWkf/Vv/ALp/lQA9P9dJ9BUlRp/rpPoKkqRhRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBUn/AOP23+jVLUc//H5B9GqSqEFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABSP8A6t/90/ypaR/9W/8Aun+VAD0/10n0FSVGv+uk+gqSpGFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFaf8A4+ofxp9Mn/4+Ifxp9UIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACkf/AFb/AO6f5UtI/wDq3/3T/KgCRf8AWv8AQU+mL/rH+gp9SMKKKKACiiigAooooAKKKKACiiigAooooAKKKKAK8/8Ar4fxp9Mn/wCPiH8afTEJRRRTAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKR/9W/+6f5UtI/+rf8A3T/KgCRf9a/4U+o1/wBbJ9BUlSMKKKKACiiigAooooAKKKKACiiigAooooAKKKKAK0//AB8w/jT6ZP8A8fUH40+qEFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABSP/q3/wB0/wAqWkf/AFb/AO6f5UAPX/WyfQVJTF/1r/QU+pGFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFaf/AI+4PoafTJ/+PmH8afVCCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigApH/wBW/wDun+VLSP8A6t/90/yoAkX/AFjfhT6Yv+sb8KfUjCiiigAooooAKKKKACiiigAooooAKKKKACiiigCvP/r4fqadTZ/9fD9TTqYgooopgFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFI/+rf/AHT/ACpaR/8AVv8A7p/lQBIv+sf8KfTF/wBa/wBBT6kYUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAVrnPnQ/jTdx9aLpv9JhX1BNJVrYkXcfWjcfWkooAXcfWjcfWkooAXcfWjcfWkooAXcfWjcfWkooAXcfWjcfWkooAXcfWjcfWkooAXcfWjcfWkooAXcfWjcfWkooAXcfWjcfWkooAXcfWjcfWkooAXcfWjcfWkooAXcfWjcfWkooAXcfWjcfWkooAXcfWjcfWkooAXcfWjcfWkooAXcfWjcfWkooAXcfWjcfWkooAXcfWjcfWkooAXcfWjcfWkooAXcfWjcfWkooAXcfWjcfWkooAXcf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)

**Image Shows Migrating Schedules To The EPM Platform Job Scheduler**

The Migrate Schedules to Platform Jobs Scheduler enables you to migrate:

- Integration schedules
- Batch schedules
- System Maintenance schedules

Additionally you can select the execution method (in preview mode or execution mode) and delete old schedules.

[](data:image/jpeg;base64,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EtRT/cP0NG5v736Uhyep/SiwD6Ki2e5/M0bPc/maYiWiotnufzNGz3P5mgCWiotnufzNGz3P5mgCWiotnufzNGz3P5mgCWiotnufzNGz3P5mgCWiotnufzNGz3P5mgCWiH/VL9Ki2e5/M04FgMA4H0pASJ92h1DoyHowxUYLAYDfpS7m/vfpQM4XXbLW7LQntls1uILcqVmWXgICDnaOcgDmuq0zWbbW9NW4tzyGUSJnJQ8f5BrQ3N/e/SqkNlbWMbLawRwrJIHYRoACc9aqc5zd2KEYxjZblqiiioGFFFFADB/rX+g/rT6YP9a/0H9afVCCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKZJ90f7w/nT6ZJ90f7w/nQA+iiipGFFFFADB/rX+g/rT6YP9a/0H9afVCCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKZJ90f7w/nT6ZJ90f7w/nQA+iiipGFFFFADB/rX+g/rT6YP9a/0H9afVCCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKZJ90f7w/nT6ZJ90f7w/nQA+iiipGFFFFADB/rX+g/rT6YP9a/0H9afVCCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKZJ90f7w/nT6ZJ90f7w/nQA+iiipGFFFFADB/rX+g/rT6YP9a/0H9afVCCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKZJ90f7w/nT6ZJ90f7w/nQA+iiipGFFFFADB/rX+g/rT6YP9a/0H9afVCCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKZJ90f7w/nT6ZJ90f7w/nQA+iiipGFFFFADB/rX+g/rT6YP9a/0H9afVCCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKZJ90f7w/nT6ZJ90f7w/nQA+iiipGFFFFADB/rX+g/rT6YP9a/0H9afVCCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKZJ90f7w/nT6ZJ90f7w/nQA+iiipGFFFFADCHDll28gDmj956J+Zp9FFwGfvPRPzNH7z0T8zT6KdwGfvPRPzNH7z0T8zT6KLgM/eeifmaP3non5mn0UXAZ+89E/M0fvPRPzNPoouAz956J+Zo/eeifmafRRcBn7z0T8zR+89E/M0+ii4DP3non5mj956J+Zp9FFwGfvPRPzNH7z0T8zT6KLgM/eeifmaP3non5mn0UXAZ+89E/M0fvPRPzNPoouAz956J+Zo/eeifmafRRcBn7z0T8zR+89E/M0+ii4DP3non5mj956J+Zp9FFwGfvPRPzNH7z0T8zT6KLgM/eeifmaP3non5mn0UXAZ+89E/M0fvPRPzNPoouAz956J+Zo/eeifmafRRcBn7z0T8zQRI2AdgGQeM0+ii4BRRRSAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiilHUUAMLoDguoPoWFHmR/8APRP++hXKXl7BY2ZuZoxJl9v8OSxOBktgD6k1WuNbsLVY/OjVJWKB4imTGGOMkgEfhnmt/ZLuY+1fY7TzI/8Anon/AH0KPMj/AOeif99CuQGsaQWVftNtlk3jK44/LjoeDzUdvrenXEN1KvlhYGx8y43DjBwRkZJxR7Jdw9q+x2fmR/8APRP++hSggjIII9Qa5Cz1PT71kjjMP2gxiRotvK5AOM4wcZ7Vv6RjZcAABQ4wB0HyipnS5Ve441Luxo0UUVkahRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFRXRIs5yDgiNsH8KEA/zI/+eif99CjzI/8Anon/AH0K5S5uorUQotoZ5pchIo1XJwMk5OAAPc1Wtdbsry4FvBbO0wI3oY1BjHct6AHj3PTNb+xXcx9q+x2oZWGVYEeoNJ5kf/PRP++hWChCwXgTCjyVyF4/iqld3kVtMkEVk1zMyl/LiVQQo4ySxA60vZa7h7XyOr8yP/non/fQo8yP/non/fQrkJNX0qF3SWWKORCAyNGdwJ6DGOfwzQ2saQoybiDGwPkISMHp0HX26+1P2S7h7V9jr/Mj/wCeif8AfQp1clZ3trf+cYY42jjYKHABDgqDn9cV02F9KidPlKjPmJ6UdRSUVmaHH3UUjxPB5k0DhjllQE9emCCCDVC30iG18tIZ7lYVdJDFsG1nXo33cjp0GBXoi/dFLW/t/Iw9j5nmp8PWRmkkzL+9B35iUkk55DFcr17GlfQ45DK0l7es0xBmYqv7zBBH8PHTtivSaKPbLsP2T7nnlhpNtpty00Bf5hjDQrnPGTu27u3TOK6rRQ3kTOVIDONpIxngVs1G/wB6plV5o8thxp8rvcbRRRWRqFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAVFcqWtJlUZYxsAPXipaKAOLuYPtHkuss0E8JOyRE5GRgjBBBH1qtbaTa2k4nha4WbcGaTGS/HIPHIPX69MV6H2orf2/kYex8zl7dZJbW9ZY3I8oAfKeTnNZl1bfaJ0njuLi3mRSm+NQcqecEMCOtdw/3hT6Pb63sP2Om55xBoltBqK3oluGlVy43IOpOeTtyfxNNOhW/2ZrYXFyICyyeWY1Ybx0bleenTp7V6TRR7ZbWD2T7nCWNrFYROkW87yGP7sKMgAcBQAOnaut59D+VXqiqZ1eboVCny9T/2Q==)

**Image Shows Options For Executing A Migrate Schedules To Platform Jobs Scheduler Script**

The old scheduling functionality in Data Management will be deprecated in Q4 2024.

**Business Benefit**: Scheduling  Data Management jobs from the EPM Platform Job Scheduler console provides consistent scheduling functionality in EPM Cloud. Using the EPM Cloud job console, customers have a central access point from which they can select and manage scheduling parameters for ongoing jobs. Additionally, the EPM Platform Job Scheduler console provides enhanced functionality like the ability to view, edit, or delete schedules for each individual artifact.

---

### PBCS Locking a Scenario

If you wish to extend the timeframe until you can submit values into a Scenario, please follow these instructions:

Navigate to Dimensions in the main menu.

Select the Scenario dimension, click on the pencil icon next to the Budget scenario to edit it.

Adjust the Start Yr and Start Period based on the period and year from which you want to enter values. Save the changes.

Select Actions, Refresh Database.

---

### How to create Scenarios and Versions

Go to the dimension editor:

Bussines rule to copy data from one scenario or forecast to a new scenario.

```jsx

/*Copy Data from From_Scenario to To_Scenario*/
FIX (&CurrentVersion)
    DATACOPY Forecast0 to "Forecast1;
ENDFIX

```

BUssnies

---

### Archive Forecast backups on NSPB

**Once your current forecast is complete, you might need to create a new version of it for further planning or analysis.** This tutorial explains how to efficiently copy data from one forecast scenario to a new one in Oracle PBCS. It includes two key steps:

1. **Creating a New Forecast Scenario:**
    - Navigate to the Dimension Editor, add a new child under the "Scenario" dimension, fill out the required parameters, and refresh the database to apply the changes.
2. **Creating a Business Rule:**
    - Use the Rule Manager to create a new business rule for copying data between scenarios. You’ll input a script that transfers data from an existing forecast scenario to the newly created one. Once the rule is saved, deploy and run it to complete the data transfer.

After following these steps, you can review the new scenario to confirm the data has been successfully copied.

# Create a new forecast scenario

Go to the dimension editor and create the new forcast.

Select Dimension “Scenario” Open the desired hierachy , and click on the “Add child” Icon

Complete the following Scenaario parameters

Click save

Refresh the database

[How to  Refresh the Database ?](How%20to%20Refresh%20the%20Database%202aac8b8c36a881d0bcc9dadb24f53bd0.md)

# Create a Bussines rule

To copy data between one Forecast to the new Forecast, create a new bussines rule.

Open The Rule managemer editor. Open the navegator and go to “Rules”

Open, Planning , dc_EPBCS, dc_plan and right click “New”

Click “Edit Script”

Paste the following code: Where under the fix statement are the versions needed to be copied from one forecast to the new one.

```jsx
 /*Copy Data from From_Scenario to To_Scenario*/
FIX ("Base",  "Final")
    DATACOPY "Forecast0" to "Forecast1;
ENDFIX

```

# Run the Bussines rule

Save, deploy and run

 The rule will start running . After it finishes review your new scenario

---

### Build Income Statement Custom Report

---

### Cloning EPM Cloud Environments

The Clone Environment feature is a screen-based way to clone an environment (including NPBCS< FCCS, narrative Reporting environments) and, optionally, identity domain artifacts (users and predefined role assignments), and contents of the inbox, outbox, and stored snapshots.

Additionally, for Account Reconciliation, Planning, Planning Modules, FreeForm, Financial Consolidation and Close, Profitability and Cost Management, Enterprise Profitability and Cost Management, Tax Reporting, Sales Planning, and Strategic Workforce Planning you can clone Data Management records.

You can also clone the Job Console records available in Planning, Planning Modules, FreeForm, Financial Consolidation and Close, Enterprise Profitability and Cost Management, and Tax Reporting environments, and the application audit data available in Planning, Planning Modules, FreeForm, and Enterprise Profitability and Cost Management environments.

# **Step by Step Tutorial**

Open EPM. Go to Tools - Clone Environment.

Enter the target URL, username, and password. If you need to Clone Production to Test. Enter the Test environment URL as Target.

The username must have, at a minimum, the Service Administrator role. Additionally, if user provisioning is to be migrated, the Domain Administrator role is required. Selecting the option to include Users and Predefined Roles will ensure that all roles assigned in My Services are migrated.

This is particularly useful if the target environment needs to replicate the access setup of the source environment. When access groups are utilized for dimension and other access controls (which is strongly recommended), migrating provisioning ensures that all users assigned to a group are correctly configured.

However, if the target environment does not require the same user setup as the source, it is advisable to leave the box unchecked. In such cases, user provisioning in My Services and group assignments in the target environment will need to be updated manually post-migration.

Kept track of the Clone progress.

Verify if the process was successful

---

### PBCS - How to change the Jobs Time zone?

Normally is Jobs Time zone is UTC . But it can be changed here

---

### PBCS: How to kill a calculation process

# PBCS: How to kill a calculation  process

Open PBCS and go to Rules

Click under Database Properties

Right-click “Netsuite” Or your PBCs application and “Sessions”

Right-click the selected running process and click “apply” To kill the process

---

### NSPB: Working with Reports

#### Updating Report Header

# Updating  Report Header

#

- Navigate to Reports

- Copy desired report

- Save report and edit

- Edit header Text1 object

- Add additional text “As of “
- Select the function button on the right-hand side
- Text Functions object will appear
- Search for Member and select MemberAlias
- Select Period and designate which Column the Period should come from
- Repeat for Years

- Final header will appear as displayed below

- Save header changes

- Preview report

- If specific dates or syntax is desired, Dimension Alias(Default) can be changed

- Period Alias(Default) can be updated to March 31, April 30, etc.

- Years Alias(Default) can be updated to the full year 2024, 2025, etc.

---

#### Sending Reports to Multiple Recipients

Open the Bursting definition

Under email select : **Send all generated reports to all recipients in a single email**

This will overwrite the distribution list

>
📢

The Distribution File will not be used.

Then click **Distribution List.** Add all needed users. Click ok

Under **Attachment Name**, you can customize the attachment name, including artifact names and dates.

Add Date variable to the Attachment file name

Save and run the Burting Definition

---

#### How to schedule a report (Legacy)

Scheduling Reports

**For scheduling reports, please follow these steps:**

Log in to Planning and in the main menu, select "Explore Repository".

/image1.png)

Click on "New Document".

/image2.png)

Select the option “Batch Reports for Scheduling”.

/image3.png)

In Type, choose "Financial Reporting Book" and select all the books you want to add to this schedule.

/image4.png)

Close.

/image5.png)

Select "Yes".

/image6.png)

Click "Ok".

/image7.png)

Rename the batch using an appropriate name according to the books you have selected.

/image8.png)

You will now have this new batch created under the folder you have selected.

/image9.png)

Go to "Tools" → "Batch Scheduler".

/image10.png)

Select "File" → "New Scheduled Batch".

/image11.png)

Next, you'll need to set up the schedule according to your requirements. I've prepared an example:

Add a Name and a Description for the Batch Job we are creating.

/image12.png)

Select the batch we created earlier and click "Next".

/image13.png)

Choose the options you'd like to execute with this schedule.

/image14.png)

Since I selected the option to send this as a PDF by email, in this next step, I'll select the email recipient of the file.

/image15.png)

Once you've finished setting up all these options, you'll be able to see the new schedule status in the Batch Scheduler.

/image16.png)

 *>*

---

## Advanced Netsuite Tutorials

### Netsuite to PBCS connection and Jobs Scheduling

# **Update of Data On Demand (Manual Integration)**

This guide explains how to manually trigger the metadata and data synchronization between NetSuite and NSPB.

### 1. Navigate to Data Exchange
Click on the **Navigator** icon and select **Data Exchange**.

### 2. Execute the Integration Pipeline
Click on **Actions** and select the pipeline named **Batch_MD_Data_Ongoing**.

> [!IMPORTANT]
> Ensure you have updated the Monthly Substitution Variables (TPXX format) before executing, otherwise the data may load into the wrong period.

### 3. Set Parameters
Update the **Start Period** and **End Period** for the data you wish to load. Leave other parameters as default.

In this example, we push data from **Jul-25 to Dec-25**.

### 4. Verify Completion
Once the process is finished, a green check mark should appear indicating that the integration was successfully completed.

### 5. Configure Connection
Click on **Configure Connections** and highlight the **Netsuite_ERP** row.

Click on **Edit** to modify the connection parameters.

1.  **Token Key**: Replace the existing Token Key by copying and pasting the new key from NetSuite.

2.  **Token Secret**: Replace the existing Token Secret with the new value.

### 4. Test Connection
Click on **Test Connection**. A confirmation notification should appear advising if the connection was successful. If it fails, verify that the Consumer Key, Consumer Secret, Token Key, and Token Secret are valid.

---

### Netsuite - How to create a token?

Creating a  Netsuite Token allows for seamless integration and data transfer between Netsuite and PBCS

# Access Netsuite with Admin Credentials.

Navigate to “Setup” > “Integration” > “Manage Integrations” > “New”

Select the following options as described

**Name**: This is a free text entry field. I recommend naming it something like “NSPB Data Integration.” The name you enter here will appear on subsequent menus.

**Check** “Token-Based Authentication”

**Uncheck** TBA: Authorization Flow”

**Check**  “User Credentials”

Click Save.

Consumer Key & Consumer Secret will be displayed at the bottom of the page.

Copy and paste these values into a text file (Consumer Key and Secret)

On Netsuite  home page  scroll to the “Settings” tile to select **“Manage Access Tokens”**

Click “New My Access Token”

In the “Application Name” drop down box, select the name of the integration you just created. The Token name will automatically populate with the name of the integration pairs with the current user/role. Then Click “save.”

Copy/Paste the Token ID and Token Secret into the same document you stored the Consumer Key and Consumer Secret in, and send the combo to the consultant.

**Close Netsuite.**

# Add token information to the PBCS Integration

Open PBCS. Enter Token information to PBCS : On Pbcs go to data Exchange-> Data Integration (Tab)->Actions->Applications->Configure Connections-> Select Netsuite Conection ->Edit-> Enter keys -> Test Connection

Go to the “Connection” Icon

Update the Consumer Key , Consumer Secret, Token Key and Token Secret. Test the connection to see if everything is working. Click ok.

Check the account number is the exact same characters as on Netsuite.

Select Test Connection.

Ok.

---

### Netsuite - Create user and access

The support team occasionally needs to compare data between the Netsuite and PBCS environments. For this reason, it is a required step for us to have access to your Netsuite environment through our [support@company.com](mailto:support@company.com) support user.

To add this user, you need to create a record for it. In this record, you should explicitly indicate that access to NetSuite should be provided.

Follow the following steps to help us understand your NetSuite settings:

# Create user

Be sure to be logged in as the Administrator.

1. In order to give someone access to NetSuite, you will need to begin by creating an employee record. Go to **Lists** > **Employees** > **Employees** > **New**.

1. Enter the **NAME** and the **EMAIL** address. (The email will be the user login) Enter the **SUBSIDIARY** if there are multiple.

**Note:** You may fill in other fields on the employee/user record as preferred, but this is all that is needed when giving someone access to NetSuite.

# Give access

Click the **Access** subtab.

Check **GIVE ACCESS** box There are 2 options in how you can setup the password:

Check **SEND NOTIFICATION EMAIL** box – an auto generated email will be sent to setup password OR Check **MANUALLY ASSIGN OR CHANGE PASSWORD** Box, assign a password of your choice, and Check **REQUIRE PASSWORD CHANGE ON NEXT LOGIN**.

Select the **Role** that you need to assign and click **Add**.

For support purposes, we only require access permissions to your Netsuite environment. Administrator access will be needed only if we encounter issues with any saved searches.

Note: You can select multiple roles under this user without affecting the number of licenses you have. When you have finished entering all the information, click **Save**.

---

### How to Modify a Save Search

#### Delete Users on Netsuite

# Deleting Accounts and Making Accounts Inactive

An account is a category of transactions related to a specific type of asset, liability, equity, income, or expense. Your accounts are listed in your chart of accounts. You can customize your chart of accounts to make it more useful. You can delete accounts that are never used, inactivate accounts that are not currently being used, or both.

- Accounts that are inactive appear in your chart of accounts only when the Show Inactives box is checked. If you do not want to see inactive accounts, clear the Show Inactives box on the chart of accounts. Marking an account inactive **does not** alter the amount in that account. You must move any amount to another account to reduce the amount to zero.
- Accounts that have been deleted no longer show in your chart of accounts.

Many accounts cannot be deleted. You can delete an account if there is no activity in the account and if the account is not required by NetSuite. For example, the non-posting Sales Order account cannot be deleted because NetSuite uses this account for sales orders. Also, certain accounts cannot be deleted because they are required for reporting purposes. Reports are hard-coded with these accounts, therefore, NetSuite does not permit you to delete them. You can, however, make them inactive.

You can delete or make accounts inactive from individual account records, or directly on the chart of accounts list.

**To delete or make accounts inactive from account records:**
1. Go to *Lists > Accounting > Accounts*.
2. Click the **Edit** link for an account that you want to delete or mark inactive.
3. On the Edit Account page, from the **Actions** list, select **Delete**.
If **Delete** is not available in the **Actions** list, this account cannot be deleted.
4. To make an account inactive, check the **Inactive** box.
Summary accounts are inactive by default. To automatically inactivate its children accounts, first edit the account record to clear the **Summary** box and then save the record. Second, edit the account record to clear the **Inactive** box and then save the record. Third, edit the account record to check the **Inactive** box and then save the record. All children accounts are updated to inactive status.

> **Important:**
Inactivating and activating accounts may limit access to subsidiaries for users assigned custom roles.
>

5. Click **Save**.

**To delete or make accounts inactive from the chart of accounts list:**
1. Go to *Lists > Accounting > Accounts*.
2. Check the **Show Inactives** box.
Your chart of accounts refreshes and an **Inactive** column and a **Delete** column are added.
3. For the accounts you want to delete or make inactive, check the boxes in the appropriate columns.
Accounts that have the word **No** in the **Delete** column cannot be deleted from your chart of accounts.
4. Click **Submit**.

**Important:**

If you receive a warning that an account cannot be deleted because it is associated to a child entity or transaction, you must delete all transactions associated with the account before you can delete the account. You can do a transaction search filtered by the account to review the associated transactions. If you cannot delete these transactions, you can mark the account inactive.

# Deleting Employee Records

You can delete an employee record, but normally only in an unusual situation, such as creating the employee record in error. If an employee record has any transactions associated with it, it cannot be deleted.

If an employee is no longer actively working for your company, you should inactivate the employee record instead. For more information, see [Inactivating Employee Records](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_1504014571.html) and [Employee Termination](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_3753809772.html).

**To delete an employee record:**
1. Go to *Lists > Employees > Employees*.
2. On the Employees list, click **Edit** next to the name of the employee record you want to delete.
3. On the **Actions** menu, click **Delete**.
4. When prompted to confirm, click **OK**.
5. If the employee record has dependent records, the employee record cannot be deleted and a NetSuite notice page will appear. Here, you can either click **Go Back** or click the hyperlink to view the dependent records. To delete the employee record, each dependent record must be deleted first.

More information

[https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N1444958.html#Deleting-Accounts-and-Making-Accounts-Inactive](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N1444958.html#Deleting-Accounts-and-Making-Accounts-Inactive)

---

### Currency Mapping

Checked the name of the Saved Search in where you need to do this mapping en DM.

Note: You can see it in Workflow in the execution of the data load rule in Process Details or in Setup navigate into Import Format

For this example I will use the Saved Search:
PBCS (Data) Balance Sheet Setup

Login into NetSuite and paste the name of the SS into Search

Click on Edit this Search

Click on Results and scroll down until you find Currency dimension in the column "CUSTOM LABEL"

There change the "FORMULA" according to your needs. OK.

Save.

---

### Create and Deploy SuiteScript

SuiteScript is a JavaScript-based API framework used to customize and automate business processes within NetSuite. The video walks through the process of writing and deploying a basic SuiteScript, explaining its uses for creating workflows, automating tasks, and building custom logic. The video is helpful for beginners looking to understand the essentials of NetSuite scripting and offers practical examples to get started.

# Create a SuiteScript

Shows all available scripts

Create a new script

Click the Plus icon

Open your script and click save

Click a scrip record

Enter a name and save

# Deploy Script

Before an entry point script will run in your NetSuite account, it must be deployed. You can deploy a script when you create a script record, or you can deploy it later. The deployment settings available vary depending on the script type and on how you deploy the script.

When you deploy a script, NetSuite creates a script deployment record. Script deployment records are listed at *Customization > Scripting > Script Deployments*. Deployments are also listed on the Deployments subtab of the script record.

Multiple deployments can be created for the same script record. When multiple deployments exist, they are executed in the order in which they are listed on the Deployments subtab. This sequence typically corresponds with the order in which the deployments were created.

Click under deployments and Deploy Script

Enter the Script name, to which types of record should this script, change status to Prod and  apply

---

## NSPB Admin Guide

### Purpose & Audience

This guide provides step-by-step instructions for administering a NetSuite Planning and Budgeting (NSPB) environment, including configuration, data management, user access, and troubleshooting. Audience: System Administrators responsible for maintaining the NSPB environment.

### Core Admin Responsibilities

#### Environment Management

- **Accessing the Environment**: Navigate to `https://login.oracle.com` → Select NSPB application. Maintain bookmarks for Production and Test environments.
- **Version Control**: Keep documentation of structure and business rule changes. Test changes in Sandbox/Test before Production.
- **Monthly Maintenance Tasks**: Update current forecast months and versions. Check scheduled jobs and confirm they ran successfully.

#### User and Role Management

- **Add a New User**:
  1. In My Services → Users and Roles → Create user.
  2. Assign roles:
     - **Service Administrator** – full admin rights.
     - **Power User** – model maintenance without admin settings.
     - **User** – input and run reports.
- **Disable a User**: Remove roles and mark account as inactive.
- **Best Practices**: Grant minimum necessary permissions. Maintain an updated User Access Matrix.

#### Dimension and Metadata Management

- **Common Dimensions**: Entity/Subsidiary, Account, Department, Location, Project, Currency, Scenario, Version, Time.
- **Update Metadata**:
  - Via Dimensions screen for manual changes.
  - Via Import Metadata for bulk updates (CSV or Data Management).
- **Hierarchy Rules**:
  - All parents must roll up to a valid top-level member.
  - Avoid duplicate member names.

#### Data Integration

- **Data Sources**: NetSuite GL, Saved Searches, flat files (CSV), manual entry.
- **Data Load Process**:
  1. Extract or generate source file/search.
  2. Use Data Management or Data Exchange to map and load.
  3. Validate loaded data in Smart View or web forms.
- **Tips**: Keep mapping tables clean and documented. Automate recurring loads via scheduled jobs.

#### Forms, Dashboards, and Reports

- **Web Forms**: Modify layouts, add/remove dimensions, apply validation rules.
- **Dashboards**: Configure visual KPIs and grids for executives.
- **Reports**: Build in Reports or via Smart View. Use aliases for user-friendly display.

### Maintenance & Monitoring

#### Monthly Checklist

- Update time variables (current month, forecast start).
- Check data integrations and job logs.
- Archive old versions where applicable.
- Validate security roles and clean up unused accounts.

#### Performance Optimization

- Keep forms lean: Minimize dynamic calculations in grids.
- Limit displayed members in dense dimensions.
- Archive historical data to reduce cube size.

##### Database Housekeeping & Calc Performance

When a Planning/PBCS application develops slow calculations or an oversized
Essbase database, the cause is usually **block bloat** — empty or near-empty
data blocks that still occupy space and get scanned by every calc and
aggregation. The three maintenance techniques below address this. Run them in
order, during **off-peak hours (overnight)**, and always take a snapshot
backup first — these operations rewrite the cube.

###### 1. Remove zeros from the database

Over time the Essbase database accumulates cells that hold an explicit `0`.
Those zeros still create stored blocks, inflating size and slowing calcs. The
fix is a two-step calc: first turn each `0` into `#Missing` (a value divided by
itself times itself is unchanged for real numbers but yields `#Missing` for
`0`), then drop the now-empty blocks.

```
Actual   = Actual   / Actual   * Actual;
Plan     = Plan     / Plan     * Plan;
Forecast = Forecast / Forecast * Forecast;
```

Then clear the emptied blocks:

```
CLEARBLOCK EMPTY;
```

- Scope the calc with a `FIX` on the scenarios/years you are cleaning so it does
  not touch the whole cube.
- `CLEARBLOCK EMPTY` removes only blocks where every cell is `#Missing` — it
  does not delete real data.
- Schedule overnight; it conflicts with users entering data.

###### 2. Restructure the database

Restructuring rebuilds the cube's physical storage, reclaiming the space freed
by removed zeros and by metadata changes, and defragmenting the page/index
files. It is the companion step to a zero-removal pass.

To restructure a database:

1. From the **System View**, click the **Database Properties** icon.
2. In the **Enterprise View**, expand the Planning application type, the
   application, and the plan type whose database you want to restructure.
3. Right-click the plan type and select **Restructure Database**.
4. Confirm the restructure.

Calculation Manager reports whether the database was restructured successfully.
Run it after a zero-removal/CLEARBLOCK pass, off-peak.

###### 3. Aggregate by steps (AGG by sparse dimension)

A single full-cube aggregation re-rolls every sparse dimension at once, which is
slow and memory-heavy. Aggregating **one sparse dimension at a time**, from the
most detailed rollup outward, is far faster because each `AGG` works on a
smaller fixed region. Wrap the whole thing in `FIXPARALLEL` to use multiple
threads. The pattern below aggregates Subsidiary → Class → Location → Item →
Relationship → Department, each step fixing the already-aggregated tops of the
prior dimensions:

```
FIXPARALLEL(4, &BudYr1, &CurrentVersion, Actual, Load,
  @RELATIVE("Input Currencies",0) &RptCurr1, @Relative("Income Statement",0) )

  FIX(@RELATIVE("TD",0),@RELATIVE("TR",0),@RELATIVE("TI",0),@RELATIVE("TL",0),@RELATIVE("TC",0))
    AGG("Subsidiary");
  ENDFIX

  FIX("TS",@RELATIVE("TD",0),@RELATIVE("TR",0),@RELATIVE("TI",0),@RELATIVE("TL",0))
    AGG("Class");
  ENDFIX

  FIX("TC","TS",@RELATIVE("TD",0),@RELATIVE("TR",0),@RELATIVE("TI",0))
    AGG("Location");
  ENDFIX

  FIX("TC","TS","TL",@RELATIVE("TD",0),@RELATIVE("TR",0))
    AGG("Item");
  ENDFIX

  FIX("TC","TS","TL","TI",@RELATIVE("TD",0))
    AGG("Relationship");
  ENDFIX

  FIX("TC","TS","TL","TI","TR")
    AGG("Department");
  ENDFIX

ENDFIXPARALLEL
```

- The members `TS`/`TD`/`TR`/`TI`/`TL`/`TC` are the top-of-dimension members
  (e.g. Total Subsidiary, Total Department…). Each `FIX` pins the dimensions
  already aggregated to their top while rolling up the next one.
- `FIXPARALLEL(4, …)` runs with 4 threads; tune the count to the available
  cores. The first-line `FIX` arguments scope the run to a year, version,
  scenario and account/currency slice — narrow it to what you actually need to
  aggregate.
- Order matters: aggregate from the dimension whose rollup feeds the others
  first. Adjust the dimension list and tops to match the target application.

> These are **suggested** maintenance steps to validate in a test environment
> against the specific application before scheduling in production — block
> structure, dimension order and rollup tops differ per implementation.

### Updating Alternative Hierarchies

Alternative hierarchies in NSPB allow you to create additional rollups of the same base members without altering the primary hierarchy. They are useful for reporting, analysis, and custom aggregation logic.

#### Key Concepts

- **Base Member** – A leaf-level member that stores actual data.
- **Shared Member** – A reference to a base member, used in another hierarchy without duplicating data.
- **Dynamic Calc Member** – A parent or rollup member that calculates its value at runtime instead of storing data.

#### Creating an Alternative Hierarchy

1. Navigate to Dimensions.
2. Identify the Top Member for the Alternative Hierarchy.
3. Add Shared Members.
4. Validate Structure.

#### Creating Dynamic Calc Rollups

1. Select the parent in Dimensions.
2. Set Data Storage to Dynamic Calc.
3. Keep children as Store Data members.
4. Deploy after saving.

#### Best Practices for Alternative Hierarchies

- A member can be shared in multiple places, but only one occurrence stores data.
- Keep Dynamic Calc parents at higher levels.
- Security applied to the base member also applies to shared copies.

### Updating Substitution Variables

Substitution Variables act as global placeholders for values such as current month, year, or scenario. Updating them ensures consistent references in business rules, forms, and reports.

#### Common Uses

- **Time References**: FcstStartMonth, PriorYr, CurrYear
- **Version/Scenario Control**: CurrentVersion, CurrentScenario

#### How to Update

1. Navigate to Tools → Variables.
2. Locate and edit the variable.
3. Save and validate changes.

#### Best Practices for Variables

- Update as part of a checklist.
- Document changes in an Admin Change Log.
- Test forms and rules after updating.

#### When to Update Variables

Update month and year variables AFTER a period is closed. For example, update to FY26 TP1 after January 2026 is closed. Mid January the variables should still be FY25 TP12.

If December and January are still open for updates in NetSuite, leave the variables as FY25 TP11.

#### Which Variables to Update Regularly

- `CurrentMonth`
- `LastClosedMonth` (same as CurrentMonth)
- `CurrentYr`
- `LastClosedYr` (same as CurrentYr)
- `FcstStartMonth` (the first period after the CurrentMonth)
- `FcstYr1` (usually the same as CurrentYr)
- `FcstYr2` (the first year after FcstYr1)
- `NextYr` (the first year after the CurrentYr)
- `PriorYr` (the first year before the CurrentYr)
- `PriorYr1` (the first year before the PriorYr)

The load forms use the variable `CurrentScenario`. The variable value can be updated to reflect any load Scenario (Forecast, Budget, Plan).

Both member names and aliases can be used as variable values. `CurrentMonth` can be set as `TP8` or `Aug` indistinctly.

### New Users Setup

Adding new users involves creating them in OCI and assigning the correct NSPB role or group.

#### Roles Overview

- **Service Administrator** – Full rights.
- **Power User** – Maintain metadata, load data, run rules, create reports.
- **User** – Data entry and reporting.

#### Creating a New User in OCI

1. Sign in to Oracle Cloud My Services.
2. Go to Identity & Security → Identity → Users.
3. Click Create User and enter details.
4. OCI sends activation email.

#### Assigning the Power User Role

- **Option A – Group-Based Assignment**:
  1. Go to Identity → Groups.
  2. Add the user to the Power User group.
- **Option B – Direct Role Assignment**: Assign Power User role directly in NSPB Security.

#### Validation

- Ask the user to log in.
- Verify they can access forms, reports, and run rules.
- Ensure they cannot access security settings.

### Data Reconciliation

Data reconciliation ensures that values in NSPB match both the source system (NetSuite) and the reporting rollups (e.g., FinPack hierarchy). Discrepancies may occur due to extraction issues, mapping errors, or hierarchy structure differences.

#### Reconciling NetSuite vs. NSPB Loaded Data

**Objective**: Confirm that balances loaded into NSPB match NetSuite reports.

**Steps**:

1. Run the equivalent report in NetSuite (e.g., GL Detail, Income Statement).
2. Retrieve loaded data from NSPB using Smart View or a web form.
3. Compare totals at high-level accounts (e.g., Revenue, Expense).
4. Drill down level by level (parent → child) until the specific account or department showing variance is identified.

**Resolution**:

- Review the Data Load process for failures or rejected records.
- Validate NetSuite Saved Searches used for integration (check filters, date ranges, segment coverage).
- Reload corrected data if required.

#### Reconciling NSPB Data vs. FinPack Alternative Hierarchy

**Objective**: Confirm that balances in NSPB align with the FinPack reporting hierarchy.

**Steps**:

1. Retrieve data from the standard NSPB hierarchy and the FinPack hierarchy for the same time period, scenario, and version.
2. Compare totals at the top level of the hierarchy.
3. Drill down level by level until the discrepancy is isolated.
4. Expand to the bottom-level members in both hierarchies.

**Resolution**:

- Look for missing accounts or members not included in FinPack.
- Validate that shared members are pointing to the correct base accounts.
- Update the FinPack hierarchy if legitimate accounts are missing.
- Document findings and corrective actions in the Admin Change Log.

#### Reconciliation Best Practices

- Always reconcile at least monthly after data loads.
- Keep an audit log of variances found and resolutions applied.
- Automate extracts (NetSuite vs NSPB totals) where possible to save time.

### One-off Changes

#### Currency Conversion Manual Update Example (FY25)

To fix a currency conversion problem during FY25, manual updates were made to the Actual data coming from NetSuite.

The NightProcess includes a clear script (`Clear_IS`) that wipes out all data for the current year and the prior. This script was updated to clear only the current year (FY25) and the periods between TP6 and TP12.

After January 2026 data is closed, the variables will be updated to:

- `CurrentMonth = TP1`
- `LastClosedYr = FY26`
- `PriorYr = FY25`

The clear script `Clear_IS` will need to be updated as follows:

```
%Script(name:="Housekeeping",application:="NetSuite",plantype:="Plan")
FIX(&PriorYr, "Actual", &CurrentVersion, "Load", "TP6":"TP12")
CLEARBLOCK ALL;
ENDFIX
FIX(&LastClosedYr, "Actual", &CurrentVersion, "Load", "TP1":"TP12")
CLEARBLOCK ALL;
ENDFIX
```

## NSPB Frequently Asked Questions

Real-world Q&A from training sessions. Use these as authoritative answers when users ask similar questions.

### 1. Why were inactive locations and subsidiaries appearing in the system initially, and how was this issue resolved?

The presence of inactive members in the application was identified as a missing filter logic within the NetSuite saved searches that feed data into the NSPB (NetSuite Planning and Budgeting) environment. Specifically, the queries used for the metadata synchronization did not explicitly exclude records marked as 'inactive.' To resolve this, the administrative team modified the underlying saved searches to include a filter where 'Inactive is False.' Following this logic change, the system data was reloaded, effectively resetting the structure and removing all inactive records from the location and subsidiary dimensions. This ensures that only relevant, active operational entities are visible for budgeting and forecasting, preventing data clutter and user confusion.

### 2. What led to the decision to 'take apart and reassemble' the balance sheet architecture?

The original configuration of the balance sheet was found to be highly inefficient and non-compliant with industry best practices. It relied on excessive segmentation and structural choices that made reconciliation difficult and hampered reporting accuracy. The project team undertook a comprehensive reconstruction to clean up these segments and reassemble the balance sheet using a streamlined, best-practice approach. This process involved validating the data against NetSuite actuals and scheduling automated daily loads to ensure the balance sheet remains synchronized with the latest financial data. This structural overhaul is critical for providing a stable foundation for Phase 1 forecasting.

### 3. What is an 'Alternate Hierarchy' in NSPB, and how does it support state-specific reporting like Region A's fund balance changes?

An alternate hierarchy is a secondary rollup structure within a dimension (typically the Account dimension) that allows the same data to be viewed in multiple ways without duplicating the underlying data values. For Region A, this is used to replicate the 'Change in Fund Balances' view. By utilizing 'Shared Members,' the system points to the original NetSuite GL accounts but groups them under differently named subtotals and categories. This allows the Region A team to interact with data in their familiar format while the system simultaneously maintains the standard NetSuite reporting structure. As additional states like Region B or the other regions are onboarded, they can each have their own specific alternate hierarchies to meet their unique statutory or operational reporting needs.

### 4. How are security and visibility managed across different state-specific hierarchies?

Security in NSPB is granular and can be applied at the member or hierarchy level. For example, users associated with the Region A subsidiary are granted access to the Region A alternate hierarchy (e.g., 'Change in Fund Balances'), while Region B users are restricted to their specific state rollups. This ensures that when a Region B user logs in, they only see the account groupings and context codes relevant to their region. Administrators control this visibility through security rules and group permissions, ensuring that sensitive data is protected and that the user interface remains uncluttered by irrelevant regional structures.

### 5. What is the process for maintaining hierarchies when new GL accounts are added in NetSuite?

NSPB nightly integrations automatically pull new GL accounts into the standard NetSuite hierarchy. However, those new accounts do not automatically populate alternate hierarchies because the system does not know which state-specific subtotal they belong to. An administrator must manually go into the Dimension Manager, locate the new account, and add it as a 'Shared Member' under the appropriate parent in the alternate hierarchy. This manual step is required to ensure data integrity, as a single account might be categorized differently in Region A than it is in Region C. Failure to perform this maintenance can lead to reconciliation errors where the standard hierarchy totals do not match the alternate hierarchy totals.

### 6. Can NSPB provide automated email alerts when new accounts are created in NetSuite?

NSPB does not have a native, out-of-the-box alerting system for metadata changes occurring in NetSuite. While it is possible to build a custom solution using scripts to flag changes, it is considered a best practice to manage these notifications on the NetSuite side. Since NetSuite is the 'Source of Truth' where the account is first created, an alert triggered by a NetSuite workflow or saved search email notification is more immediate and effective. This ensures that the finance team is notified the moment an account is created, prompting them to perform the necessary mapping and hierarchy updates in NSPB.

### 7. How do 'Member Set Functions' improve the efficiency of pre-built forms and reports?

Member set functions, such as 'Descendants' or 'Descendants Inclusive,' are dynamic rules used in form and report design. Instead of hard-coding a specific list of accounts into a report, a member set function tells the system to 'pull every child currently existing under this parent.' This is vital for maintenance; when a new account is added to a parent member in the hierarchy, the pre-built reports and forms automatically update to include that account upon the next refresh. This fluidity eliminates the need for administrators to update every individual report when the chart of accounts changes.

### 8. Why is the reporting process different in Smart View compared to pre-built NSPB web forms?

Smart View operates as a grid-based UI within Excel, which physically selects and places specific members on the spreadsheet. Unlike web forms, it does not always default to dynamic member set functions. To ensure a Smart View ad-hoc report captures new accounts, a user must perform a 'Zoom In' operation. Specifically, they must select a top parent member, use 'Keep Only,' and then 'Zoom In' to all levels. Because this can be cumbersome, the technical team recommends using 'Pre-built Forms' as the data source within Smart View. These forms carry the dynamic member set functions from the web, allowing the Excel grid to refresh and capture hierarchy changes automatically.

### 9. What solution was proposed to automate the maintenance of alternate hierarchies and reduce administrative overhead?

To eliminate the daily manual task of adding shared members to state-specific hierarchies, the team proposed adding 'Custom Fields' to the Account record in NetSuite. These fields would be mandatory and would require the user to select the appropriate 'NSPB Parent' for each alternate hierarchy at the moment of account creation. NSPB would then use a modified saved search to ingest these associations, automatically creating the parent-child relationships in the alternate hierarchies. This shifts the 'onus' to the accounting team in NetSuite but ensures that the reporting structures in NSPB are always 100% synchronized without manual intervention from the NSPB admin.

### 10. How do User Preferences impact date formatting within NSPB schedules?

NSPB stores dates as numeric values to allow for calculations, but the display format is controlled by individual user preferences. If a user is unable to input a four-digit year (e.g., 2026 vs. 26), they must navigate to the 'User Preferences' menu from the home screen, select the 'Display' tab, and adjust the 'Date Format' dropdown to 'MM/DD/YYYY.' It is important to note that these settings are specific to the individual user profile; changing it for one user does not change it for the entire organization. Users are also cautioned against having multiple browser tabs open with different settings, as this can cause 'cookie' conflicts and input errors.

### 11. What is the procedure for adjusting decimal precision on data entry forms?

Decimal precision is managed at the form level by an administrator. To change the number of decimal places visible (e.g., from whole numbers to two decimals for currency), an admin must open the form in 'Edit' mode, navigate to 'Other Options,' and set the 'Minimum' and 'Maximum' decimal values. For currency, a maximum of 2 is standard for exact tie-outs. This setting can be customized per form, meaning a high-level summary report might be set to 0 decimals for readability, while a detailed debt schedule form is set to 2 for precision.

### 12. Why are individual dates not aggregated at the 'Total Location' or 'Total Subsidiary' levels?

Logistically and mathematically, dates cannot be aggregated through summation. In a multi-dimensional system like NSPB, an aggregation rule for a numeric field (like revenue) adds the values of all children together. For a date field, summing January 1st and January 2nd would result in a nonsensical numeric value. Therefore, date columns are configured to show data only at the 'Level 0' (bottom level) members. At the total level, these fields will typically appear blank or zero to prevent the display of misleading aggregated numeric strings.

### 13. How should 'Stale Data' or duplication issues in the budget be addressed?

Duplicate entries (such as food service expenses appearing in both General and Special Revenue funds) often stem from 'Fully Qualified Member' errors in the upload file—where a string like 'Fund: Food Service' is misread as two different entities. The standard remediation process is for the administrator to 'Clear' the specific budget scenario and reload a corrected file with clean naming conventions. This ensures that any data points left over from previous incorrect iterations are purged, providing a clean tie-out between the NSPB system and the offline Excel models.

### 14. What was the significance of the sign reversal for 'Proceeds' in the budget review forms?

In financial reporting, 'Proceeds' are considered other sources of income. If they are loaded as negative values in the budget file, but the system's aggregation rule is set to subtract them from excess revenue, it results in a 'double negative' that incorrectly increases the bottom line. To fix this, the admin must either reverse the sign in the source data or adjust the member's 'Aggregation Property' within the dimension (e.g., changing from + to -) so that the mathematical impact on the Net Income calculation aligns with standard accounting principles.

### 15. What is the definition of 'Phase 1 Go Live' for the Region A team?

Phase 1 Go Live (targeted for the agreed date) focuses on the core functionality of NSPB as a primary forecasting tool. This includes the activation of the Revenue, OPEX, and Workforce modules. At this stage, the team should be able to generate basic Income Statement and Balance Sheet reports based on actuals and loaded budget data. It is essentially the 'foundation' phase that enables the FP&A team to move away from manual Excel modeling and begin utilizing the automated system for their monthly forecasting cycles.

### 16. What are the common causes of 'Wage Calculation' gaps in the Workforce module?

When wages appear for some employees but not others (e.g., only regular program employees), the issue is usually related to the 'Fund and Grant GL' assignment in the roster. NSPB workforce rules are often scripted to only calculate wages if a valid Fund and Grant are selected, as these are required segments for the data push to the General Ledger. If these fields are left as 'Undefined,' the calculation logic may skip those rows. To resolve this, users must ensure that every employee in the roster has a complete set of dimensional assignments (Salary GL, Fund GL, Grant GL) before running the workforce calculation rules.

### 17. How does the 'Workforce Push' rule differ from a standard data save?

Clicking 'Save' on a workforce form might calculate the local values for that specific form, but it does not automatically move those numbers into the Income Statement. The 'Workforce Push' is a specific administrative business rule that aggregates the detailed roster data (by employee) and pushes the summarized totals to the planning cube's GL accounts. This separation allows users to 'play' with different staffing scenarios in the workforce module without impacting the official forecast until the data is finalized and 'pushed' by an authorized user.

### 18. What is the purpose of the 'Actuals Staging' table in NSPB?

The Actuals Staging table serves as an intermediate repository for data pulled from NetSuite before it is formally 'seeded' into the forecast scenarios. It allows administrators to validate that the integration ran correctly and that all account/location segments are properly mapped. If a user sees that their forecast is missing actuals for a closed month (e.g., February), an admin must 're-seed' the data from the staging table to the forecast scenario to ensure the 'blended' view (actuals for past months + forecast for future months) is accurate.

### 19. Why is it important to define a 'Source Year' and 'Target Year' when copying scenarios?

NSPB allows for multi-year planning. When an analyst wants to build a budget for FY27 based on their FY26 forecast, the 'Copy Scenario' rule requires clear definitions to prevent overwriting existing data. The 'Source' is the existing data set (FY26 Forecast), and the 'Target' is where the data is going (FY27 Budget). This rule typically copies data at the 'Total Subsidiary' level to ensure consistency, but it must be run with precision to avoid 'Stale Data' being carried forward into the wrong fiscal period.

### 20. How can users verify if a specific GL account was excluded from the workforce push?

Users can cross-reference the 'Staffing Summary' form against the 'OPEX Trending' form. If an account like 'Wages - PTO Accrual' appears in OPEX but shows zero FTE/Headcount in the Staffing Summary, it indicates that the account is being planned as a general expense rather than a roster-driven employee cost. This is often intentional for accruals or contract labor that doesn't follow standard FTE logic. If an account *should* be roster-driven but isn't, the admin must update the 'Data Push Mapping' to include that specific GL account.

### 21. What are the limitations of the 'Scenario Analysis' form regarding data density?

The Scenario Analysis form is designed to show multiple versions of data (Actual, Budget, Forecast) side-by-side for comparison. Because this involves pulling data from multiple 'slices' of the database simultaneously, the form can be slow to load—often taking 15 to 20 seconds. To improve performance, users are encouraged to use the 'Point of View' (POV) filters to limit the data to a single subsidiary or location, rather than attempting to view the entire organization at once.

### 22. How are 'Substitution Variables' used to manage time-based reporting?

Substitution variables are global placeholders (e.g., &CurrentMonth or &ForecastYear1) that act as 'switches' for the entire system. Instead of updating 50 different reports when a month closes, the admin updates the variable '&CurrentMonth' from 'Jan' to 'Feb.' Every form, report, and business rule that references that variable automatically shifts its focus to the new month. This ensures organizational alignment—all users are looking at the same 'Current Month' and 'Forecast Start' periods simultaneously.

### 23. What is the difference between 'Stored' data and 'Dynamic Calc' in the metadata settings?

Members tagged as 'Stored' physically hold data values in the database (e.g., a specific GL account where $100 is loaded). 'Dynamic Calc' members do not store data; instead, they calculate their value on-the-fly whenever a report is opened (e.g., 'Total Expenses' which sums all expense accounts). While Dynamic Calc saves storage space and ensures totals are always up-to-date, having too many complex dynamic calculations can slow down report performance.

### 24. How are 'Alias Tables' utilized for multi-state reporting in a single NSPB environment?

Alias tables allow the system to display different names for the same member. The system can have a 'Default' alias table (standard GL names) and a 'Region A' alias table (context codes). When the Region A team views an Income Statement, the system is set to display the Region A Alias Table, showing their specific object codes. When a corporate user views the same data, they can switch to the Default table to see the standard NetSuite account names. This allows for localized reporting without altering the core chart of accounts.

### 25. What is the role of 'EPM Automate' in system backup and recovery?

EPM Automate is a command-line utility used to automate administrative tasks, including the daily 'Artifact Snapshot.' This snapshot is a full backup of the system's metadata and data. The system typically retains these backups for 30 to 60 days. In the event of a catastrophic error (e.g., a hierarchy being deleted), an admin can use EPM Automate to 'Restore' the system to a previous day's state. This provides a critical safety net for the organization's financial data.

### 26. How can an administrator diagnose a failed nightly integration?

The primary tool for diagnosis is the 'Jobs' console. A red flag indicates a failure. Clicking on the failed job allows the admin to view the 'Process Details' and the 'Log File.' Common errors include 'Invalid Login Attempt' (expired tokens) or 'Member Not Found' (a new location was added in NetSuite but not yet synced to NSPB). The admin should first try to run the integration manually to rule out temporary cloud connection issues before diving into script remediation.

### 27. Why should users avoid 'Informal' data entry during the UAT (User Acceptance Testing) phase?

During UAT, users often 'play' with the system to test logic, which creates 'erroneous' data points across various scenarios. Before the official Go-Live, it is a best practice for administrators to 'Wipe' or 'Clear' the forecast scenarios (except for the validated FY26 Budget) to provide a clean slate. This prevents 'stale' test data from being accidentally included in official board presentations or management reports.

### 28. What is the 'Two-Stage' process for adding new users to the NSPB environment?

Adding a user requires actions in the OCI (Oracle Cloud Infrastructure) and the NSPB application. First, the user is created in the Identity Domain, and an email invitation is sent for them to set a password. Second, after the user has logged in at least once, the administrator must assign them specific 'Roles' (e.g., Service Administrator, Power User, or User) within the NSPB application settings. Access to data is then further refined through security groups within the planning dimensions.

### 29. How does 'Signage' logic differ between NetSuite and NSPB reporting?

NetSuite often stores expense and revenue values with standard debit/credit signs (e.g., expenses as positive, revenues as negative in some tables). For presentation in NSPB reports, 'Sign Flip' rules are applied to the parent members in the hierarchy. This allows the system to display expenses as positive numbers in an expense report for readability, while still maintaining the correct mathematical integrity (subtracting them from revenue) in the 'Net Income' calculation.

### 30. What should be done if a specific account (e.g., '710 Land Lease CAPEX') is missing from a report?

A missing account is usually a 'Sync' or 'Mapping' issue. First, verify if the account exists in NetSuite 2.0 and if it was created *after* the last nightly sync. If it is a new account, manually run the 'Metadata Integration' to bring it into NSPB. Second, check the 'Alternate Hierarchy' to ensure the account has been added as a shared member. If the account is in the hierarchy but still missing from the report, ensure that data has actually been posted to that account in NetSuite for the period being viewed; NSPB reports often suppress 'Zero' or 'Missing' rows by default.

