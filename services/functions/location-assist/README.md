# Location-assist function

Provides reviewer-invoked inspection-address suggestions through
`POST /api/location-suggest`. It never writes a case or confirms an address. The web
app calls it through the Data API.

## Contract

The request contains case clues and evidence references. The response is a ranked list
of candidates with plain source details. Candidates remain suggestions until a handler
explicitly chooses or edits one; image-based assessment remains an explicit alternative.

## Configuration

Endpoint access, optional map lookup, storage access, and telemetry are configured by
app settings and secret references. Feature availability is decided by the current API
gate, not by this function.

## Tests and deployment

Run `pytest` from this directory. Infrastructure is defined in `infra/main.bicep`;
deployment is outside PLAN-006.
