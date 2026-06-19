1. Needs drag and drop - currently not functional.

2. "The document is base64-encoded in your browser and sent to the live parser." - does not need to be there/explained

3. Parse button (see parsebutton.png) - has a very AI look with the Sparkle Icon 

4. "Upload an instruction document, run it through the live parser, review the extracted fields, then create a case — no inbox required." - Unnecessary explanation

5. There needs to be a distinction between case types:

Instructions only - we only received initial instructions and are waiting for the vehicle images
Images only - Inverse of above.
Both - Images and Instructions received together
Merged - When an image case and an instructions case are matched on the app either by staff or automatically

Case types shouldn't be configurable manually, they are a natural identifier based on the current state of the case. If it meets the requirements for one / to change to one, it is automatic.

6. After adding a file, the "Choose File" doesn't disappear. Should have options and function for:

Adding additional files: .eml / .msg, images

7. For new-case-afterupload1.png and new-case-afterupload2.png:

- VRM is not case identity for instructions based. It IS an EVA payload field and is required.
- Case/PO is separate from Providers Reference. Case/PO is our reference. Generation of that will be covered in a separate review.
- Initial status -> intake status
- Work provider is not principal code. We need both fields displayed. 

8. "Write field provenance rows" - doesn't make sense to end user. Needs simplifying or removing. 

9. AI Box - Need to confirm if this is functional at present and metrics/model

10. Inspection address appearing in brackets e.g. : (295 Uttoxeter Road Stoke-On-Trent ST3 5LQ). This is as it would appear in documents, but needs normalizing. Potential to use postcode.io API for enrichment, later moving to Azure Maps

11. Vehicle Model but no make box - can enrich with DVLA/DVSA connector

12. Mileage - as per 11 can enrich with DVLA/DVSA

13. Date of loss - change to date of incident

14. Back button to dashboard - remove 

15. Required EVA fields should be:

- Vehicle Registration
- Principal
- Inspection Type (Not necessary to display in-app but required in EVA - Always desktop inspection)
- Case/PO - generation being addressed in a different doc. Format on all Case/POs is: Principal Code, 2 digit year number, 3 digit case counter (001 for first ever case, 002 for second etc etc)
- Insured Name
- Claim No (need to seperate box for "Provider's case number / our Case-PO into two boxes")
- Incident Date (blocked if future date)
- Inspect on (inspection date - default to today if not present in document instructions)
- Inspect at (inspection address)
- Images (not required to create case on system, but is required by process to complete a report)

16. Need to check if DVLA/DVSA can handle enrichment for VAT Status and add button for lookup - mileage estimate and vehicle details obtainable

17. Need a fully manual entry option where all fields can be keyed in 



