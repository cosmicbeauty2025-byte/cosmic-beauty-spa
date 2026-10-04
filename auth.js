/* ============================================================
   Cosmic Beauty Spa — CosmicAuth
   Lightweight session shim shared by all pages.
   Session is created/refreshed by supabase-client.js (_bridgeSession).
   Exposes: CosmicAuth.getSession(), CosmicAuth.injectAuthBar(roles, pageKey),
            CosmicAuth.logout()
   ============================================================ */
(function () {
  var PROTECTED = { dashboard: 'esthetician', inventory: 'esthetician', portal: true };

  function getSession() {
    try {
      var raw = localStorage.getItem('cbs_session');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return window.CosmicAuthSession || null;
  }

  async function logout() {
    try { if (typeof cbsLogout === 'function') await cbsLogout(); } catch (e) {}
    try { localStorage.removeItem('cbs_session'); } catch (e) {}
    window.CosmicAuthSession = null;
    window.location.href = 'index.html';
  }

  function _link(href, label) {
    return '<a href="' + href + '" style="color:#c4b5fd;text-decoration:none;font-size:11px;letter-spacing:.08em;text-transform:uppercase;">' + label + '</a>';
  }

  function injectAuthBar(roles, pageKey) {
    var s = getSession();

    // Access control: protected pages require a session (and the right role)
    if (PROTECTED[pageKey]) {
      if (!s) { window.location.replace('index.html'); return; }
      var need = PROTECTED[pageKey];
      if (need !== true && s.role !== need) { window.location.replace('index.html'); return; }
    }
    if (!s || (roles && roles.indexOf(s.role) === -1)) return;

    if (document.getElementById('cbs-auth-bar')) return;

    var isEsth = s.role === 'esthetician';
    var links =
      _link('skincare-cosmos.html', 'Home') +
      _link('bioelements-shop.html', 'Shop') +
      _link('client-portal.html', 'Portal') +
      (isEsth ? _link('esthetician-dashboard.html', 'Dashboard') + _link('inventory-manager.html', 'Inventory') : '');

    var bar = document.createElement('div');
    bar.id = 'cbs-auth-bar';
    bar.innerHTML =
      '<span style="color:#a855f7;font-size:12px;">✦</span>' +
      '<span style="font-size:11px;color:rgba(232,213,255,.75);letter-spacing:.05em;">' +
        (s.name || s.email || 'Signed in') + (isEsth ? ' · Esthetician' : '') +
      '</span>' +
      '<span style="width:1px;height:14px;background:rgba(168,85,247,.25);"></span>' +
      links +
      '<span style="width:1px;height:14px;background:rgba(168,85,247,.25);"></span>' +
      '<a href="#" id="cbs-logout-link" style="color:#f0abfc;text-decoration:none;font-size:11px;letter-spacing:.08em;text-transform:uppercase;">Sign Out</a>';

    Object.assign(bar.style, {
      position: 'fixed', bottom: '18px', left: '50%', transform: 'translateX(-50%)',
      zIndex: '9999', display: 'flex', alignItems: 'center', gap: '14px',
      padding: '10px 18px', borderRadius: '999px',
      background: 'rgba(10,8,32,.88)', border: '1px solid rgba(168,85,247,.35)',
      boxShadow: '0 8px 32px rgba(107,47,160,.35)', backdropFilter: 'blur(12px)',
      fontFamily: "'DM Sans', sans-serif", maxWidth: '92vw', flexWrap: 'wrap', justifyContent: 'center'
    });

    (document.body || document.documentElement).appendChild(bar);
    document.getElementById('cbs-logout-link').addEventListener('click', function (e) {
      e.preventDefault();
      logout();
    });
  }

  window.CosmicAuth = { getSession: getSession, injectAuthBar: injectAuthBar, logout: logout };
})();
