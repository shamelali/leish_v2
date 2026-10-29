/* ==========================================================================
   Duta Integra — merged site behaviour
   No dependencies. Everything below degrades gracefully without JS.
   ========================================================================== */

(function () {
  "use strict";

  var LANGS = ["en", "ms"];
  var storedLang = null;
  try {
    storedLang = window.localStorage.getItem("di-lang");
  } catch (err) {
    storedLang = null;
  }
  var currentLang = LANGS.indexOf(storedLang) > -1 ? storedLang : "en";

  /* ── language ─────────────────────────────────────────── */

  function applyLang(lang) {
    if (LANGS.indexOf(lang) === -1) lang = "en";
    currentLang = lang;
    document.documentElement.setAttribute("lang", lang === "ms" ? "ms" : "en");

    document.querySelectorAll("[data-en]").forEach(function (el) {
      var value = lang === "ms" ? el.getAttribute("data-ms") : el.getAttribute("data-en");
      if (value !== null) el.innerHTML = value;
    });

    document.querySelectorAll("[data-en-placeholder]").forEach(function (el) {
      var value =
        lang === "ms"
          ? el.getAttribute("data-ms-placeholder")
          : el.getAttribute("data-en-placeholder");
      if (value !== null) el.setAttribute("placeholder", value);
    });

    document.querySelectorAll("[data-lang]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.getAttribute("data-lang") === lang));
    });

    try {
      window.localStorage.setItem("di-lang", lang);
    } catch (err) {
      /* private mode — ignore */
    }
  }

  document.querySelectorAll("[data-lang]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      applyLang(btn.getAttribute("data-lang"));
    });
  });

  if (currentLang === "ms") applyLang("ms");

  /* ── mobile nav ───────────────────────────────────────── */

  var nav = document.querySelector(".nav");
  var navToggle = document.querySelector(".nav__toggle");
  if (nav && navToggle) {
    navToggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(open));
    });
    nav.querySelectorAll(".nav__links a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("is-open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ── reveal on scroll ─────────────────────────────────── */

  var reveals = Array.prototype.slice.call(document.querySelectorAll(".reveal"));

  if ("IntersectionObserver" in window && reveals.length) {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          var siblings = Array.prototype.slice.call(
            el.parentElement ? el.parentElement.children : []
          );
          var index = siblings.indexOf(el);
          el.style.transitionDelay = Math.min(index, 6) * 70 + "ms";
          el.classList.add("is-in");
          revealObserver.unobserve(el);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    reveals.forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    reveals.forEach(function (el) {
      el.classList.add("is-in");
    });
  }

  /* ── animated stats ───────────────────────────────────── */

  function runCounter(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    if (isNaN(target)) return;
    var decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
    var prefix = el.getAttribute("data-prefix") || "";
    var suffix = el.getAttribute("data-suffix") || "";
    var duration = 1100;
    var start = null;

    function frame(ts) {
      if (start === null) start = ts;
      var progress = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var value = target * eased;
      var text =
        decimals > 0
          ? value.toFixed(decimals)
          : Math.round(value).toLocaleString("en-MY");
      el.textContent = prefix + text + suffix;
      if (progress < 1) window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  }

  var counters = Array.prototype.slice.call(document.querySelectorAll("[data-count]"));
  var reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if ("IntersectionObserver" in window && counters.length && !reducedMotion) {
    var counterObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          runCounter(entry.target);
          counterObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach(function (el) {
      counterObserver.observe(el);
    });
  }

  /* ── pipeline tabs (homepage) ─────────────────────────── */

  var stageButtons = Array.prototype.slice.call(document.querySelectorAll(".pipe-item[data-stage]"));

  function selectStage(index) {
    stageButtons.forEach(function (btn) {
      btn.setAttribute("aria-selected", String(btn.getAttribute("data-stage") === String(index)));
    });
    document.querySelectorAll("[data-panel]").forEach(function (panel) {
      panel.classList.toggle("is-active", panel.getAttribute("data-panel") === String(index));
    });
  }

  stageButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      selectStage(btn.getAttribute("data-stage"));
    });
    btn.addEventListener("keydown", function (event) {
      var i = stageButtons.indexOf(btn);
      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        var next = stageButtons[(i + 1) % stageButtons.length];
        next.focus();
        selectStage(next.getAttribute("data-stage"));
      }
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        var prev = stageButtons[(i - 1 + stageButtons.length) % stageButtons.length];
        prev.focus();
        selectStage(prev.getAttribute("data-stage"));
      }
    });
  });

  /* ── sample-email language toggle ─────────────────────── */

  document.querySelectorAll("[data-mail]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var lang = btn.getAttribute("data-mail");
      document.querySelectorAll("[data-mail]").forEach(function (other) {
        other.setAttribute("aria-pressed", String(other === btn));
      });
      document.querySelectorAll("[data-mail-body]").forEach(function (body) {
        body.hidden = body.getAttribute("data-mail-body") !== lang;
      });
    });
  });

  /* ── carousel ─────────────────────────────────────────── */

  document.querySelectorAll("[data-carousel-root]").forEach(function (root) {
    var track = root.querySelector("[data-carousel-track]");
    if (!track) return;
    var prev = document.querySelector('[data-carousel="prev"]');
    var next = document.querySelector('[data-carousel="next"]');
    var step = function () {
      return Math.max(280, track.clientWidth * 0.7);
    };
    if (prev)
      prev.addEventListener("click", function () {
        track.scrollBy({ left: -step(), behavior: "smooth" });
      });
    if (next)
      next.addEventListener("click", function () {
        track.scrollBy({ left: step(), behavior: "smooth" });
      });
  });

  /* ── outbound calculator ──────────────────────────────── */

  var slider = document.querySelector("#calc-emails");

  if (slider) {
    var outEmails = document.querySelector("[data-calc-emails]");
    var outCost = document.querySelector("[data-calc-cost]");
    var outLeads = document.querySelector("[data-calc-leads]");
    var outMeetings = document.querySelector("[data-calc-meetings]");
    var outCpl = document.querySelector("[data-calc-cpl]");

    var COST_PER_EMAIL = 0.15;
    var LEAD_RATE_LOW = 0.002;
    var LEAD_RATE_HIGH = 0.008;
    var MEETING_RATE_LOW = 0.1;
    var MEETING_RATE_HIGH = 0.25;

    var rm = function (value) {
      var decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
      return (
        "RM " +
        value.toLocaleString("en-MY", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      );
    };

    function round(value, decimals) {
      var factor = Math.pow(10, decimals);
      return Math.round(value * factor) / factor;
    }

    function update() {
      var emails = parseInt(slider.value, 10);
      var cost = emails * COST_PER_EMAIL;
      var leadsLow = Math.max(1, Math.round(emails * LEAD_RATE_LOW));
      var leadsHigh = Math.max(leadsLow + 1, Math.round(emails * LEAD_RATE_HIGH));
      var meetsLow = Math.max(1, Math.round(leadsLow * MEETING_RATE_LOW));
      var meetsHigh = Math.max(meetsLow + 1, Math.round(leadsHigh * MEETING_RATE_HIGH));
      var cpl = cost / ((leadsLow + leadsHigh) / 2);

      if (outEmails) outEmails.textContent = emails.toLocaleString("en-MY");
      if (outCost) outCost.textContent = rm(cost);
      if (outLeads) outLeads.textContent = leadsLow + " – " + leadsHigh;
      if (outMeetings) outMeetings.textContent = meetsLow + " – " + meetsHigh;
      if (outCpl) outCpl.textContent = rm(round(cpl, cpl >= 10 ? 1 : 2));
    }

    slider.addEventListener("input", update);
    update();
  }

  /* ── forms ────────────────────────────────────────────── */
  /* Both forms validate in the browser, then hand off to the endpoint in
     data-endpoint. With no endpoint configured (the static preview), they
     confirm inline so the flow can still be reviewed end to end. */

  function wireForm(selector, options) {
    var form = document.querySelector(selector);
    if (!form) return;
    options = options || {};

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var invalid = null;
      form.querySelectorAll("[required]").forEach(function (field) {
        var isCheckbox = field.type === "checkbox";
        var empty =
          !isCheckbox && field.value.trim() === "" ? true : isCheckbox ? !field.checked : false;
        field.setAttribute("aria-invalid", String(empty));
        if (empty && !invalid) invalid = field;
      });

      if (invalid) {
        if (typeof invalid.focus === "function") invalid.focus();
        if (typeof invalid.scrollIntoView === "function") {
          invalid.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        return;
      }

      var endpoint = form.getAttribute("data-endpoint");
      var status = form.querySelector("[data-form-status]");
      var message = currentLang === "ms" ? options.ms : options.en;

      var done = function () {
        if (status && message) {
          status.textContent = message;
          status.classList.add("is-shown");
        }
        if (options.inlineConfirmation) {
          var wrapper = document.getElementById(options.inlineConfirmation);
          if (wrapper) wrapper.classList.add("is-done");
        } else {
          form.reset();
        }
      };

      if (!endpoint) {
        done();
        return;
      }

      var payload = {};
      new FormData(form).forEach(function (value, key) {
        payload[key] = value;
      });

      window
        .fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        .then(function (res) {
          if (!res.ok) throw new Error("Request failed");
          done();
        })
        .catch(function () {
          if (status) {
            status.textContent =
              currentLang === "ms"
                ? "Maaf, penghantaran gagal. Sila WhatsApp kami di +60 11-5403 4051."
                : "Sorry, that didn't send. Please WhatsApp us on +60 11-5403 4051.";
            status.classList.add("is-shown");
          }
        });
    });
  }

  wireForm("[data-lead-form]", { inlineConfirmation: "hero-lead" });

  wireForm("[data-audit-form]", {
    en: "Request received — we'll email your scorecard within one business day. Urgent? WhatsApp +60 11-5403 4051.",
    ms: "Permintaan diterima — kad skor anda akan dihantar melalui e-mel dalam satu hari bekerja. Segera? WhatsApp +60 11-5403 4051.",
  });

  wireForm("[data-pilot-form]", {
    en: "Pilot request received — we'll come back with segments, volume plan and cost per lead within one business day.",
    ms: "Permintaan perintis diterima — kami akan kembali dengan segmen, pelan jumlah dan kos setiap lead dalam satu hari bekerja.",
  });

  /* ── current year in footers ──────────────────────────── */

  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });
})();
