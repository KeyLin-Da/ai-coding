-- Existing Runner payloads used ISO-8601 UTC timestamps while Center previously
-- discarded the offset when binding them to LocalDateTime. Convert those stored
-- UTC wall-clock values to the Asia/Shanghai wall-clock values used by DATETIME.
UPDATE ad_run_token_usage
SET occurred_at = DATE_ADD(occurred_at, INTERVAL 8 HOUR);
