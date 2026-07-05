-- Perluas dokumentasi config virtual_views: layoutType + layoutOptions (Fase 3).
-- Backward compatible — field disimpan di JSONB config, tanpa kolom baru.

comment on column core_pm.virtual_views.config is
  'JSON: { filters, sorts, groupBy, visibleColumns, columnWidths, layoutType?: "grid"|"kanban"|"calendar"|..., layoutOptions?: { statusColumn?, dateColumn? } }';
