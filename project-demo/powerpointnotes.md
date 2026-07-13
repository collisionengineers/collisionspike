Slide 1



Overview of the project. It's an automated system that tries to remove as much of the manual work as possible. E-mails come in, are automatically categorized, the data is extracted from the attachments (using a concept reworked and built on top of Matty's document mapper, now running automatically on a cloud server, rather than being an app you drag files into). 



>Show dashboard. 



This just shows basic stats and an overview of the work that's waiting, and what's been sent (common question in the office is "how many did we send over today?" from admin staff.



Slide 2 

Inbox view



Unified view of all three inboxes, with options to filter by inbox and e-mail type, as well as a search feature.



When an e-mail comes in, a webhook sends a notification to a Function hosted on Azure, called the orchestrator. This runs a number of different tools and checks:

1. It starts by obtaining a copy of the e-mail itself

2\. It then attempts to provide match, based on the email address and any attachment

3\. Then, the e-mail is classified by type, e.g. receiving work instructions (existing provider), receiving work (new enquiry), case update, case query, job cancellation, payment, and other types. 





4\. For existing providers, when the e-mail is instructions, it automatically creates a case on the system for them. Unlike the currrent process, the Case/PO number is minted at the intial intake. This is because prior to actually getting all the images, we have no internal identifier for cases, which makes organizing things a lot harder. The e-mail, and any attachments, are also stored on box at this time, under the Case/PO. 



At this point, it also checks for any "Image only" type cases active, with a registration matching the instructions. If one is located, it will merge this "Image only" case into the instructions Case/PO, if discovered. 



Where the e-mail just contains images, firstly, the orchestrator will extract the registration from the e-mail content/attachment if possible. 



If not, the registration can be read with OCR/VLM on the image. The orchestrator firstly checks for any active cases matching the reg. If none are found, it creates an "images only" case, with no work provider assigned. This is identified only by vehicle registration.

These two processes encircle eachother, ensuring that no cases end up getting orphaned if there is a direct match.


There are also a few other methods around getting the images linked to the cases automatically:

1. Firstly, I have created a connector to use Claude for this purpoie. The intention would be to use cowork, which allows setting up automations, to check the network drive where images are currently stored. They are usually in folders labelled with the registration, but even if not, Claude can just read the registration.



2\. I created a simple AI assistant in the app (top right button), where the user can just attach images and say "store these" and it will read the reg, and either find the case, or create a new images only case.



3\. A more advanced version of the chaser copy+paste message on the jobsheet. When the user presses a button, it automatically creates a fileshare link for the cases box folder, and copies a chase template asking the client to send the images and upload them to that link. I've set up a box webhook that automatically updates the case on the app when images are uploaded, so when this happens, it's updated immediately.



4\. They can also just be uploaded manually to the app, and attached to a case, if the user wants to.



5\. I have a few more ideas on ways to make this easier, and obviously there's integrating either Tractable or Raven. When a client uses Tractable and uploads the images, it e-mails us the PDF as well as updating our portal. I've already mapped Tractables e-mail style, so when we receive e-mails from Tractable, the images are all extracted immediately and added to a case.





Additionally, any e-mails sent that are related to the case are attached to the case as well. This also includes e-mails that are classed as "Pre-Instruction", such as Triage, or "when the instructions come in on this one, do xyz" style e-mails. The user should be able to see every e-mail that's been sent about the case. The e-mails are linked by matching details such as the registration, the client name, and the providers reference number. If the e-mails are also part of a chain related to that case, this is also identified, even if the e-mail doesn't contain any specific identifiable details.



I also have set up a notification for all our sent e-mails on cases, which means these also get logged and are viewable. 



This does not just cover the case up to EVA submission, however. It also tracks to see if/when the report is sent afterwards, and links this to the case as well. This means if the client has a query later, it can be identified that it's for an already completed case.



Since this is a new system, I also set up another function to "retroactively" create cases, by examining outlook and Box. This means if a provider e-mails with a query about a job from 4 months ago, this job will actually appear on the app, because the system will reconstruct the case with any available informatiopn.


Notably, nothing is actually stored on the app, and it's all deeplinks to Box.



The system is also backed by a database of:

All work providers, with their e-mail domains linked, as well as any intermediaries/CMCs and repairers they use, as well as any provider specific processes. For example, any providers that are always set as an image based assessment always have this prefilled. 


All inspection addresses used within the last 2 years, more than a handful of times, are also stored on the database. Whilst its still being sharpened I've created a function to help predict the inspection address and provide suggestions. 

All of the e-mail classifications, document extraction, and inspection address helping, is done deterministically intially, meaning zero AI usage. For situations where it is unclear and it falls below a certain confidence level, it falls back to using an AI to assist and provide suggestion.


Each case has a notes section where anyone can add a note to the case.


Additional helpers:

Vision Model helps to take some of the manual work away in a few areas. Firstly, it will flag any vehicle images that show a reflection. Secondly, it will identify images that are a good overview with a registration, as well as highlighting images that show the damage. 



If the instructions don't provide a mileage, but the images provide an odometer, the vision model will attempt to read the mileage from this. To ensure this isn't misread, a DVSA lookup is also made and the mileage is estimated. If the vision models read isn't off (e.g. the first number being misread), the system prefers the vision models reading of the odometer over the DVLA/DVSA lookup, however this would still be reviewed by a person.



If there is no odometer and nothing in the instructions that can indicate mileage, the DVSA lookup is still the third fallback and is used. 



