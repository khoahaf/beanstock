/* BeanStock — bộ kiểm thử hồi quy chạy trong trình duyệt (không cần cài gì).
   Cách chạy: mở app (live hoặc local qua http), dán toàn bộ file này vào DevTools Console, rồi:
     await BeanStockTest.all()        // hồi quy nghiệp vụ + QA giao diện ở viewport hiện tại
     await BeanStockTest.regression() // chỉ luồng nghiệp vụ
     await BeanStockTest.qa()         // tương phản chữ & viền điều khiển, chữ < 12px, tràn ngang, vùng chạm
     await BeanStockTest.styleHash()  // dấu vân tay computed style — dùng so trước/sau khi gộp CSS
   Dữ liệu localStorage được sao lưu trước và khôi phục sau khi chạy. */
(() => {
  const KEY = 'beanstock-v1';
  const w = ms => new Promise(r => setTimeout(r, ms));
  const $$ = s => document.querySelector(s);

  function lum(c) {
    const m = c.match(/[\d.]+/g);
    const [r, g, b] = m.slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
    return .2126 * r + .7152 * g + .0722 * b;
  }
  const ratio = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + .05) / (Math.min(A, B) + .05); };
  const opaque = c => { const m = c.match(/[\d.]+/g); return m && (m.length < 4 || +m[3] > .5); };
  function bgOf(e) { while (e) { const c = getComputedStyle(e).backgroundColor; if (opaque(c)) return c; e = e.parentElement; } return 'rgb(255,255,255)'; }
  const vis = e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none' && +c.opacity > .1; };

  async function withBackup(fn) {
    let saved = null; try { saved = localStorage.getItem(KEY); } catch (e) {}
    try { return await fn(); }
    finally {
      try { if (saved === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, saved); } catch (e) {}
      closeModal(); S = migrateState(saved ? JSON.parse(saved) : fresh()); renderAll();
    }
  }

  async function regression() {
    return withBackup(async () => {
      let pass = 0; const fail = []; const ok = (k, c) => { if (c) pass++; else fail.push(k); };
      S = fresh(); save(); renderAll(); closeModal();
      // 1 Thiết lập: chọn gói, bỏ qua, làm lại, nhập tồn
      setMode(1); $$('[data-pack="p-coffee"]').click(); ok('packChecked', $$('[data-pack="p-coffee"]').getAttribute('aria-checked') === 'false');
      $$('#next1').click(); $$('#next2').click(); ok('step3', !!$$('#skip3')); $$('#skip3').click(); ok('wizDone', S.wiz.done);
      $$('#redo').click(); $$('[data-pack="p-coffee"]').click(); $$('#next1').click(); $$('#next2').click(); $$('#fQty').value = '2'; $$('#next3').click(); ok('wizNhap', item('arabica').qty === 10);
      // 2 Báo hủy theo FEFO
      setMode(2); openWasteModal('tranchau'); await w(50); $$('[data-rs="1"]').click(); $$('#wsQty').value = '2'; $$('#wsQty').dispatchEvent(new Event('input')); $$('#mOk').click(); await w(50);
      ok('fefo', item('tranchau').batches.filter(b => b.qty > 0).length === 1 && item('tranchau').qty === 3);
      // 3 Chặn xuất lô quá hạn
      const sv = item('sua-tuoi'); sv.batches[0].expDate = addDaysISO(-1); renderAll(); ok('bannerXp', !$$('#actionBanner').hidden);
      changeQty('sua-tuoi', -1, { type: 'out' }); await w(50); ok('blockExpired', /quá hạn/.test($$('#mTitle').textContent)); closeModal();
      $$('#bnXp').click(); await w(50); ok('bnXpOpensWaste', !!$$('#wsBody')); closeModal(); sv.batches[0].expDate = addDaysISO(3); renderAll();
      // 4 Đặt hàng → nhận thiếu → đơn giao bù -B
      $$('#orderBtn').click(); await w(50); ok('orderFooter', [...$$('#sheet .acts:last-child').children].map(b => b.id).join() === 'mCancel,mRecv,mPO'); ok('why', !!$$('details.why'));
      $$('#mPO').click(); await w(100); closeModal(); const po = pendingOrders()[0]; ok('poCreated', !!po); renderAll(); ok('poLinkStrip', !!$$('#bnPo'));
      $$('#bnPo').click(); await w(50); ok('bnPoOpensReceive', /Kiểm nhận/.test($$('#mTitle').textContent));
      $$('[data-aq="0"]').value = '0'; $$('[data-aq="0"]').dispatchEvent(new Event('input')); $$('#mOk').click(); await w(50); if ($$('#mYes')) $$('#mYes').click(); await w(50);
      ok('backorder', S.orders.some(o => /-B/.test(o.id) && o.status === 'pending'));
      // 5 Thêm lô
      const kem0 = item('kem').qty; openItemModal('kem'); await w(50); document.querySelector('[data-tab="batch"]').click(); await w(50); $$('#bQty').value = '3'; $$('#bAdd').click(); await w(50); ok('addBatch', item('kem').qty === kem0 + 3); closeModal();
      // 6 Kiểm tra hợp lệ form nguyên liệu
      openItemModal('kem'); $$('#nPackRate').value = '0'; $$('#itemF').requestSubmit(); await w(50); ok('rateErr', /≥ 1/.test($$('#eRate').textContent)); closeModal();
      // 7 Nhập CSV (hợp lệ + lỗi được thông báo)
      openImportModal(); $$('#imPaste').value = 'abc'; $$('#imPaste').dispatchEvent(new Event('input')); await w(30);
      ok('importErrDisabled', $$('#mOk').disabled); ok('importErrAnnounced', !!$$('#imPrev').closest('[aria-live],[role=status],[role=alert]') || $$('#imPrev').matches('[aria-live],[role=status],[role=alert]'));
      $$('#imPaste').value = 'Tên nguyên liệu,Tồn hiện tại,Định mức tối thiểu\nBột cacao,3,2'; $$('#imPaste').dispatchEvent(new Event('input')); $$('#mOk').click(); await w(50); ok('import', S.items.some(i => i.name === 'Bột cacao'));
      // 8 Sao lưu / khôi phục JSON
      const snapJ = JSON.stringify(S); openDataModal(); $$('#bkPaste').value = snapJ; $$('#bkRestore').click(); await w(50); ok('restore', S.items.length === JSON.parse(snapJ).items.length);
      // 9 Quầy bar: stepper nháp → lưu; xác nhận nhanh; món rủi ro buộc đếm; menu bàn phím
      setMode(3); await w(100); m3Scope = 'fast'; renderCounts();
      const f = fastItems().find(i => !risky(i)); const st = document.querySelector(`.stepper [data-adj="${f.id}"][data-d="1"]`); st.focus(); st.click(); await w(30);
      ok('draft', m3Draft[f.id] === f.qty + 1); ok('refocus', document.activeElement.matches(`.stepper [data-adj="${f.id}"][data-d="1"]`));
      document.querySelector(`[data-dsave="${f.id}"]`).click(); await w(50); ok('countLog', S.logs[0].type === 'check' && S.touchedHow[f.id] === 'count');
      const g = fastItems().find(i => !risky(i) && !S.touched.includes(i.id)); if (g) { document.querySelector(`[data-match="${g.id}"]`).click(); await w(30); ok('quick', S.touchedHow[g.id] === 'quick'); } else ok('quick-skip', true);
      const rk = fastItems().find(i => risky(i) && !S.touched.includes(i.id)); document.querySelector(`[data-match="${rk.id}"]`).click(); await w(30); ok('riskyForced', /thực tế/.test($$('#mTitle').textContent)); closeModal();
      const mb = document.querySelector(`[data-menu="m3m-${rk.id}"]`); mb.click(); await w(30); const menu = document.getElementById('m3m-' + rk.id);
      ok('menuOpen', !menu.hidden && mb.getAttribute('aria-expanded') === 'true'); ok('menuFocus', document.activeElement.getAttribute('role') === 'menuitem');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); ok('arrow', document.activeElement === menu.querySelectorAll('[role=menuitem]')[1]);
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await w(30); ok('escClose', menu.hidden && document.activeElement === mb); ok('modalNotOpened', !$$('#modal').classList.contains('on'));
      mb.click(); await w(30); menu.querySelector('[data-use]').click(); await w(50); ok('menuUse', /Xuất dùng/.test($$('#mTitle').textContent)); $$('#useIn').value = '1'; $$('#mOk').click(); await w(50); ok('useLogged', S.logs[0].type === 'out');
      document.body.click();
      const mb2 = document.querySelector(`[data-menu="m3m-${rk.id}"]`); mb2.click(); await w(30); document.getElementById('m3m-' + rk.id).querySelector('[data-d="5"]').click(); await w(50);
      ok('plus5', m3Draft[rk.id] === item(rk.id).qty + 5); ok('menuClosedAfter', !document.querySelector('.menu:not([hidden])'));
      delete m3Draft[rk.id]; renderCountList();
      // 10 Chốt ca
      $$('#finishBtn').click(); await w(50); if ($$('#mOk')) $$('#mOk').click(); await w(80); ok('shift', S.logs[0].type === 'shift' && !!S.lastShift); closeModal(); ok('shiftTime', /Bắt đầu/.test($$('#shiftTime').textContent));
      // 11 Quét mã + lệnh giọng nói
      $$('#scanBtn').click(); await w(50); $$('#scanQ').value = 'MK-DLM'; $$('#scanQ').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); await w(30); ok('scanPick', !!$$('#scQty')); closeModal();
      $$('#sampleCmd').click(); await w(50); ok('voice', /Đã hiểu/.test($$('#cmdPreview').textContent)); closeModal();
      // 12 Hoàn tác + nhật ký
      changeQty('da', 1, { type: 'in' }); const q = item('da').qty; $$('#toastUndo').click(); await w(30); ok('undo', item('da').qty === q - 1);
      openLogModal('all'); ok('logModal', document.querySelectorAll('#lgList li').length > 0); closeModal();
      // 13 Bảng: tên mở hồ sơ; lọc/tìm không có kết quả hiện trạng thái rỗng
      setMode(2); document.querySelector('.namebtn').click(); await w(30); ok('nameOpens', !!$$('.mtabs')); closeModal();
      $$('#q').value = 'zzzz-khong-co'; $$('#q').dispatchEvent(new Event('input')); await w(250); ok('emptyState', /Không|không/.test($$('#tbody').textContent) && !document.querySelector('#tbody .namebtn'));
      resetFilters(); renderTable();
      // 14 Bố cục POS tự động theo màn hình
      ok('autoPos', $$('#device').classList.contains('pos') === (innerWidth >= 1024));
      // 15 Kiosk bật/tắt
      setMode(3); setKiosk(true); ok('kioskOn', document.body.classList.contains('kiosk')); setMode(2); ok('kioskOffOnLeave', !document.body.classList.contains('kiosk'));
      return { pass, fail, total: pass + fail.length };
    });
  }

  async function qa() {
    const R = { W: innerWidth }; let minCR = 99; const low = [], tiny = [], ovf = [], small = [], ctl = [];
    const mode0 = typeof S !== 'undefined' && S.mode;
    for (const m of [1, 2, 3]) {
      setMode(m); await w(350);
      if (document.documentElement.scrollWidth > innerWidth) ovf.push(m);
      const sideHidden = getComputedStyle(document.querySelector('.side')).visibility === 'hidden';
      for (const e of document.querySelectorAll('#v' + m + ' *, .side *, .mbar *')) {
        if (!vis(e) || ![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
        if (e.closest('.order-line.off') || (sideHidden && e.closest('.side'))) continue;
        const c = getComputedStyle(e), cr = ratio(c.color, bgOf(e)), fs = parseFloat(c.fontSize);
        const big = fs >= 24 || (fs >= 18.66 && +c.fontWeight >= 700);
        if (cr < minCR) minCR = cr; if (cr < (big ? 3 : 4.5)) low.push(e.className + ' "' + e.textContent.trim().slice(0, 14) + '" ' + cr.toFixed(2)); if (fs < 12) tiny.push(e.className);
      }
      // WCAG 1.4.11: ô nhập/select phải có ranh giới ≥ 3:1 với nền xung quanh
      for (const e of document.querySelectorAll('#v' + m + ' input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]), #v' + m + ' select, #v' + m + ' textarea, #v' + m + ' .search')) {
        if (!vis(e)) continue; const c = getComputedStyle(e); if (e.closest('.search') && e.tagName === 'INPUT') continue;
        const outer = bgOf(e.parentElement); const v = Math.max(parseFloat(c.borderTopWidth) > 0 ? ratio(c.borderTopColor, outer) : 1, opaque(c.backgroundColor) ? ratio(c.backgroundColor, outer) : 1);
        if (v < 3) ctl.push((e.id || e.className || e.tagName) + ' ' + v.toFixed(2));
      }
      if (innerWidth < 1024) for (const e of document.querySelectorAll('#v' + m + ' button,#v' + m + ' input,#v' + m + ' select,.mbar button')) {
        if (!vis(e) || e.matches('.namebtn,.lnk,.kpi,.pack')) continue; const h = e.getBoundingClientRect().height; if (h < 44) small.push((e.id || e.className) + ':' + Math.round(h));
      }
    }
    if (mode0) setMode(mode0);
    return Object.assign(R, { minContrast: +minCR.toFixed(2), lowText: [...new Set(low)].slice(0, 10), controlBoundaryUnder3: [...new Set(ctl)].slice(0, 10), tinyText: [...new Set(tiny)].slice(0, 5), overflowModes: ovf, touchUnder44: [...new Set(small)].slice(0, 10) });
  }

  // Dấu vân tay computed style của mọi phần tử hiển thị ở 3 tab (so trước/sau khi gộp CSS).
  async function styleHash(props = ['color', 'background-color', 'border-top-color', 'border-top-width', 'border-radius', 'font-size', 'font-weight', 'font-family', 'line-height', 'padding-top', 'padding-left', 'margin-top', 'display', 'grid-template-columns', 'gap', 'box-shadow', 'width', 'height', 'position']) {
    const out = {}; const mode0 = S.mode;
    for (const m of [1, 2, 3]) {
      setMode(m); await w(400); let h = 0, n = 0;
      for (const e of document.querySelectorAll('body *')) {
        if (!vis(e)) continue; const c = getComputedStyle(e); const s = props.map(p => c.getPropertyValue(p)).join('|') + e.tagName + e.className;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; n++;
      }
      out['tab' + m] = n + ':' + (h >>> 0).toString(16);
    }
    setMode(mode0); return out;
  }

  // So từng phần tử giữa 2 bản HTML cùng origin (VD bản backup và bản mới) ở một độ rộng — trả về danh sách khác biệt computed style.
  async function compareCss(oldUrl, newUrl, width = 1280) {
    const props = ['color', 'background-color', 'border-top-color', 'border-top-width', 'border-left-color', 'border-radius', 'font-size', 'font-weight', 'font-family', 'line-height', 'padding-top', 'padding-left', 'margin-top', 'display', 'grid-template-columns', 'gap', 'box-shadow', 'width', 'height', 'position', 'opacity'];
    async function col(url) {
      const f = document.createElement('iframe'); f.style.cssText = `position:fixed;left:-5000px;top:0;width:${width}px;height:800px`; f.src = url; document.body.appendChild(f);
      await new Promise(r => f.onload = r); await w(1200); const W = f.contentWindow, D = f.contentDocument, out = [];
      for (const m of [1, 2, 3]) { W.setMode(m); await w(400); for (const e of D.querySelectorAll('body *')) { const r = e.getBoundingClientRect(), c = W.getComputedStyle(e); if (!r.width || c.display === 'none' || c.visibility === 'hidden') continue; out.push(m + ' ' + e.tagName + '#' + e.id + '.' + e.className + ' :: ' + props.map(p => p + '=' + c.getPropertyValue(p)).join(';')); } }
      f.remove(); return out;
    }
    const A = await col(oldUrl), B = await col(newUrl), diffs = [];
    for (let i = 0; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) diffs.push([A[i], B[i]]);
    return { width, nA: A.length, nB: B.length, diffCount: diffs.length, diffs: diffs.slice(0, 15) };
  }

  async function all() { const r = await regression(); const q = await qa(); return { regression: r, qa: q }; }
  window.BeanStockTest = { regression, qa, styleHash, compareCss, all };
})();
