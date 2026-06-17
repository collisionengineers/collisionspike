# WhatsApp intake is manual (Business app); bulk media OCR→VRM matching as a timesaver

Collision Engineers use the **WhatsApp Business app** (not the Platform/Cloud API), so there is no
programmatic inbound webhook: WhatsApp-sourced images/instructions are **manually attached** to Cases
by staff, and the Image Source records the group/contact for tracking. As a timesaver, a **bulk
import** path is planned: staff export WhatsApp chats, drop the media into a folder, and a batch
process runs **OCR/vision** over each image to read the registration and **auto-match it to the open
Case by VRM** (ADR-0002), attaching or suggesting matches. This reuses the M1 OCR registration check
and the VRM correlation. (Outbound WhatsApp is likewise draft-only — ADR-0003.)
