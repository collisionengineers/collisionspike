# Operator note — vehicle-detail gaps

Cases should not be missing mileage, make, or model when the DVLA/DVSA lookup can resolve the registration. Determine why those fields are missing and fix it. If the registration cannot be found, show a warning on the case instead of silently leaving the fields blank.

