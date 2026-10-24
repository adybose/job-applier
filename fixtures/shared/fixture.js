// Shared behavior for form fixtures. Plain script, no dependencies, no network.
(function () {
  // 1. Submit buttons record clicks and never navigate (spec 10 R-TE-4).
  window.__submitClicks = 0;
  window.__submitEvents = 0;
  document.addEventListener(
    'click',
    function (e) {
      var target = e.target instanceof Element ? e.target.closest('[data-submit]') : null;
      if (target) {
        window.__submitClicks++;
        e.preventDefault();
      }
    },
    true,
  );
  document.addEventListener(
    'submit',
    function (e) {
      window.__submitEvents++;
      e.preventDefault();
    },
    true,
  );

  // 2. React-like controlled inputs: <input data-controlled>.
  // Like React's _valueTracker, an instance-level value setter records the "tracked" value.
  // An input event where el.value equals the tracked value is ignored, so `el.value = x` followed by
  // dispatching input does NOT update state. Only the native prototype setter (what React-safe fill
  // uses) changes the value without touching the tracker. On blur the "component" re-renders from state.
  function controlled(el) {
    var proto = Object.getPrototypeOf(el);
    var native = Object.getOwnPropertyDescriptor(proto, 'value');
    var tracked = native.get.call(el);
    var state = tracked;
    Object.defineProperty(el, 'value', {
      configurable: true,
      get: function () {
        return native.get.call(el);
      },
      set: function (v) {
        tracked = String(v);
        native.set.call(el, v);
      },
    });
    var mirror = document.querySelector('[data-mirror-for="' + el.id + '"]');
    function render() {
      native.set.call(el, state);
      tracked = state;
      if (mirror) mirror.textContent = state;
      el.dataset.state = state;
    }
    el.addEventListener('input', function () {
      var current = native.get.call(el);
      if (current === tracked) return; // React would bail out here.
      state = current;
      tracked = current;
      if (mirror) mirror.textContent = state;
      el.dataset.state = state;
    });
    el.addEventListener('blur', render);
    render();
  }
  document.querySelectorAll('[data-controlled]').forEach(controlled);

  // 3. React-Select-like combobox: <div data-combobox data-options="A|B|C" id=...>.
  function combobox(root) {
    var options = (root.dataset.options || '').split('|');
    var labelId = root.dataset.labelledby;
    root.classList.add('select__container');
    root.innerHTML =
      '<div class="select__control">' +
      '<div class="select__value-container"><div class="select__placeholder">Select...</div>' +
      '<input class="select__input" role="combobox" aria-autocomplete="list" aria-expanded="false" ' +
      (labelId ? 'aria-labelledby="' + labelId + '" ' : '') +
      'autocomplete="off" type="text" value=""></div>' +
      '<div class="select__indicators"><span class="select__indicator">▾</span></div></div>' +
      '<input type="hidden" name="' +
      (root.dataset.name || '') +
      '" value="">';
    var input = root.querySelector('input[role=combobox]');
    var hidden = root.querySelector('input[type=hidden]');
    var placeholder = root.querySelector('.select__placeholder');
    var menu = null;
    function close() {
      if (menu) menu.remove();
      menu = null;
      input.setAttribute('aria-expanded', 'false');
    }
    function open() {
      close();
      menu = document.createElement('div');
      menu.className = 'select__menu';
      menu.setAttribute('role', 'listbox');
      menu.id = root.id + '-listbox';
      input.setAttribute('aria-controls', menu.id);
      var filter = input.value.toLowerCase();
      options
        .filter(function (o) {
          return o.toLowerCase().indexOf(filter) !== -1;
        })
        .forEach(function (o, i) {
          var opt = document.createElement('div');
          opt.className = 'select__option';
          opt.setAttribute('role', 'option');
          opt.id = root.id + '-option-' + i;
          opt.textContent = o;
          opt.addEventListener('mousedown', function (e) {
            e.preventDefault();
            choose(o);
          });
          opt.addEventListener('click', function () {
            choose(o);
          });
          menu.appendChild(opt);
        });
      root.appendChild(menu);
      input.setAttribute('aria-expanded', 'true');
    }
    function choose(o) {
      hidden.value = o;
      input.value = '';
      placeholder.textContent = o;
      placeholder.className = 'select__single-value';
      root.dataset.value = o;
      close();
      root.dispatchEvent(new Event('change', { bubbles: true }));
    }
    root.querySelector('.select__control').addEventListener('mousedown', function (e) {
      if (e.target !== input) e.preventDefault();
      input.focus();
      open();
    });
    input.addEventListener('focus', open);
    input.addEventListener('input', open);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter' && menu && menu.firstChild) {
        e.preventDefault();
        choose(menu.firstChild.textContent);
      }
    });
    input.addEventListener('blur', function () {
      setTimeout(close, 0);
    });
  }
  document.querySelectorAll('[data-combobox]').forEach(combobox);

  // 4. Yes/No toggle buttons (Ashby style): <div data-toggle data-name=...><button>Yes</button><button>No</button></div>.
  document.querySelectorAll('[data-toggle]').forEach(function (group) {
    var hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = group.dataset.name || '';
    group.appendChild(hidden);
    group.querySelectorAll('button').forEach(function (b) {
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        group.querySelectorAll('button').forEach(function (x) {
          x.setAttribute('aria-pressed', String(x === b));
        });
        hidden.value = b.textContent.trim();
        group.dataset.value = hidden.value;
      });
    });
  });
})();
