// Mobile header overflow (kebab) menu toggle.
(function () {
    document.addEventListener('DOMContentLoaded', function () {
        var toggle = document.getElementById('btn-overflow');
        var actions = document.querySelector('.header-actions');
        if (!toggle || !actions) return;

        toggle.addEventListener('click', function (e) {
            e.stopPropagation();
            var open = actions.classList.toggle('open');
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });

        document.addEventListener('click', function (e) {
            if (!e.target.closest('.header-overflow')) {
                actions.classList.remove('open');
                toggle.setAttribute('aria-expanded', 'false');
            }
        });

        actions.addEventListener('click', function () {
            actions.classList.remove('open');
            toggle.setAttribute('aria-expanded', 'false');
        });
    });
})();
