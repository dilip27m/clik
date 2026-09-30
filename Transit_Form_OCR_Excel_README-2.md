# Transit Form OCR → Excel

## 1. Project Overview

This application is designed to help automate the manual data-entry work
for **Government of Andhra Pradesh -- Department of Mines and Geology
Transit Forms**.

The current workflow is:

1.  User takes a photo of a Transit Form using a mobile phone.
2.  Application detects and processes the document.
3.  The application extracts the Transit Form fields.
4.  Extracted values are shown on a review/edit screen.
5.  User verifies or corrects the values.
6.  User clicks **Save**.
7.  The record is stored and added/exported to an Excel sheet.

### Current scope

**Only the Transit Form is included in Version 1.**

The invoice section appearing below the Transit Form is intentionally
**out of scope** for now.

------------------------------------------------------------------------

# 2. Main Goal

The application should reduce manual typing to the minimum.

### Target workflow

``` text
Take Photo
    ↓
Detect Transit Form
    ↓
Correct rotation / perspective
    ↓
Extract Transit Form fields
    ↓
Validate extracted values
    ↓
Review & Edit
    ↓
Save
    ↓
Excel Row
```

The user should NOT have to manually enter all the fields.

------------------------------------------------------------------------

# 3. Important Document Characteristics

The Transit Form has a **fixed structure/layout**.

The following things generally remain constant:

-   Field names
-   Table structure
-   Relative field positions
-   Document type
-   Government header
-   Transit Form layout

The values change for every document.

Examples of changing values:

-   Stationary No
-   Date and time
-   Vehicle No
-   Driver Name
-   Dispatch Qty
-   Permit No
-   Transit Form No

Because the layout is fixed, the extraction system should take advantage
of the document template instead of treating every image as an arbitrary
document.

------------------------------------------------------------------------

# 4. Version 1 --- Transit Form Fields

The application should extract the following fields.

  \#   Field                       Type
  ---- --------------------------- --------
  1    Stationary No               String
  2    Dispatch Date               Date
  3    Dispatch Time               Time
  4    Lessee ID                   String
  5    Lessee Name                 String
  6    Survey No                   String
  7    MDL No                      String
  8    MDL Name / Consignee Name   String
  9    MDL Business Village        String
  10   Consignee Address           String
  11   MDL Business Mandal         String
  12   MDL Business District       String
  13   Village                     String
  14   Mandal                      String
  15   District                    String
  16   GST No                      String
  17   Mineral Name                String
  18   Sale Price                  Number
  19   Permit No                   String
  20   Vehicle No                  String
  21   Transit Form No             String
  22   Dispatch Qty                Number
  23   Driver Name                 String
  24   Driver License No           String
  25   Distance (KM)               Number
  26   Required Time               String
  27   Destination                 String

> Note: The exact field naming can be adjusted during implementation,
> but the application must preserve the information represented by these
> document fields.

------------------------------------------------------------------------

# 5. Example Extracted Record

Example:

``` json
{
  "stationaryNo": "DD3112307",
  "dispatchDate": "2026-09-24",
  "dispatchTime": "18:59:00",
  "lesseeId": "1111040183",
  "lesseeName": "M/s APMDC Limited",
  "surveyNo": "72/1",
  "mdlNo": "MDL0111010974",
  "mdlNameConsigneeName": "M/S Renuka Minerals",
  "mdlBusinessVillage": "Govindampalle",
  "consigneeAddress": "Sy.No. 178 & 179/1, Door No:891/2012, Govindampalle(Village), Obulavaripalle(Mandal), Annamayya(Dst)",
  "mdlBusinessMandal": "Obulavaripalle",
  "mdlBusinessDistrict": "Annamayya",
  "village": "Mangampeta",
  "mandal": "Obulavaripalle",
  "district": "Annamayya",
  "gstNo": "37FSGPM4436K1Z9",
  "mineralName": "Grey Barytes - C and D",
  "salePrice": 1510,
  "permitNo": "PR1111040183/26-27/0214",
  "vehicleNo": "AP27UB5157",
  "transitFormNo": "83TSTA1210-9Z8",
  "dispatchQty": 17.4,
  "driverName": "J. Siva Kumar",
  "driverLicenseNo": "DLFAP00434572009",
  "distanceKm": 20,
  "requiredTime": "03:00 Hr",
  "destination": "Govindampalle"
}
```

Values above are only an example of the data structure. The application
must extract values from the actual uploaded image.

------------------------------------------------------------------------

# 6. Image Processing Requirements

Photos will not always be perfectly aligned.

The application should support:

-   Slight rotation
-   Perspective distortion
-   Different camera distances
-   Different lighting
-   Shadows
-   Mild blur
-   Document appearing at an angle
-   Background surrounding the document
-   Multiple papers being visible around the target document

### Processing pipeline

``` text
Original Photo
      ↓
Document Detection
      ↓
Crop Document
      ↓
Perspective Correction
      ↓
Rotation Correction
      ↓
Image Enhancement
      ↓
OCR / Field Extraction
```

The original image should also be retained where practical so the
extracted record can be audited later.

------------------------------------------------------------------------

# 7. Extraction Strategy

## Phase 1 --- Template-based extraction

Because the document structure is fixed, the first implementation should
NOT rely entirely on a general-purpose AI model.

Use:

-   Document detection
-   Image preprocessing
-   OCR
-   Fixed field/region mapping
-   Field-specific parsing
-   Validation rules

For example:

``` text
Vehicle No region
        ↓
OCR
        ↓
AP27UB5157
        ↓
Vehicle number validation
        ↓
Valid
```

This approach should be fast, predictable and inexpensive.

------------------------------------------------------------------------

# 8. Field Validation

Validation is important because OCR can confuse similar characters.

Examples:

``` text
O ↔ 0
I ↔ 1
S ↔ 5
B ↔ 8
```

The application should validate fields where practical.

### Vehicle Number

Vehicle numbers should be checked against an expected Indian
vehicle-number pattern.

### Date

Validate:

``` text
DD-MM-YYYY
```

or internally normalize to:

``` text
YYYY-MM-DD
```

### Dispatch Quantity

Should be numeric.

Example:

``` text
17.4
18.25
18.8
```

### Distance

Should be numeric.

Example:

``` text
20
```

### Stationary Number

The prominent Stationary No printed near the top can be compared with
the Stationary No appearing in the table.

If they disagree:

``` text
⚠️ Stationary number mismatch.
Please verify.
```

------------------------------------------------------------------------

# 9. Review Screen

Never send OCR results directly to Excel without user confirmation.

After extraction, show:

``` text
--------------------------------
       REVIEW TRANSIT FORM
--------------------------------

Stationary No
[ DD3112307              ]

Dispatch Date
[ 24-09-2026             ]

Dispatch Time
[ 06:59 PM               ]

Lessee Name
[ M/s APMDC Limited      ]

Mineral Name
[ Grey Barytes - C and D ]

Vehicle No
[ AP27UB5157             ]

Dispatch Qty
[ 17.4                   ]

Driver Name
[ J. Siva Kumar          ]

Destination
[ Govindampalle          ]

...remaining fields...

--------------------------------
[ EDIT ]
[ SAVE TO EXCEL ]
--------------------------------
```

Every extracted field should be editable before saving.

------------------------------------------------------------------------

# 10. Excel Requirements

Version 1 should maintain a single master dataset where:

**One Transit Form = One Excel Row**

Suggested columns:

``` text
Record ID
Stationary No
Dispatch Date
Dispatch Time
Lessee ID
Lessee Name
Survey No
MDL No
MDL Name / Consignee Name
MDL Business Village
Consignee Address
MDL Business Mandal
MDL Business District
Village
Mandal
District
GST No
Mineral Name
Sale Price
Permit No
Vehicle No
Transit Form No
Dispatch Qty
Driver Name
Driver License No
Distance KM
Required Time
Destination
Created At
```

Application-generated fields:

-   Record ID
-   Created At

These should NOT be extracted from the document.

------------------------------------------------------------------------

# 11. Invoice Section --- Explicitly Out of Scope

The document contains an invoice section below the Transit Form.

For Version 1:

``` text
DO NOT EXTRACT INVOICE DATA
DO NOT ADD INVOICE FIELDS
DO NOT PROCESS BANK DETAILS
DO NOT PROCESS GST AMOUNT FROM INVOICE
DO NOT PROCESS INVOICE VALUE
```

The application should focus only on the Transit Form.

The architecture should nevertheless remain extensible so invoice
extraction can be added later.

------------------------------------------------------------------------

# 12. Suggested Architecture

A practical architecture:

``` text
                 Mobile / PWA
                      │
                      ↓
               Camera / Upload
                      │
                      ↓
              Image Processing
                      │
                      ↓
                    OCR
                      │
                      ↓
             Template Extraction
                      │
                      ↓
                Validation
                      │
                      ↓
                Review Screen
                      │
                      ↓
                   Backend
                  /        \
                 /          \
                ↓            ↓
           Database        Excel
                │
                ↓
          Original Image
```

------------------------------------------------------------------------

# 13. Suggested Technology Stack

The implementation should prefer technologies that are simple to
maintain.

### Frontend

-   Next.js
-   React
-   TypeScript
-   Tailwind CSS
-   PWA support

### Backend

-   Node.js
-   Express.js
-   TypeScript

### Image Processing

Possible options:

-   OpenCV
-   Sharp

### OCR

Initial candidates:

-   Tesseract OCR
-   PaddleOCR

The OCR engine should be evaluated against the provided real-world
sample images before finalizing the implementation.

### Database

Prefer:

-   PostgreSQL

MongoDB is also acceptable if it makes implementation substantially
simpler.

### Excel

Use a reliable XLSX library such as:

-   ExcelJS

------------------------------------------------------------------------

# 14. Mobile-first UX

The primary user is expected to use the application from a phone.

The main screen should therefore be extremely simple.

``` text
┌──────────────────────────┐
│    TRANSIT RECORDS       │
│                          │
│                          │
│       📷 SCAN            │
│       DOCUMENT           │
│                          │
│                          │
│ Today's Records: 12     │
│                          │
│ [ View Records ]         │
│ [ Export Excel ]         │
└──────────────────────────┘
```

The scanning workflow should require as few taps as possible.

------------------------------------------------------------------------

# 15. Error Handling

If extraction quality is poor, do not silently save bad data.

Examples:

``` text
⚠️ Could not read Vehicle No
```

``` text
⚠️ Dispatch Quantity needs verification
```

``` text
⚠️ Stationary number mismatch
```

The user should be able to correct the field manually.

------------------------------------------------------------------------

# 16. Duplicate Detection

The application should eventually detect potential duplicate Transit
Forms.

Possible duplicate keys:

``` text
Stationary No
+
Transit Form No
```

If a record already exists:

``` text
⚠️ This Transit Form may already exist.

Stationary No: DD3112307

[ Review Existing ]
[ Save Anyway ]
```

Do not automatically reject the record without user confirmation.

------------------------------------------------------------------------

# 17. Security and Data Handling

The application may contain official business documents.

Therefore:

-   Do not expose uploaded documents publicly.
-   Authenticate users if a cloud deployment is used.
-   Protect API endpoints.
-   Store images securely.
-   Use HTTPS in production.
-   Do not log complete document contents unnecessarily.
-   Do not expose OCR data in client-side debug logs in production.

------------------------------------------------------------------------

# 18. Development Phases

## Phase 1 --- UI Prototype

Build:

-   Home screen
-   Camera/upload screen
-   Review screen
-   Records screen
-   Excel export button

Use mock extracted data initially.

------------------------------------------------------------------------

## Phase 2 --- Image Processing

Implement:

-   Document detection
-   Crop
-   Perspective correction
-   Rotation correction
-   Image enhancement

Test using the supplied real-world photos.

------------------------------------------------------------------------

## Phase 3 --- OCR

Implement OCR and test:

-   Stationary No
-   Date/time
-   Vehicle No
-   Dispatch Qty
-   Driver Name
-   Permit No
-   Transit Form No
-   Remaining fields

Measure extraction accuracy using real documents.

------------------------------------------------------------------------

## Phase 4 --- Field Parsing + Validation

Implement:

-   Field mapping
-   Date parsing
-   Numeric parsing
-   Vehicle-number validation
-   Stationary-number cross-check
-   Required-field validation
-   Confidence/uncertainty indicators

------------------------------------------------------------------------

## Phase 5 --- Review + Save

Implement:

``` text
Photo
 ↓
Extraction
 ↓
Review
 ↓
Edit
 ↓
Save
```

------------------------------------------------------------------------

## Phase 6 --- Database + Excel

Implement:

-   Database storage
-   Excel export
-   Excel row generation
-   Search
-   Record history

------------------------------------------------------------------------

# 19. Future AI Plan

AI should be treated as a **future enhancement**, not a requirement for
the first working version.

The initial system should establish a reliable baseline using:

``` text
Image Processing
+
OCR
+
Fixed Template
+
Validation
```

Once enough real documents have been processed, AI can be introduced
where it provides a clear benefit.

### Possible future AI capabilities

#### 1. AI-assisted field extraction

Instead of relying only on fixed coordinates:

``` text
Photo
 ↓
OCR / Vision
 ↓
AI identifies:
"this text is Vehicle No"
"this text is Dispatch Qty"
...
```

This could make the system more tolerant of layout changes.

------------------------------------------------------------------------

#### 2. AI correction of OCR errors

Example:

``` text
OCR:
AP27U85157

AI:
Likely vehicle number:
AP27UB5157
```

The application should show this as a suggestion, not silently change
the value.

------------------------------------------------------------------------

#### 3. Confidence-based review

Example:

``` text
Vehicle No       98% confidence ✓
Dispatch Qty     97% confidence ✓
Driver Name      72% confidence ⚠️
Permit No        95% confidence ✓
```

Only questionable fields need attention.

------------------------------------------------------------------------

#### 4. Document classification

In the future, if multiple document types are introduced:

``` text
Photo
 ↓
AI Document Classifier
 ├── Transit Form
 ├── Invoice
 ├── Other
 └── Unknown
```

For now, only Transit Forms are supported.

------------------------------------------------------------------------

#### 5. Natural-language querying

Future dashboard:

``` text
"Show all vehicles that carried more than 18 MT this month."

"How many transit forms were generated today?"

"Show records for AP39TC2469."

"What's the total dispatch quantity this week?"
```

AI could translate these requests into database queries.

------------------------------------------------------------------------

#### 6. Anomaly detection

AI could eventually identify unusual records such as:

-   Unusually high dispatch quantity
-   Unexpected vehicle patterns
-   Duplicate-looking documents
-   Inconsistent fields
-   Unusual changes in recurring data

These should always be presented as **alerts for human review**, not
automatically treated as errors.

------------------------------------------------------------------------

# 20. Important AI Principle

AI should **assist the user, not silently modify official records**.

For example:

``` text
OCR:
AP27U85157

AI suggestion:
AP27UB5157

             ↓

User confirms

             ↓

Excel:
AP27UB5157
```

This is especially important because these records may have official or
financial significance.

------------------------------------------------------------------------

# 21. Future Features

Potential future additions:

-   Invoice extraction
-   Multiple document types
-   Search and filtering
-   Dashboard
-   Daily/monthly reports
-   Excel automatic synchronization
-   PDF export
-   Cloud backup
-   User accounts
-   Multiple users
-   WhatsApp/share integration
-   AI-assisted extraction
-   AI anomaly detection
-   Offline scanning with later synchronization

These should NOT complicate Version 1.

------------------------------------------------------------------------

# 22. Definition of Done --- Version 1

Version 1 is successful when:

-   User can take a photo of a Transit Form.
-   The application can detect/process the document.
-   Transit Form fields are extracted.
-   Extracted data is shown to the user.
-   User can edit incorrect values.
-   User can save the record.
-   One saved Transit Form creates one Excel row.
-   Invoice data is ignored.
-   Original document can be associated with the record.
-   Basic validation prevents obvious OCR mistakes.
-   The workflow is comfortable to use on a mobile phone.

## Core principle

> **Photo → Extract → Verify → Save → Excel**

Keep Version 1 simple, reliable and easy for the end user.
