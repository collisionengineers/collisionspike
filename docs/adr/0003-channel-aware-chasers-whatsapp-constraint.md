# Chasers are channel-aware; WhatsApp outbound is draft-only (WhatsApp Business constraint)

Chasing a Case's Missing items is **assisted and tracked**, but constrained by channel. Collision
Engineers use **WhatsApp Business only** and will not change this, so the tool cannot freely
auto-send WhatsApp messages: for WhatsApp Image Sources a chaser is **drafted for the staff member
to send manually** in WhatsApp (the tool prepares the message, shows the contact/group, and logs the
chase). Email chasers may be drafted and (later) sent via the Outlook connector; Audatex sources are
await-only. In every channel, staff can also add free-text **Notes** to a Case, which stay
first-class alongside structured chaser tracking. This constraint is invisible in code but shapes the
whole outbound design, so it is recorded here.
