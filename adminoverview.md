**Collision Engineers Admin Overview**



Collision Engineers use a multitude of systems for their process. Currently, this involves the following:



**Systems:**

1. EVA - This is used to store their cases initially. It is also used for document generation such as Engineers Reports.
2. Box - Used to store files once a case is ready for EVA
3. Audatex - Unclear on the full purpose of this. Treat this as deferred for now. Seems a secondary / more expensive system with API integration that a small number of providers use. To be noted and potentially superseded or integrated in the future.
4. Excel - Used to track cases prior to them being added to the EVA system



**Communication channels:**

1\. E-mail - Microsoft Outlook - Three separate inboxes (most common)

2\. WhatsApp (secondary)

3\. Received via an API through a system called Audatex (least common)



Possibilities for intake:



**First Possibility:** Receiving Base initial instruction for an assessment.

Main Intake method: 3 separate outlook e-mails. 



Two possibilities occur here:

&#x20;

Situation 1. We have received everything we need - the case is ready to be added to EVA  (currently this is via a json import with drag+drop, future automation plans to use API)

Situation 2. We do not have everything - main issue will be missing images. If images are missing, contact must be made for these, possibly through the garage. After this, it proceeds with the same process as Situation 1.



**Second Possibility**: Receiving images but not initial instruction for an assessment.



In this case, we would need initial instructions prior to proceeding. Images would be stored, with the registration of the vehicle as the identifier. Currently stored on a shared network drive, each image set goes in a folder, this folder titled by registration.



**Current Process:**



All intakes are currently logged on an excel spreadsheet. This spreadsheet contains two sections. One section contains cases not ready for EVA. This is either images received but no instruction, or instructions received but no images.



A python tool to extract data from PDFs was created. This is not 100% foolproof but for essentially all providers, this is functional. This implementation currently lives in cedocumentmapper. From a software engineering perspective, the design and implementation is very poor and requires refinement, refactoring, and improvement. Likely a ground up redesign. The original engineer created this entirely in a single, long running conversation with Claude. Git/Version control was not used.



Files required in order to add to EVA:



1. Saved copy of e-mail, likely in .eml format.

2\. Vehicle images

3\. Valuation evidence (companion report from valuation website - in downloadable pdf format)

4\. Initial instructions



**First Possibility process (Ready for EVA):**



Where all data required to proceed is available, the case is either immediately added to EVA, or is logged on the second half of the spreadsheet to be added at a later date, if time does not allow for immediate input.



The current cedocumentmapper tool is used first. This involves dragging the PDF of initial instructions into the tool. This extracts key data from the PDF file, which is then converted into json. This json file can then be dragged into EVA which will automatically create a case. From here, an admin worker will manually create a Case/PO. This is a field in EVA that combines an internal code that Collision Engineers created for a provider with a reference number.



**Case/PO:**

It uses the Princpial (an internal code for each provider) + current year in 2 digit format + current case number from that provider in 3 digit format.

For example, lets say the Provider is CarCompany (not a real provider). The Principal they decided for this is CCPY. CarCompany sends a case. it is the 50th case of this year. The format would be: CCPY26050.



**Inspection Address:**



This is a tricky area. The vehicle is being inspected by a garage or similar at a specific address, and this needs to go on EVA. Generally, the admin worker will get this somehow, but the process is not fully clear. Sometimes it may be in the e-mail or other data. Sometimes, it may be from their domain knowledge. Sometimes it simply gets put as an "Image Based Assessment" if this is unclear. Full clarity will need to be obtained for this from Collision Engineers.



**Valuation:**



EVA has integrations with several different valuation tools in order for them to obtain this.



The admin worker will also need to obtain some evidence this was done. Typically this is a Companion Report downloaded as a PDF.



**Experian:**


EVA has a built in checker with Experian to check for adverse vehicle history. This includes things such as being a previous total loss and it will populate a field in EVA showing either no adverse history, or the results it found.


**Mileage:**



If the vehicles current mileage is not included, this also needs to be obtained. This is generally done via an online estimate from MOT data.

I have created a tool already that calls the DVSA API which can obtain mileage, this could potentially be integrated into a system. This is currently an MCP server with tools to call both the DVLA VES API, and the DVSA MOT API.



**Adding Photos:**

EVA has a drag+drop facility to add the photos of the vehicles. This has a specific process that needs to be followed, as these photos are included in the report that is sent back.



Requirements are as follows:

1. The photos must not show any reflection of a person. If a person appears in the vehicle reflection, this cannot be used.

2\. The photos must be uploaded in a specific order. Firstly, 2 photos must be added. These photos show an overview of the vehicle itself, and a closeup of the main damage. After this, all other photos (INCLUDING the first two - they are uploaded twice) must be uploaded and added. This is because the first two Photos are added near the beginning of a generated report, so these are considered "preview" images. Later in the generated report, all the images are included in sequence.

3\. The vehicle overview must show the full registration of the vehicle



Addendum:

At times, rather than photos, a video is sent instead. In this instance, if sufficient images are not accompanying the video, an admin staff member would go through the video and screenshot at key moments in order to obtain necessary images.


**Information Storage:**



When all required information is added and populated to EVA, the case is saved. At this point, all the evidence must also be stored. This is currently done via a service called Box. A folder is made on box using the Case/PO number that was created when adding this case to EVA.



After this, the case is handed off to an engineer. They carry out an assessment, and the report is generated and sent back to the client.



**Second Possibility process (missing info):**

In this case, the case is not added immediately to EVA but is logged to a spreadsheet. Typically one of two reasons are the cause of this:

Scenario 1: Instructions are received, but we do not have vehicle images.



In this scenario, we must follow up to get the images. This can involve various processes depending on the situation:
 

* Messaging/Emailing the provider
* Messaging/Emailing the garage the vehicle is at
* Waiting for receipt of the images from Audatex
* The images may also be either attached with the e-mail, or within the original PDF, thus requiring extraction



This currently results in admins having to chase and make contact for these images.











