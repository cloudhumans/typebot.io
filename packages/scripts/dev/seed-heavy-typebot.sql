\timing on

CREATE OR REPLACE FUNCTION seed_heavy_typebot(tb text, n_results int, answers_per_result int)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "Typebot" (id, name, "workspaceId", version, groups, edges, variables, theme, settings, events)
  VALUES (tb, 'Heavy ' || tb, 'claudia-workspace-id', '6', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, '[]'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  IF EXISTS (SELECT 1 FROM "Result" WHERE "typebotId" = tb) THEN
    RETURN;
  END IF;

  INSERT INTO "Result" (id, "typebotId", variables, "isCompleted", "hasStarted", "createdAt")
  SELECT tb || '-r' || g, tb, '[]'::jsonb, true, true, now() - (g || ' seconds')::interval
  FROM generate_series(1, n_results) g;

  INSERT INTO "AnswerV2" ("blockId", content, "resultId")
  SELECT 'blk' || (a % 10), repeat('x', 40), r.id
  FROM "Result" r CROSS JOIN generate_series(1, answers_per_result) a
  WHERE r."typebotId" = tb;

  INSERT INTO "Log" (id, "resultId", status, description)
  SELECT r.id || '-log', r.id, 'info', 'seed'
  FROM "Result" r WHERE r."typebotId" = tb;
END;
$$;

SELECT seed_heavy_typebot('heavy-ballast', 20000, 50);
SELECT seed_heavy_typebot('heavy-victim-a', 2000, 50);
SELECT seed_heavy_typebot('heavy-victim-b', 2000, 50);
SELECT seed_heavy_typebot('heavy-victim-c', 2000, 50);

ANALYZE "Result";
ANALYZE "AnswerV2";
ANALYZE "Log";

SELECT relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_stat_user_tables WHERE relname IN ('Result','AnswerV2','Log');
