// ============================================================
// SUPABASE SERVICE — Carga de datos + Realtime
// ============================================================

let _client = null;
let _realtimeChannel = null;

export function getSupabase() {
  if (!_client) {
    const cfg = window.ZENITH_CONFIG || {};
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      throw new Error('Falta configuración de Supabase en config.js');
    }
    _client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }
  return _client;
}

// Convierte snake_case → camelCase
function camel(s) {
  return s.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
}

// Fusiona columnas + data jsonb
function mergeRow(row, columnMap = {}) {
  if (!row) return null;
  const result = {};
  Object.keys(row).forEach(key => {
    if (key === 'data' || key === 'created_at' || key === 'updated_at') return;
    const mapped = columnMap[key] || camel(key);
    result[mapped] = row[key];
  });
  if (row.data && typeof row.data === 'object') {
    Object.assign(result, row.data);
  }
  return result;
}

// ============================================================
// CARGA PRINCIPAL
// ============================================================
export async function loadRemoteDB() {
  const sb = getSupabase();

  const [seasons, divisions, teams, players, matches, playoffs, news, config, archived] = await Promise.all([
    sb.from('seasons').select('*'),
    sb.from('divisions').select('*'),
    sb.from('teams').select('*'),
    sb.from('players').select('*'),
    sb.from('matches').select('*'),
    sb.from('playoffs').select('*'),
    sb.from('news').select('*'),
    sb.from('config').select('*').maybeSingle(),
    sb.from('archived_seasons').select('*')
  ]);

  // Comprobar errores
  const errors = [seasons, divisions, teams, players, matches, playoffs, news, config, archived]
    .map(r => r.error)
    .filter(Boolean);
  if (errors.length) {
    throw new Error('Error Supabase: ' + errors[0].message);
  }

  const db = {
    meta: { version: 3, updatedAt: new Date().toISOString() },
    seasons: (seasons.data || []).map(r => mergeRow(r)),
    divisions: (divisions.data || []).map(r => mergeRow(r)),
    teams: (teams.data || []).map(r => mergeRow(r)),
    players: (players.data || []).map(r => mergeRow(r)),
    matches: (matches.data || []).map(r => mergeRow(r)),
    playoffs: (playoffs.data || []).map(r => mergeRow(r)),
    news: (news.data || []).map(r => mergeRow(r)),
    archivedSeasons: (archived.data || []).map(r => mergeRow(r, { archived_at: 'archivedAt' })),
    config: config?.data?.data || {},
    widgets: (config?.data?.data?.widgets) || null,
    awards: [],
    history: [],
    transferLog: config?.data?.data?.transferLog || [],
    transferQueue: [],
    trophyHistory: [],
    trophies: config?.data?.data?.trophies || {},
    transferBannerBg: config?.data?.data?.transferBannerBg || '',
    viewSeasonId: null
  };

  return db;
}

// ============================================================
// REALTIME
// ============================================================
export function subscribeToChanges(onChange) {
  const sb = getSupabase();
  if (_realtimeChannel) sb.removeChannel(_realtimeChannel);

  let timer = null;
  const trigger = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => onChange(), 400);
  };

  _realtimeChannel = sb.channel('zenith-viewer-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'seasons' }, trigger)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'divisions' }, trigger)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, trigger)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, trigger)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, trigger)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'playoffs' }, trigger)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'news' }, trigger)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'config' }, trigger)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'archived_seasons' }, trigger)
    .subscribe((status) => {
      console.log('[SUPABASE] Realtime status:', status);
    });

  return _realtimeChannel;
}