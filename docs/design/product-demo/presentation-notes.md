# Presentation notes

## 1. Overview and dashboard

The system reduces repetitive case-handling work. Incoming email is categorized, useful details are
extracted from attachments, and new work is prepared for review. The document mapper builds on Matty's
original mapper and now runs automatically.

Show the dashboard. It summarizes waiting work and completed handoffs, including the common office
question: “How many did we send today?”

## 2. Unified inbox and case creation

Show the unified view of the three monitored inboxes, with mailbox, category, and search filters.

For each new message, the system:

1. obtains the message and its attachments;
2. identifies the likely Work Provider from the document and sender evidence;
3. categorizes the work, such as instructions, case update, query, cancellation, payment, or other;
4. creates a reviewable case for recognized instructions and mints the Case/PO at intake;
5. stores the message and attachments in the case Archive folder.

Minting the Case/PO at intake gives images and later messages an internal identifier before the complete
case pack has arrived.

## 3. Image intake and linking

Instructions and image-only arrivals meet in either order. If images arrive first, the system tries to
read the registration and link them to a compatible open case. If no case exists, it creates a temporary
image-only case keyed by registration. When matching instructions arrive, staff can confirm the merge.

Images can also arrive through:

- the assistant, where a handler attaches images and asks to store them;
- an Archive upload request included in a chaser message;
- manual upload in the app;
- mapped third-party notification formats, including Tractable messages.

Related received and sent messages stay visible on the case. This includes pre-instruction messages,
later queries, and report delivery. Older work can be reconstructed from available mailbox and Archive
evidence when a later query needs it.

## 4. Directories and decision support

The system uses maintained directories of Work Providers, intermediaries, repairers, provider rules, and
reusable inspection addresses. Staff choose or edit the final inspection address; suggestions never make
the decision for them.

Deterministic rules handle classification and extraction first. When evidence is unclear, an assistant
may suggest an answer for staff review. Image analysis can flag possible reflections, identify useful
overview and damage photos, read a registration, and suggest an odometer value. Vehicle-data evidence is
used as a cross-check; a person confirms the final value.

Every case also has a shared notes timeline for handler context.
