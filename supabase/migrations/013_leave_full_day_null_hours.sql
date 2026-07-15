-- Existing leave was always full-day (trimmed overlapping assignments).
-- Null hours_per_day = full day; numeric hours = partial day (no wipe).
UPDATE leave_days
SET hours_per_day = NULL
WHERE hours_per_day IS NOT NULL;
