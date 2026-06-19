# Manual Creation Blockers

Vehicle Reg
Principal

These fields block manual creation in EVA. No other fields block *manual* creation. 

# API Creation Requirements

These fields are all required for a succesful API call. API Call will fail without all of these, in a valid format. They are included in the API schema format and with an explanation where needed.

RequestFrom (Principal)
ExternalRef (this is case/po, so actually not external, its our internal ref)
VehReg 
ClmNo - Claim Number
InsName - Name of the Insurer/Claimant
InspType - We always use Vehicle Damage Inspection
InUse - Whether vehicle is in use. Yes, No, or Not Known
Clm Addr - Claimant Address
CoverType: Possibly prefilling with TBA every time 
InstEmail - e-mail address to send instruction


# Collision Engineers Process Requirements

Provider Name / Principal
VRM (VehReg)
Model
Claimant Name
Their Ref (ClmNo)
Incident Date
Instruction Date (when instructions were received)
Inspection Date (defaults to current date if not specified in document)
Inspection Address (EVA Requirement/Formatting - 6 lines)
Accident Circumstances
VAT Status (EVA API has: Yes, No, n%) - need to test n% and see outcome
Mileage (preferably from docs but can use online estimate - will look to replace online estimate with DVSA enrichment currently hosted on Azure in cases where not present in docs)
Mileage Unit

Required files:
Vehicle Photos (requirements specified in docs)
Valuation Evidence (usually pdf called companion report - need to investigate automation possibilities on this)
Instructions
Copy of e-mail (if e-mail was intake method)


# Follow up

May be able to ask Minotaur (EVA Devs) to relax API required fields where it would cause issues. We don't currently need/use:

Cover Type
InstEmail
InUse
