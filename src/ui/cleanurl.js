// Clean links: removes tracking junk (utm_ tags, click IDs, share trackers) from an address,
// leaving what the page needs. Used when copying links. Loaded by the sidebar UI as a script
// (window.cleanUrl) and by the main process as a module.
(function () {
  const PREFIXES = ['utm_', 'utm-', 'pk_', 'mtm_', 'hsa_', 'oly_', 'vero_', 'ga_'];
  const NAMES = new Set(['fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'mc_cid', 'mc_eid', 'yclid',
    'igshid', 'igsh', '_hsenc', '_hsmi', 'hsctatrack', 'mkt_tok', 'ttclid', 'twclid', 'li_fat_id', 'epik', 'rdt_cid',
    'srsltid', '_ga', '_gl', 'spm', 'scm', 'ref_src', 'ref_url', 'wt_mc', 'cmpid', 'sc_cid', 's_cid', 'trk', 'trkcampaign',
    'mibextid', '__twitter_impression', 'at_campaign', 'at_medium', 'zanpid', 'irclickid', 'ved', 'ei', 'sxsrf']);
  // Per site: share/tracking parameters that mean nothing else there.
  const SITE = [
    [/(^|\.)(youtube\.com|youtu\.be)$/, ['si', 'feature', 'pp']],
    [/(^|\.)(x\.com|twitter\.com)$/, ['s', 't']],
    [/(^|\.)(open\.)?spotify\.com$/, ['si', 'context', 'nd']],
    [/(^|\.)instagram\.com$/, ['igsh', 'img_index']],
    [/(^|\.)tiktok\.com$/, ['is_from_webapp', 'sender_device', 'web_id', '_r', '_t', 'share_app_id', 'share_link_id', 'u_code']],
    [/(^|\.)reddit\.com$/, ['share_id', 'rdt', 'context']],
    [/(^|\.)amazon\.[a-z.]+$/, ['ref', 'ref_', 'pd_rd_r', 'pd_rd_w', 'pd_rd_wg', 'pd_rd_i', 'pf_rd_r', 'pf_rd_p', 'pf_rd_s', 'pf_rd_t', 'pf_rd_i', 'pf_rd_m', 'psc', 'content-id', 'crid', 'sprefix', 'qid', 'sr', 'dib', 'dib_tag', 'linkcode', 'tag', 'linkid', 'camp', 'creative', 'th']],
    [/(^|\.)linkedin\.com$/, ['trackingid', 'refid', 'lipi', 'midtoken', 'midsig', 'trk', 'trkemail', 'eid', 'otptoken']],
    [/(^|\.)google\.[a-z.]+$/, ['oq', 'gs_lcrp', 'gs_lp', 'sclient', 'sourceid', 'ie', 'uact', 'sca_esv', 'sca_upv', 'iflsig', 'rlz']],
  ];
  function cleanUrl(input) {
    let u; try { u = new URL(input); } catch { return input; }
    if (!/^https?:$/.test(u.protocol)) return input;
    const host = u.hostname.toLowerCase();
    const site = SITE.filter(([re]) => re.test(host)).flatMap(([, names]) => names);
    for (const key of [...u.searchParams.keys()]) {
      const k = key.toLowerCase();
      if (NAMES.has(k) || PREFIXES.some(p => k.startsWith(p)) || site.includes(k)) u.searchParams.delete(key);
    }
    if (/(^|\.)amazon\.[a-z.]+$/.test(host)) u.pathname = u.pathname.replace(/\/ref=[^/]*$/, '');
    // Tracking in the fragment (#utm_source=...), when that's all it holds.
    if (/^#?(utm_|xtor=|at_)/i.test(u.hash)) u.hash = '';
    let out = u.toString();
    if (!u.search && out.endsWith('?')) out = out.slice(0, -1);
    return out;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = cleanUrl;
  else window.cleanUrl = cleanUrl;
})();
