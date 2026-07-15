principalandrepairersheets folder for task scope.

# Overview

This folder contains a LARGE amount of data for constructing our provider corpus, and address matching service. These are all exports from EVA searches, and from the job sheet that Collision Engineers uses.


# Spreadsheet explanations

fulllist.xlsx - essentially looks like a near-complete list of all our EVA cases. Based on the search setting I used on EVA, I believe that the loc field in THIS spreadsheet is not authoritative. 

everyrepairloc.xlsx - This spreadsheet is an export of 22000+ eva cases. Any entry where the Loc column either contains a postcode / beginning of a postcode categorically DOES have an inspection location listed. Some of these have full postcodes, some don't. 

providers.xslx - from the job sheets providers section.

garagesJOBSHEET.xslx - from the job sheets garages section

All other spreadsheets: 
These are all exports of "principals" from EVA. Important note: not all principles are real "principles". There are many Red Herrings in this data. For example, the engineers at collision engineers all have principle codes. There may also be providers that don't use us.


# Tasks

First, create a subfolder called outputs. Within that, there should be subfolders for each task below:


1. Check garagesJOBSHEET and REPAIRER.xls - check if there is any overlap here.

- Create a list of matches between those two spreadsheets.

- Create a list of potential / unclear matches.

- Create a list of no matches.

2. Check providersJOBSHEET and the legal, and contacts_eva_combined.csv

Create a list of matches between those two spreadsheets.

Create a list of potential / unclear matches.

Create a list of no matches.

3. Create seperate lists of principals that have not used us within the last:

12 months
24 months
36 months
48 months

4. Compare the postcodes on Loc for everyrepairloc.xlsx ONLY. (NOT the fulllist.xslx) with the REPAIRER.xslx spreadsheet

Produce lists showing:

- Exact matches and count of matches
- A seperate list with potential matches (where we only have a part postcode under the loc field)
- Seperate lists of repairers that have not appeared in the last:

12 months
24 months
36 months
48 months

5. For each principal code produce the following:

- A list of confirmed FULL postcodes that have appeared more than once, along with an exact count of how many times that postcode appeared. 

- A list of confirmed FULL postcodes that have appeared once.

- A list of partial postcodes, and the count of how many times that postcode appeared.


6. Create a subfolder of outputs called claudeschoice. Here, you will crossreference data in any way you think is useful, that was not covered.

7. Create a subfolder of outputs called reports. Here, you will draw conclusions about the data, suggest follow ups, and how the data can be applied to our ongoing task in Dataverse.

