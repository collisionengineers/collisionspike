# Operator note — canonical vehicle data and mileage estimation

There must be one clear source of truth for DVLA/DVSA integration and mileage estimation. Replace duplicated implementations with a single auditable repository/service contract.

The estimator design supplied with the request requires immutable raw MOT observations, miles/kilometres normalisation, stable vehicle identity, retest consolidation, anomaly and odometer-segment handling, exact-date interpolation, robust recent-rate forecasting, cohort assistance only for sparse histories, abstention when evidence is unreliable, and prediction intervals calibrated through chronological backtesting. It must estimate displayed mileage rather than claim unknowable true lifetime mileage after clocking, replacement, or rollover.
