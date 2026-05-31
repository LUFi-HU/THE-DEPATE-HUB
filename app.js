/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   VOICES PLATFORM — Application Logic
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

(() => {
  'use strict';

  // ── Config ──
  const START_HOUR = 8;
  const END_HOUR   = 22;        // exclusive — last slot is 21:00
  const DAYS       = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const FULL_DAYS  = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const BOOKABLE_HOURS = [16, 17, 20, 21];         // 4-6 PM & 8-10 PM
  const BREAK_BLOCKS = [
    { start: 12, length: 2, label: '🍽  Lunch Break', timeText: '12–14' },
    { start: 18, length: 2, label: '☕  Break', timeText: '18–20' }
  ];
  const FREE_DAYS      = [1, 3, 5];                // Tue, Thu, Sat (0-indexed Mon=0)

  function getBreakBlock(hour) {
    return BREAK_BLOCKS.find(b => hour >= b.start && hour < b.start + b.length);
  }

  function isBookable(dayIdx, hour) {
    if (FREE_DAYS.includes(dayIdx)) return false;
    if (getBreakBlock(hour)) return false;
    return BOOKABLE_HOURS.includes(hour);
  }

  function isFreeDay(dayIdx) {
    return FREE_DAYS.includes(dayIdx);
  }

  // ── State ──
  let weekOffset = 0;           // 0 = current week
  let bookings   = loadBookings();
  let pendingSlot = null;       // { day, hour, weekKey }

  // ── DOM refs ──
  const grid        = document.getElementById('schedule-grid');
  const weekLabel   = document.getElementById('week-label');
  const prevBtn     = document.getElementById('prev-week');
  const nextBtn     = document.getElementById('next-week');
  const backdrop    = document.getElementById('modal-backdrop');
  const modal       = document.getElementById('booking-modal');
  const closeBtn    = document.getElementById('modal-close');
  const form        = document.getElementById('booking-form');
  const nameInput   = document.getElementById('input-name');
  const actInput    = document.getElementById('input-activity');
  const slotInfo    = document.getElementById('modal-slot-info');
  const toast       = document.getElementById('toast');

  // ── Helpers ──
  function getMonday(offset = 0) {
    const now = new Date();
    const day = now.getDay();          // 0=Sun … 6=Sat
    const diff = (day === 0 ? -6 : 1 - day) + offset * 7;
    const mon = new Date(now);
    mon.setDate(now.getDate() + diff);
    mon.setHours(0, 0, 0, 0);
    return mon;
  }

  function formatDate(d) {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function weekKey(offset) {
    const m = getMonday(offset);
    return `${m.getFullYear()}-W${String(getISOWeek(m)).padStart(2, '0')}`;
  }

  function getISOWeek(d) {
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  }

  function slotKey(wk, dayIdx, hour) {
    return `${wk}__${dayIdx}__${hour}`;
  }

  // ── Persistence (localStorage) ──
  function loadBookings() {
    try {
      return JSON.parse(localStorage.getItem('vp_bookings') || '{}');
    } catch { return {}; }
  }

  function saveBookings() {
    localStorage.setItem('vp_bookings', JSON.stringify(bookings));
  }

  // ── Toast ──
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2800);
  }

  // ── Render Grid ──
  function renderGrid() {
    grid.innerHTML = '';

    const monday = getMonday(weekOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    weekLabel.textContent = `${formatDate(monday)} – ${formatDate(sunday)}`;

    const wk     = weekKey(weekOffset);
    const today  = new Date();
    const todayDay = today.getDay(); // 0=Sun
    const todayIdx = todayDay === 0 ? 6 : todayDay - 1; // 0=Mon

    // ── Header row ──
    const corner = document.createElement('div');
    corner.className = 'grid-header corner';
    grid.appendChild(corner);

    DAYS.forEach((d, i) => {
      const dateOfDay = new Date(monday);
      dateOfDay.setDate(monday.getDate() + i);

      const hdr = document.createElement('div');
      hdr.className = 'grid-header';
      if (weekOffset === 0 && i === todayIdx) hdr.classList.add('today');

      const daySpan = document.createElement('span');
      daySpan.textContent = d;
      const dateSpan = document.createElement('span');
      dateSpan.style.display = 'block';
      dateSpan.style.fontSize = '.7rem';
      dateSpan.style.fontWeight = '400';
      dateSpan.style.marginTop = '2px';
      dateSpan.textContent = formatDate(dateOfDay);

      hdr.appendChild(daySpan);
      hdr.appendChild(dateSpan);
      grid.appendChild(hdr);
    });

    // ── Time rows ──
    for (let h = START_HOUR; h < END_HOUR; h++) {
      const breakBlock = getBreakBlock(h);
      const isFirstBreakHour = breakBlock && (h === breakBlock.start);

      // Skip subsequent break hours entirely (merged into first)
      if (breakBlock && !isFirstBreakHour) continue;

      // time label
      const tl = document.createElement('div');
      tl.className = 'time-label';
      if (breakBlock) {
        tl.classList.add('time-label--break');
        tl.style.gridRow = `span ${breakBlock.length}`;
        tl.textContent = breakBlock.timeText;
      } else {
        tl.textContent = `${String(h).padStart(2, '0')}:00`;
      }
      grid.appendChild(tl);

      // ── Break banner (spans all 7 columns) ──
      if (isFirstBreakHour) {
        const banner = document.createElement('div');
        banner.className = 'slot slot--lunch-banner';
        banner.style.gridColumn = 'span 7';
        banner.style.gridRow = `span ${breakBlock.length}`;
        const lbl = document.createElement('span');
        lbl.className = 'break-label';
        lbl.textContent = breakBlock.label;
        banner.appendChild(lbl);
        grid.appendChild(banner);
        continue;
      }

      // day cells
      for (let d = 0; d < 7; d++) {
        const key  = slotKey(wk, d, h);
        const slot = document.createElement('div');
        slot.className = 'slot';
        slot.dataset.day  = d;
        slot.dataset.hour = h;

        // ── Free day ──
        if (isFreeDay(d)) {
          slot.classList.add('slot--free-day');
          const fdLbl = document.createElement('span');
          fdLbl.className = 'slot-freeday-label';
          fdLbl.textContent = 'Free Day';
          slot.appendChild(fdLbl);
          grid.appendChild(slot);
          continue;
        }

        // ── Non-bookable hour (free time) ──
        if (!BOOKABLE_HOURS.includes(h)) {
          slot.classList.add('slot--free');
          const ftLbl = document.createElement('span');
          ftLbl.className = 'slot-freetime-label';
          ftLbl.textContent = 'Free Time';
          slot.appendChild(ftLbl);
          grid.appendChild(slot);
          continue;
        }

        // ── Bookable slot ──
        const booking = bookings[key];
        if (booking) {
          slot.classList.add('slot--booked');
          const statusEl = document.createElement('span');
          statusEl.className = 'slot-name';
          statusEl.textContent = 'Booked';
          slot.appendChild(statusEl);
          if (booking.activity) {
            const actEl = document.createElement('span');
            actEl.className = 'slot-activity';
            actEl.textContent = booking.activity;
            slot.appendChild(actEl);
          }
        } else {
          // Show "Available" label in bookable slots
          const freeEl = document.createElement('span');
          freeEl.className = 'slot-free-label';
          freeEl.textContent = 'Available';
          slot.appendChild(freeEl);
          slot.addEventListener('click', () => openModal(d, h, wk));
        }

        grid.appendChild(slot);
      }
    }
  }

  // ── Modal ──
  function openModal(dayIdx, hour, wk) {
    pendingSlot = { day: dayIdx, hour, weekKey: wk };
    slotInfo.textContent = `${FULL_DAYS[dayIdx]}, ${String(hour).padStart(2, '0')}:00 – ${String(hour + 1).padStart(2, '0')}:00`;
    nameInput.value = '';
    actInput.value  = '';
    backdrop.classList.add('open');
    setTimeout(() => nameInput.focus(), 200);
  }

  function closeModal() {
    backdrop.classList.remove('open');
    pendingSlot = null;
  }

  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // ── Booking submit ──
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!pendingSlot) return;

    const name     = nameInput.value.trim();
    const activity = actInput.value.trim();
    if (!name) { nameInput.focus(); return; }

    const key = slotKey(pendingSlot.weekKey, pendingSlot.day, pendingSlot.hour);
    bookings[key] = { name, activity: activity || '' };
    saveBookings();

    closeModal();
    renderGrid();

    // animate the just-booked cell
    const cells = grid.querySelectorAll('.slot--booked');
    cells.forEach(c => {
      const sk = slotKey(
        weekKey(weekOffset),
        parseInt(c.dataset.day),
        parseInt(c.dataset.hour)
      );
      if (sk === key) c.classList.add('just-booked');
    });

    showToast(`✓  Booked for ${name}!`);
  });

  // ── Week navigation ──
  prevBtn.addEventListener('click', () => { weekOffset--; renderGrid(); });
  nextBtn.addEventListener('click', () => { weekOffset++; renderGrid(); });

  // ── Smooth scroll for CTA ──
  document.getElementById('cta-scroll')?.addEventListener('click', e => {
    e.preventDefault();
    document.getElementById('schedule').scrollIntoView({ behavior: 'smooth' });
  });

  // ── Seed demo bookings (only on valid bookable slots) ──
  const SCHEDULE_VERSION = 'v4'; // bump when schedule rules change

  function seedDemoData() {
    const wk = weekKey(0);
    const demos = [
      { d: 0, h: 16, name: 'Sara',    activity: 'Open mic poetry' },
      { d: 0, h: 20, name: 'Omar',    activity: 'Debate' },
      { d: 2, h: 17, name: 'Youssef', activity: 'Discussion panel' },
      { d: 2, h: 21, name: 'Noor',    activity: 'Stand-up comedy' },
      { d: 4, h: 16, name: 'Ali',     activity: 'Workshop' },
      { d: 4, h: 20, name: 'Dana',    activity: 'Dance showcase' },
      { d: 6, h: 17, name: 'Khaled',  activity: 'Film screening' },
      { d: 6, h: 21, name: 'Layla',   activity: 'Music performance' },
    ];
    demos.forEach(({ d, h, name, activity }) => {
      if (!isBookable(d, h)) return;
      const key = slotKey(wk, d, h);
      if (!bookings[key]) bookings[key] = { name, activity };
    });
    saveBookings();
  }

  // Clear stale data if schedule version changed, then re-seed
  if (localStorage.getItem('vp_version') !== SCHEDULE_VERSION) {
    bookings = {};
    localStorage.removeItem('vp_bookings');
    localStorage.setItem('vp_version', SCHEDULE_VERSION);
    seedDemoData();
  } else if (Object.keys(bookings).length === 0) {
    seedDemoData();
  }

  // ── Init ──
  renderGrid();
})();


/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GALLERY SLIDER + LIGHTBOX
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
(() => {
  'use strict';

  // ── Gallery images list ──
  const GALLERY_IMAGES = [
    { src: 'r1.png',  caption: 'Render 1'  },
    { src: 'r3.png',  caption: 'Render 3'  },
    { src: 'r4.png',  caption: 'Render 4'  },
    { src: 'r5.png',  caption: 'Render 5'  },
    { src: 'r7.png',  caption: 'Render 7'  },
    { src: 'r10.png', caption: 'Render 10' },
    { src: 'r11.png', caption: 'Render 11' },
    { src: 'r13.png', caption: 'Render 13' },
  ];

  const totalSlides = GALLERY_IMAGES.length;

  // ── DOM refs ──
  const track        = document.getElementById('slider-track');
  const dotsEl       = document.getElementById('slider-dots');
  const prevBtn      = document.getElementById('gallery-prev');
  const nextBtn      = document.getElementById('gallery-next');
  const lbBackdrop   = document.getElementById('lightbox-backdrop');
  const lbImg        = document.getElementById('lightbox-img');
  const lbCaption    = document.getElementById('lightbox-caption');
  const lbClose      = document.getElementById('lightbox-close');
  const lbPrev       = document.getElementById('lightbox-prev');
  const lbNext       = document.getElementById('lightbox-next');

  if (!track) return; // guard if elements missing

  let currentSlide   = 0;
  let lightboxIndex  = 0;

  // ── Build slides ──
  GALLERY_IMAGES.forEach((img, i) => {
    const slide = document.createElement('div');
    slide.className = 'slider-slide';
    slide.setAttribute('role', 'button');
    slide.setAttribute('tabindex', '0');
    slide.setAttribute('aria-label', `View ${img.caption}`);

    const image = document.createElement('img');
    image.src   = img.src;
    image.alt   = img.caption;
    image.loading = 'lazy';
    slide.appendChild(image);

    slide.addEventListener('click', () => openLightbox(i));
    slide.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openLightbox(i); });

    track.appendChild(slide);
  });

  // ── Build dots (one per image) ──
  for (let i = 0; i < totalSlides; i++) {
    const dot = document.createElement('button');
    dot.className = 'slider-dot';
    dot.setAttribute('aria-label', `Go to image ${i + 1}`);
    dot.addEventListener('click', () => goTo(i));
    dotsEl.appendChild(dot);
  }

  function updateSlider() {
    const slideEl    = track.children[0];
    if (!slideEl) return;
    const slideWidth = slideEl.offsetWidth;
    const gap        = 20; // matches CSS 1.25rem ≈ 20px
    // Advance exactly 1 slide per step — no skipping
    track.style.transform = `translateX(-${currentSlide * (slideWidth + gap)}px)`;

    // sync dots
    dotsEl.querySelectorAll('.slider-dot').forEach((d, i) => {
      d.classList.toggle('active', i === currentSlide);
    });

    prevBtn.disabled = currentSlide === 0;
    nextBtn.disabled = currentSlide >= totalSlides - 1;
  }

  function goTo(index) {
    currentSlide = Math.max(0, Math.min(index, totalSlides - 1));
    updateSlider();
  }

  prevBtn.addEventListener('click', () => goTo(currentSlide - 1));
  nextBtn.addEventListener('click', () => goTo(currentSlide + 1));

  // Recalculate on resize (slide width can change)
  window.addEventListener('resize', () => updateSlider());

  // Init slider
  updateSlider();

  // ── Touch / drag support ──
  let touchStartX = 0;
  let touchStartTime = 0;
  track.addEventListener('touchstart', e => {
    touchStartX    = e.touches[0].clientX;
    touchStartTime = Date.now();
  }, { passive: true });
  track.addEventListener('touchend', e => {
    const dx   = e.changedTouches[0].clientX - touchStartX;
    const dt   = Date.now() - touchStartTime;
    if (Math.abs(dx) > 50 && dt < 400) {
      dx < 0 ? goTo(currentSlide + 1) : goTo(currentSlide - 1);
    }
  }, { passive: true });

  // ── Lightbox ──
  function openLightbox(index) {
    lightboxIndex = index;
    renderLightbox();
    lbBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
    lbClose.focus();
  }

  function closeLightbox() {
    lbBackdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  function renderLightbox() {
    const item       = GALLERY_IMAGES[lightboxIndex];
    lbImg.src        = item.src;
    lbImg.alt        = item.caption;
    lbCaption.textContent = `${item.caption}  (${lightboxIndex + 1} / ${GALLERY_IMAGES.length})`;
    lbPrev.disabled  = lightboxIndex === 0;
    lbNext.disabled  = lightboxIndex === GALLERY_IMAGES.length - 1;
  }

  function lbGo(dir) {
    lightboxIndex = Math.max(0, Math.min(lightboxIndex + dir, GALLERY_IMAGES.length - 1));
    // Tiny scale-out then in for transition feel
    lbImg.style.transition = 'none';
    lbImg.style.opacity    = '0';
    lbImg.style.transform  = 'scale(.92)';
    requestAnimationFrame(() => {
      renderLightbox();
      requestAnimationFrame(() => {
        lbImg.style.transition = '';
        lbImg.style.opacity    = '1';
        lbImg.style.transform  = '';
      });
    });
  }

  lbClose.addEventListener('click', closeLightbox);
  lbPrev.addEventListener('click', () => lbGo(-1));
  lbNext.addEventListener('click', () => lbGo(1));

  lbBackdrop.addEventListener('click', e => { if (e.target === lbBackdrop) closeLightbox(); });

  document.addEventListener('keydown', e => {
    if (!lbBackdrop.classList.contains('open')) return;
    if (e.key === 'Escape')      closeLightbox();
    if (e.key === 'ArrowLeft')   lbGo(-1);
    if (e.key === 'ArrowRight')  lbGo(1);
  });

  // Lightbox swipe
  let lbTouchX = 0;
  lbBackdrop.addEventListener('touchstart', e => { lbTouchX = e.touches[0].clientX; }, { passive: true });
  lbBackdrop.addEventListener('touchend',   e => {
    const dx = e.changedTouches[0].clientX - lbTouchX;
    if (Math.abs(dx) > 50) dx < 0 ? lbGo(1) : lbGo(-1);
  }, { passive: true });
})();
