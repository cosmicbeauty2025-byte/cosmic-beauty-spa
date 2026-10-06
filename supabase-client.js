/* ============================================================
   Cosmic Beauty Spa — Supabase client + data helpers
   Exposes: cbsLogin, cbsRegister, cbsLogout, cbsInitSession,
   getProfile, updateProfile, getAppointments, addAppointment,
   deleteAppointment, getTodayAppointments, getAllClients,
   getReorderFlags, setReorderFlag, getUrgentReorders,
   getSkinPhotos, getMySkinPhotos, addSkinPhoto, deleteSkinPhoto, analyzeSkinPhoto,
   getTreatmentHistory, saveTreatmentRecord,
   getEstheNotes, saveEstheNotes, getAllReviews, saveReview,
   updateReview, deleteReview, getMyOrders
   ============================================================ */

(function () {
  const SUPABASE_URL = 'https://umqqouzqmknvvabdtclq.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_xePKBjrVQrCNu0Ll3mFRIQ_VoSBBWyF';

  const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window._sb = _sb;

  /* ── Session bridge → CosmicAuth (auth.js) ────────────────── */
  function _profileWithAliases(profile) {
    if (!profile) return profile;
    const p = Object.assign({}, profile);
    if (p.created_at && !p.joined_at) p.joined_at = p.created_at;
    return p;
  }

  function _bridgeSession(user, profile) {
    try {
      const session = {
        role: profile && profile.is_admin ? 'esthetician' : 'guest',
        user: user || null,
        profile: _profileWithAliases(profile) || null,
        email: user ? user.email : (profile ? profile.email : ''),
        name: profile
          ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || (user && user.email) || ''
          : (user ? user.email : '')
      };
      localStorage.setItem('cbs_session', JSON.stringify(session));
      window.CosmicAuthSession = session;
    } catch (e) { /* storage unavailable */ }
  }

  function _clearBridgedSession() {
    try { localStorage.removeItem('cbs_session'); } catch (e) {}
    window.CosmicAuthSession = null;
  }

  /* ── Auth ─────────────────────────────────────────────────── */
  async function cbsLogin(email, password) {
    const { data, error } = await _sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const profile = await getProfile(data.user.id);
    _bridgeSession(data.user, profile);
    return data.user;
  }

  async function cbsRegister({ firstName, lastName, email, phone, password }) {
    const { data, error } = await _sb.auth.signUp({
      email,
      password,
      options: { data: { first_name: firstName, last_name: lastName, phone: phone || '' } }
    });
    if (error) throw error;
    try {
      if (data.user) {
        const profile = await getProfile(data.user.id);
        _bridgeSession(data.user, profile);
      }
    } catch (e) { /* profile trigger may need a moment */ }
    return data.user;
  }

  async function cbsLogout() {
    try { await _sb.auth.signOut(); } catch (e) {}
    _clearBridgedSession();
  }

  async function cbsInitSession(onSuccess, onFail) {
    try {
      const { data: { session } } = await _sb.auth.getSession();
      if (!session || !session.user) {
        _clearBridgedSession();
        if (onFail) onFail();
        return null;
      }
      const profile = await getProfile(session.user.id);
      _bridgeSession(session.user, profile);
      if (onSuccess) await onSuccess(session.user, _profileWithAliases(profile));
      return session.user;
    } catch (e) {
      if (onFail) onFail(e);
      return null;
    }
  }

  /* ── Profiles ─────────────────────────────────────────────── */
  async function getProfile(id) {
    const { data, error } = await _sb.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return _profileWithAliases(data);
  }

  async function updateProfile(id, patch) {
    const { data, error } = await _sb.from('profiles')
      .update(Object.assign({}, patch, { updated_at: new Date().toISOString() }))
      .eq('id', id).select().maybeSingle();
    if (error) throw error;
    return _profileWithAliases(data);
  }

  async function getAllClients() {
    const { data, error } = await _sb.from('profiles')
      .select('*').eq('is_admin', false).order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(_profileWithAliases);
  }

  /* ── Appointments ─────────────────────────────────────────── */
  async function getAppointments() {
    const { data, error } = await _sb.from('appointments')
      .select('*').order('appt_date', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function getTodayAppointments() {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await _sb.from('appointments')
      .select('*').eq('appt_date', today).order('appt_time', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function addAppointment({ clientId, clientName, service, apptDate, apptTime, notes }) {
    const { data, error } = await _sb.from('appointments').insert({
      client_id: clientId || null,
      client_name: clientName || '',
      service: service || '',
      appt_date: apptDate || null,
      appt_time: apptTime || null,
      notes: notes || ''
    }).select().single();
    if (error) throw error;
    return data;
  }

  async function deleteAppointment(id) {
    const { error } = await _sb.from('appointments').delete().eq('id', id);
    if (error) throw error;
    return true;
  }

  /* ── Reorder flags ────────────────────────────────────────── */
  async function getReorderFlags(clientId) {
    const { data, error } = await _sb.from('reorder_flags')
      .select('*').eq('client_id', clientId).order('days_until_empty', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function setReorderFlag(clientId, product, days) {
    const existing = await _sb.from('reorder_flags').select('id')
      .eq('client_id', clientId).eq('product', product).maybeSingle();
    if (existing.data) {
      const { data, error } = await _sb.from('reorder_flags')
        .update({ days_until_empty: days }).eq('id', existing.data.id).select().single();
      if (error) throw error;
      return data;
    }
    const { data, error } = await _sb.from('reorder_flags')
      .insert({ client_id: clientId, product, days_until_empty: days }).select().single();
    if (error) throw error;
    return data;
  }

  async function getUrgentReorders(maxDays) {
    let q = _sb.from('reorder_flags')
      .select('*, profiles(id, email, phone, first_name, last_name)')
      .order('days_until_empty', { ascending: true });
    if (typeof maxDays === 'number' && maxDays < 9999) q = q.lte('days_until_empty', maxDays);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  /* ── Skin photos ──────────────────────────────────────────── */
  async function getSkinPhotos(clientId) {
    const { data, error } = await _sb.from('skin_photos')
      .select('*').eq('client_id', clientId).order('taken_at', { ascending: false });
    if (error) throw error;
    const rows = data || [];
    if (!rows.length) return [];
    const { data: signed } = await _sb.storage.from('skin-photos')
      .createSignedUrls(rows.map(r => r.storage_path), 60 * 60);
    return rows.map((r, i) => Object.assign(r, { url: signed && signed[i] && signed[i].signedUrl || '' }));
  }

  /* Returns [{id, url (signed), label, date, path}] oldest-first not guaranteed; caller sorts. */
  async function getMySkinPhotos() {
    const { data: { user } } = await _sb.auth.getUser();
    if (!user) return [];
    const { data, error } = await _sb.from('skin_photos')
      .select('id, storage_path, caption, taken_at').eq('client_id', user.id)
      .order('taken_at', { ascending: true });
    if (error) throw error;
    const rows = data || [];
    if (!rows.length) return [];
    const { data: signed, error: sErr } = await _sb.storage.from('skin-photos')
      .createSignedUrls(rows.map(r => r.storage_path), 60 * 60 * 6);
    if (sErr) throw sErr;
    return rows.map((r, i) => ({
      id: r.id, path: r.storage_path, label: r.caption || '',
      date: r.taken_at, url: signed[i] && signed[i].signedUrl || ''
    })).filter(p => p.url);
  }

  async function addSkinPhoto(blob, label, takenAt) {
    const { data: { user } } = await _sb.auth.getUser();
    if (!user) throw new Error('Not signed in');
    const path = user.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
    const up = await _sb.storage.from('skin-photos').upload(path, blob, { contentType: 'image/jpeg' });
    if (up.error) throw up.error;
    const row = { client_id: user.id, storage_path: path, caption: label || '' };
    if (takenAt) row.taken_at = takenAt;
    const { error } = await _sb.from('skin_photos').insert(row);
    if (error) { await _sb.storage.from('skin-photos').remove([path]); throw error; }
  }

  async function deleteSkinPhoto(id, path) {
    const { error } = await _sb.from('skin_photos').delete().eq('id', id);
    if (error) throw error;
    if (path) await _sb.storage.from('skin-photos').remove([path]);
  }

  /* AI skin analysis (Supabase edge function "analyze-skin"). base64 = JPEG without the data: prefix. */
  async function analyzeSkinPhoto(base64) {
    const { data: { session } } = await _sb.auth.getSession();
    if (!session) throw new Error('Please sign in to use skin analysis.');
    const res = await fetch(SUPABASE_URL + '/functions/v1/analyze-skin', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.access_token,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ image: base64 })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Analysis failed. Please try again.');
    return body;
  }

  /* ── Treatment history ────────────────────────────────────── */
  async function getTreatmentHistory(clientId) {
    const { data, error } = await _sb.from('treatments')
      .select('*').eq('client_id', clientId).order('treatment_date', { ascending: false });
    if (error) throw error;
    return (data || []).map(t => Object.assign(t, {
      products_used: t.products,
      date: t.treatment_date
    }));
  }

  async function saveTreatmentRecord(rec) {
    const row = {
      client_id: rec.clientId || null,
      service: rec.service || '',
      treatment_date: rec.date || rec.treatment_date || new Date().toISOString(),
      conditions: rec.conditions || '',
      pre_notes: rec.pre_notes !== undefined ? rec.pre_notes : (rec.preNotes || ''),
      post_notes: rec.post_notes !== undefined ? rec.post_notes : (rec.postNotes || ''),
      steps: rec.steps || [],
      products: rec.products !== undefined ? rec.products : (rec.products_used || ''),
      next_appointment: rec.next_appointment !== undefined ? rec.next_appointment : (rec.next || '')
    };
    const { data, error } = await _sb.from('treatments').insert(row).select().single();
    if (error) throw error;
    return data;
  }

  /* ── Esthetician notes ────────────────────────────────────── */
  async function getEstheNotes(clientId) {
    const { data, error } = await _sb.from('esthe_notes')
      .select('notes').eq('client_id', clientId).maybeSingle();
    if (error) throw error;
    return data ? data.notes : null;
  }

  async function saveEstheNotes(clientId, notes) {
    const { data, error } = await _sb.from('esthe_notes')
      .upsert({ client_id: clientId, notes, updated_at: new Date().toISOString() }, { onConflict: 'client_id' })
      .select().single();
    if (error) throw error;
    return data;
  }

  /* ── Reviews ──────────────────────────────────────────────── */
  async function getAllReviews() {
    const { data, error } = await _sb.from('reviews')
      .select('*').order('display_order', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  function _reviewPatch(obj) {
    const map = { platform: 'platform', reviewerName: 'reviewer_name', rating: 'rating', reviewText: 'review_text', reviewDate: 'review_date', isFeatured: 'is_featured', displayOrder: 'display_order' };
    const out = {};
    for (const k of Object.keys(obj)) out[map[k] || k] = obj[k];
    return out;
  }

  async function saveReview(review) {
    const { data, error } = await _sb.from('reviews').insert(_reviewPatch(review)).select().single();
    if (error) throw error;
    return data;
  }

  async function updateReview(id, patch) {
    const { data, error } = await _sb.from('reviews').update(_reviewPatch(patch)).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  async function deleteReview(id) {
    const { error } = await _sb.from('reviews').delete().eq('id', id);
    if (error) throw error;
    return true;
  }

  /* ── Orders (shop) ────────────────────────────────────────── */
  async function getMyOrders(userId) {
    try {
      const { data, error } = await _sb.from('orders')
        .select('*').eq('user_id', userId).order('created_at', { ascending: false });
      if (error) return [];
      return data || [];
    } catch (e) { return []; }
  }

  /* ── Exports ──────────────────────────────────────────────── */
  Object.assign(window, {
    cbsLogin, cbsRegister, cbsLogout, cbsInitSession,
    getProfile, updateProfile, getAllClients,
    getAppointments, addAppointment, deleteAppointment, getTodayAppointments,
    getReorderFlags, setReorderFlag, getUrgentReorders,
    getSkinPhotos, getMySkinPhotos, addSkinPhoto, deleteSkinPhoto, analyzeSkinPhoto,
    getTreatmentHistory, saveTreatmentRecord,
    getEstheNotes, saveEstheNotes,
    getAllReviews, saveReview, updateReview, deleteReview,
    getMyOrders
  });
})();
