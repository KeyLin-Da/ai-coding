-- 为既有需求补齐最终交付复盘阶段。
-- 历史已完成需求标记为 SKIPPED，避免新增阶段重新打开已完成交付。
INSERT INTO ad_workflow_stage (requirement_pk, stage, status, version)
SELECT r.id,
       'RETROSPECTIVE',
       CASE
           WHEN r.current_stage = 'DONE' OR r.status = 'DONE' THEN 'SKIPPED'
           ELSE 'NOT_STARTED'
       END,
       0
FROM ad_requirement r
LEFT JOIN ad_workflow_stage s
    ON s.requirement_pk = r.id
    AND s.stage = 'RETROSPECTIVE'
    AND s.deleted = 0
WHERE r.deleted = 0
  AND s.id IS NULL;
